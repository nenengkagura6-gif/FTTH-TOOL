"""
Engine for APD HPDB Processing
Supports both KML and KMZ files
"""
import io
import os
import re
import math
import time
import zipfile
import requests
from typing import Dict, List, Tuple, Any, Optional
from lxml import etree
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Border, Side
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

from utils.commons import haversine, safe_localname, load_kml_bytes, fdt_number
from utils.report import ProcessReport
from utils.template_validator import validate_hpdb_template
from collections import defaultdict

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
# Kebijakan Nominatim mewajibkan User-Agent yang mengidentifikasi aplikasi
# beserta kontaknya. UA yang menyamar sebagai browser berisiko diblokir —
# dan blokirnya berlaku untuk semua pengguna yang berbagi IP server ini.
NOMINATIM_HEADERS = {"User-Agent": "ftth-tool-hpdb/1.3 (+https://ftthtools.my.id)"}
NOMINATIM_DELAY_S = 1.1
# Geocoding dilakukan per FAT (bukan sekali per sheet). Batasnya menjaga
# lama proses tetap wajar dengan laju 1 permintaan/detik.
MAX_GEOCODE_PER_JOB = int(os.environ.get("HPDB_MAX_GEOCODE", "80"))

FAT_ID_RE = re.compile(r'\b([A-Z]\d{1,2})\b', re.IGNORECASE)

# (jumlah FAT maksimum per line, kapasitas kabel)
CABLE_CAPACITY = [(10, "24C/2T"), (15, "36C/3T"), (20, "48C/4T"),
                  (30, "72C/6T"), (40, "96C/8T")]
FATS_PER_TUBE = 5
PORTS_PER_TRAY = 8


def get_fdt_name_from_folder_path(folder_path: str) -> str:
    """Extract FDT name from folder path (e.g., 'LINE A FDT 02/HP COVER' -> 'FDT 02')"""
    return f"FDT {(fdt_number(folder_path) or 1):02d}"


def is_skipped_core(core: int) -> bool:
    """Dua core terakhir setiap tube 12-core dicadangkan (11, 12, 23, 24, ...)."""
    return core % 12 in (11, 0)


def _direct_name(el) -> str:
    for child in el:
        if safe_localname(child) == "name":
            return (child.text or "").strip()
    return ""


def _folder_path(el) -> str:
    """Jalur nama folder dari akar sampai induk `el`, dipisah '/'."""
    names = []
    cur = el.getparent()
    while cur is not None:
        if safe_localname(cur) == "Folder":
            nm = _direct_name(cur)
            if nm:
                names.append(nm)
        cur = cur.getparent()
    return "/".join(reversed(names))


def parse_kml_lxml_with_kmz(content: bytes, is_kmz: bool = False) -> etree.ElementTree:
    """Parse KML content using lxml, with KMZ support.

    Pembongkaran KMZ, pemilihan doc.kml, encoding, entitas, dan prefix
    namespace yatim ditangani load_kml_bytes() agar seragam dengan tool
    lain. Versi sebelumnya memakai .endswith(".kml") yang peka huruf besar,
    sehingga arsip berisi DOC.KML dianggap tidak punya KML sama sekali.
    """
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    return etree.parse(io.BytesIO(load_kml_bytes(content, is_kmz)), parser)


class APDEngine:
    """Engine for APD HPDB processing with geocoding."""
    
    def __init__(self, template_content: bytes = None, apd_template_content: bytes = None):
        self.template_content = template_content
        
        self.report = ProcessReport()
        self._geocode_calls = 0

        if apd_template_content:
            validate_hpdb_template(apd_template_content)
            self.apd_template_content = apd_template_content
        else:
            base_dir = Path(__file__).resolve().parent.parent
            default_template = base_dir / "templates" / "default_apd.xlsx"
            
            if default_template.exists():
                with open(default_template, "rb") as f:
                    self.apd_template_content = f.read()
            else:
                self.apd_template_content = None
        
        self.session = self._create_session()
        self.geocode_cache = {}
        self.input_filename = ""
        self.tree = None
        self.root = None
        self.fats = []
        self.poles = []
        self.hp_points = []
    
    def _create_session(self) -> requests.Session:
        """Create requests session with retry logic."""
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
    
    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict[str, Any]:
        """Load KML or KMZ content."""
        self.input_filename = filename
        self.tree = parse_kml_lxml_with_kmz(content, is_kmz)
        self.root = self.tree.getroot()
        return {"status": "success", "filename": filename, "is_kmz": is_kmz}
    
    def set_templates(self, template_content: bytes = None, apd_template_content: bytes = None) -> None:
        """Set template contents."""
        self.template_content = template_content
        self.apd_template_content = apd_template_content
    
    def parse_fat_pole(self) -> Tuple[List[Dict], List[Dict]]:
        """Parse FAT and POLE placemarks from KML.

        Setiap FAT membawa nomor FDT-nya. Tanpa itu, FAT A01 milik FDT 01 dan
        FAT A01 milik FDT 02 dianggap satu FAT dan saling menimpa di peta
        FAT -> tiang, sehingga salah satu sheet mendapat tiang yang salah.
        """
        placemarks_fat = []
        placemarks_pole = []

        for folder in self.root.iter():
            if safe_localname(folder) != "Folder":
                continue
            folder_name = _direct_name(folder).upper()
            is_fat = folder_name == "FAT"
            is_pole = "POLE" in folder_name
            if not (is_fat or is_pole):
                continue
            fdt_num = fdt_number(_folder_path(folder) + "/" + folder_name) or 1

            for pm in folder:
                if safe_localname(pm) != "Placemark":
                    continue
                name = _direct_name(pm) or "NONAME"
                coords = self._placemark_coords(pm)
                if not coords:
                    continue
                lat, lon = float(coords[0]), float(coords[1])
                if is_fat:
                    match = FAT_ID_RE.search(name)
                    fat_id = match.group(1).upper() if match else name.strip().upper()
                    placemarks_fat.append({"fat_id": fat_id, "fdt": fdt_num,
                                           "lat": lat, "lon": lon})
                else:
                    placemarks_pole.append({"name": name.strip(), "lat": lat, "lon": lon})

        return placemarks_fat, placemarks_pole

    def build_fat_to_pole_map(self, max_distance: float = 15) -> Dict[Tuple[int, str], Dict]:
        """Petakan (FDT, FAT) ke tiang terdekat."""
        fat_to_pole = {}
        for fat in self.fats:
            best_match, best_distance = None, float("inf")
            for pole in self.poles:
                d = haversine(fat["lat"], fat["lon"], pole["lat"], pole["lon"])
                if d < best_distance:
                    best_distance, best_match = d, pole
            if best_match and best_distance <= max_distance:
                fat_to_pole[(fat["fdt"], fat["fat_id"])] = best_match
        return fat_to_pole

    def build_fat_to_hpc_map(self, max_distance: float = 25) -> Dict[Tuple[int, str], List]:
        """Petakan (FDT, FAT) ke HP Cover terdekat di FDT yang sama."""
        fat_to_hpc = {}
        for fat in self.fats:
            best_match, best_distance = None, float("inf")
            for hp in self.hp_points:
                if hp[4] != fat["fdt"]:
                    continue
                d = haversine(fat["lat"], fat["lon"], float(hp[1]), float(hp[2]))
                if d < best_distance:
                    best_distance, best_match = d, hp
            if best_match and best_distance <= max_distance:
                fat_to_hpc[(fat["fdt"], fat["fat_id"])] = best_match
        return fat_to_hpc
    
    def find_hp_cover_folders(self) -> List:
        """Find all HP COVER folders."""
        hp_cover_folders = []
        for folder in self.root.iter():
            if safe_localname(folder) == "Folder":
                name_elem = None
                for child in folder:
                    if safe_localname(child) == "name":
                        name_elem = child
                        break
                if name_elem is not None and name_elem.text and "HP" in name_elem.text.upper() and "COVER" in name_elem.text.upper() and "UNCOVER" not in name_elem.text.upper():
                    hp_cover_folders.append(folder)
        return hp_cover_folders
    
    def extract_points_recursive(self, element, current_folder: str = "") -> List[List]:
        """Kumpulkan titik HP: [nama, lat, lon, jalur lokal, nomor FDT].

        Jalur lokal (induk HP COVER + sub-folder) dipakai untuk mencari ID FAT.
        Nomor FDT diambil dari jalur LENGKAP sampai akar — dulu hanya induk
        langsung HP COVER yang dilihat, sehingga struktur
        'FDT 02/LINE A/HP COVER' jatuh ke FDT 01.
        """
        points = []
        for child in element:
            tag = safe_localname(child)
            if tag == "Folder":
                subfolder_name = _direct_name(child) or current_folder
                new_folder = f"{current_folder}/{subfolder_name}" if current_folder else subfolder_name
                points.extend(self.extract_points_recursive(child, new_folder))
            elif tag == "Placemark":
                name = _direct_name(child) or "No Name"
                coords = self._placemark_coords(child)
                if coords:
                    lat, lon = coords
                    fdt_num = fdt_number(_folder_path(child)) or 1
                    points.append([name, lat, lon, current_folder, fdt_num])
        return points
    
    def clean_region_name(self, text: str) -> str:
        """Clean region name by removing common prefixes."""
        if not text:
            return ""
        text = str(text)
        remove_words = [
            "Provinsi ", "Kecamatan ", "Kabupaten ", "Kab. ", "Kota ",
            "Desa ", "Kelurahan "
        ]
        for rw in remove_words:
            text = text.replace(rw, "")
        return text.strip().upper()
    
    def reverse_geocode(self, lat: float, lon: float) -> Dict[str, str]:
        """Reverse geocode coordinates using Nominatim."""
        try:
            # ~11 m: HP bertetangga berbagi satu permintaan.
            key = f"{round(float(lat), 4)},{round(float(lon), 4)}"
            if key in self.geocode_cache:
                return self.geocode_cache[key]

            params = {
                "lat": lat, "lon": lon,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": 18
            }

            self._geocode_calls += 1
            response = self.session.get(NOMINATIM_URL, params=params,
                                        headers=NOMINATIM_HEADERS, timeout=30)
            time.sleep(NOMINATIM_DELAY_S)  # Respect rate limiting
            
            if response.status_code != 200:
                return self._empty_geo_result()
            
            data = response.json()
            addr = data.get("address", {})
            display_name = str(data.get("display_name", ""))
            
            # Extract street/road name
            street_name = (
                addr.get("road") or
                addr.get("street") or
                addr.get("path") or
                addr.get("pedestrian") or
                addr.get("track") or
                addr.get("highway") or
                addr.get("locality") or
                ""
            )
            
            result = {
                "province": self.clean_region_name(addr.get("state", "")),
                # "municipality" SENGAJA tidak dipakai di sini. Untuk
                # Indonesia, Nominatim umumnya memakai field itu untuk
                # KECAMATAN, bukan kabupaten. Karena rantai kabupaten
                # dievaluasi lebih dulu, nilainya dulu terserobot ke kolom
                # kabupaten dan kolom kecamatan ikut kosong.
                "kabupaten": self.clean_region_name(
                    addr.get("county") or addr.get("city") or
                    addr.get("state_district", "")
                ),
                "kecamatan": self.clean_region_name(
                    addr.get("subdistrict") or addr.get("municipality") or
                    addr.get("city_district") or addr.get("district") or
                    addr.get("suburb") or addr.get("borough") or
                    addr.get("quarter", "")
                ),
                # "neighbourhood" dikeluarkan dari rantai kecamatan supaya
                # tidak menyalin nilai yang sama ke kecamatan dan desa.
                "desa": self.clean_region_name(
                    addr.get("village") or addr.get("hamlet") or
                    addr.get("neighbourhood") or addr.get("quarter", "")
                ),
                "kodepos": str(addr.get("postcode", "")).strip(),
                "jalan": str(street_name).strip().upper()
            }
            
            # Untuk Indonesia, respons zoom=18 sering TIDAK memuat level
            # kecamatan sama sekali — hanya desa, kabupaten, dan provinsi.
            # Itu sebabnya kolom "district" tetap kosong meski desa terisi.
            # Dua cadangan di bawah dicoba berurutan.
            if not result["kecamatan"]:
                result["kecamatan"] = self._kecamatan_fallback(
                    lat, lon, display_name, result["desa"], result["kabupaten"]
                )

            self.geocode_cache[key] = result
            return result
        
        except Exception:
            return self._empty_geo_result()
    
    def _kecamatan_fallback(self, lat, lon, display_name: str,
                            desa: str, kabupaten: str) -> str:
        """
        Cari nama kecamatan ketika respons utama tidak memuatnya.

        Cadangan 1 — susunan display_name. Untuk Indonesia bentuknya konsisten:
            "Ambulu, Losari, Cirebon, Jawa Barat, Jawa, 45192, Indonesia"
             desa      kecamatan kabupaten
        Bagian tepat setelah desa adalah kecamatan.

        Cadangan 2 — panggil ulang Nominatim pada zoom 12, tingkat yang
        memang memetakan batas kecamatan.
        """
        # --- Cadangan 1: susunan display_name ---
        try:
            parts = [p.strip() for p in display_name.split(",") if p.strip()]
            upper = [p.upper() for p in parts]
            if desa and desa in upper:
                idx = upper.index(desa)
                if idx + 1 < len(parts):
                    kandidat = self.clean_region_name(parts[idx + 1])
                    if kandidat and kandidat != kabupaten and kandidat != desa:
                        return kandidat
        except Exception:
            pass

        # --- Cadangan 2: panggilan kedua pada zoom kecamatan ---
        try:
            resp = self.session.get(
                NOMINATIM_URL,
                params={"lat": lat, "lon": lon, "format": "jsonv2",
                        "addressdetails": 1, "zoom": 12},
                headers=NOMINATIM_HEADERS,
                timeout=30,
            )
            time.sleep(NOMINATIM_DELAY_S)  # hormati rate limit Nominatim
            if resp.status_code == 200:
                d2 = resp.json()
                a2 = d2.get("address", {})
                kandidat = self.clean_region_name(
                    a2.get("subdistrict") or a2.get("municipality") or
                    a2.get("city_district") or a2.get("district") or
                    a2.get("suburb") or d2.get("name", "")
                )
                if kandidat and kandidat != kabupaten:
                    return kandidat
        except Exception:
            pass

        return ""

    def _empty_geo_result(self) -> Dict[str, str]:
        """Return empty geocode result."""
        return {"province": "", "kabupaten": "", "kecamatan": "", "desa": "", "kodepos": "", "jalan": ""}
    
    def get_fdt_coords(self) -> Tuple[Optional[str], Optional[str]]:
        """Get FDT coordinates from KML."""
        try:
            for folder in self.root.iter():
                if safe_localname(folder) == "Folder":
                    name_elem = None
                    for child in folder:
                        if safe_localname(child) == "name":
                            name_elem = child
                            break
                    if name_elem is not None and name_elem.text and name_elem.text.strip().upper() == "FDT":
                        for pm in folder:
                            if safe_localname(pm) == "Placemark":
                                for coord in pm.iter():
                                    if safe_localname(coord) == "coordinates":
                                        lon, lat = map(float, coord.text.strip().split(",")[:2])
                                        return f"{lat:.5f}", f"{lon:.5f}"
        except Exception:
            pass
        return None, None

    def _placemark_coords(self, pm) -> Optional[Tuple[str, str]]:
        """Ambil (lat, lon) dari sebuah Placemark, apa pun namespace-nya."""
        for coord in pm.iter():
            if safe_localname(coord) == "coordinates" and coord.text:
                parts = coord.text.strip().split(",")
                if len(parts) >= 2:
                    try:
                        lon, lat = float(parts[0]), float(parts[1])
                        return f"{lat:.6f}", f"{lon:.6f}"
                    except ValueError:
                        return None
        return None

    _STRUCTURAL_FOLDER_RE = re.compile(
        r"\b(LINE|FAT|HP|HOMEPASS|POLE|TIANG|NP|EXT|CABLE|KABEL|DISTRIBUTION|SLING|BOUNDARY|SLACK)\b")

    def _inside_structural_folder(self, pm, stop) -> bool:
        """True kalau di antara `stop` dan `pm` ada folder jaringan (LINE, FAT, ...)."""
        cur = pm.getparent()
        while cur is not None and cur is not stop:
            if safe_localname(cur) == "Folder" and \
                    self._STRUCTURAL_FOLDER_RE.search(_direct_name(cur).upper()):
                return True
            cur = cur.getparent()
        return False

    def get_all_fdt_coords(self) -> Dict[str, Tuple[str, str]]:
        """
        Kumpulkan koordinat setiap FDT, dipetakan sebagai 'FDT 01' -> (lat, lon).

        Aturan penataan KML proyek ini:

        * Titik FDT WAJIB berada di dalam folder yang namanya mengandung
          "FDT". Syarat ini dipertahankan supaya label lain yang kebetulan
          menyebut FDT (mis. "SLING FDT 01" di folder kabel) tidak ikut
          terbaca sebagai koordinat FDT.

        * NAMA Placemark-nya diabaikan sepenuhnya. Di lapangan titik itu
          dinamai bebas — "FDT 01", kode internal, nama cluster, atau apa
          pun. Versi sebelumnya mensyaratkan namanya mengandung "FDT" dan
          itulah yang membuat pencarian selalu gagal, sehingga sel N6 tetap
          memakai nilai bawaan template.

        * URUTAN yang menentukan nomornya. Placemark paling atas menjadi
          FDT 01, berikutnya FDT 02, dan seterusnya — sesuai urutan
          kemunculannya di dalam dokumen.
        """
        fdt_coords: Dict[str, Tuple[str, str]] = {}
        folder_terlihat = []
        sudah_diproses = set()
        urutan = 0

        try:
            for folder in self.root.iter():
                if safe_localname(folder) != "Folder":
                    continue

                folder_name = ""
                for child in folder:
                    if safe_localname(child) == "name" and child.text:
                        folder_name = child.text.strip().upper()
                        break

                if folder_name:
                    folder_terlihat.append(folder_name)

                if "FDT" not in folder_name:
                    continue

                # folder.iter() ikut menjangkau sub-folder. Kalau ada folder
                # FDT bersarang di dalam folder FDT lain, Placemark yang sama
                # bisa terlewati dua kali — karena itu jejaknya dicatat.
                for pm in folder.iter():
                    if safe_localname(pm) != "Placemark":
                        continue
                    if id(pm) in sudah_diproses:
                        continue
                    sudah_diproses.add(id(pm))
                    # Folder FDT sering membungkus seluruh jaringannya
                    # ('FDT 01/LINE A/FAT/...'). Titik FAT, tiang, dan HP di
                    # dalamnya bukan titik FDT dan dulu ikut dinomori sebagai
                    # FDT 03, FDT 04, dst.
                    if self._inside_structural_folder(pm, folder):
                        continue

                    coords = self._placemark_coords(pm)
                    if not coords:
                        continue

                    urutan += 1
                    fdt_coords[f"FDT {urutan:02d}"] = coords
        except Exception as e:
            print("Error in get_all_fdt_coords:", e)

        if fdt_coords:
            print(f"[apd] Koordinat FDT terbaca (urut): {fdt_coords}")
        else:
            print(
                "[apd] PERINGATAN: tidak ada folder ber-nama 'FDT' yang berisi "
                "Placemark dengan koordinat. Folder yang terbaca: "
                f"{folder_terlihat[:40]}"
            )

        return fdt_coords
    
    def process(self) -> Dict[str, Any]:
        """Main processing method."""
        if self.root is None:
            return {"status": "error", "message": "No KML/KMZ loaded"}

        # Parse FAT and POLE
        self.fats, self.poles = self.parse_fat_pole()
        fat_to_pole = self.build_fat_to_pole_map(max_distance=15)

        # Parse HP Cover points
        hp_folders = self.find_hp_cover_folders()
        self.hp_points = []
        seen_hp = set()
        for folder in hp_folders:
            parent = folder.getparent()
            parent_name = _direct_name(parent) if parent is not None else ""
            for row in self.extract_points_recursive(folder, parent_name):
                # HP COVER bersarang di HP COVER lain tidak boleh terhitung dua kali.
                key = (row[0], row[1], row[2])
                if key in seen_hp:
                    continue
                seen_hp.add(key)
                self.hp_points.append(row)

        fat_to_hpc = self.build_fat_to_hpc_map(max_distance=25)

        # Group hp_points by FDT, lalu urutkan per FAT (A01, A02, ..., B01).
        # Urutan KML dulu dipakai apa adanya: kalau HP satu FAT tidak
        # berurutan, penghitung port FAT di-reset ke 1 dan nomor port/core
        # jadi dobel.
        hp_points_by_fdt = defaultdict(list)
        no_fat: List[str] = []
        for row in self.hp_points:
            name, lat, lon, folder_path, fdt_num = row
            match = FAT_ID_RE.search(folder_path + " " + name)
            if not match:
                no_fat.append(name)
                continue
            fat_id = match.group(1).upper()
            hp_points_by_fdt[f"FDT {fdt_num:02d}"].append((row, fat_id))

        sorted_fdts = sorted(hp_points_by_fdt.keys()) or ["FDT 01"]

        fdt_processed_rows = {}
        over_capacity, over_tray = [], []
        fat_without_pole = set()

        for fdt_name in sorted_fdts:
            fdt_num = int(fdt_name.split()[-1])
            items = hp_points_by_fdt.get(fdt_name, [])
            items.sort(key=lambda it: (it[1][0], int(it[1][1:])))  # sort stabil

            fat_id_max: Dict[str, int] = {}
            for _, fat_id in items:
                fat_id_max[fat_id[0]] = max(fat_id_max.get(fat_id[0], 0), int(fat_id[1:]))

            fat_port_counters: Dict[str, int] = defaultdict(int)
            core_by_prefix: Dict[str, int] = defaultdict(lambda: 1)
            fdt_port_counter = 1
            processed_list = []

            for row, fat_id in items:
                name, lat, lon, _folder_path, _ = row
                name_parts = [p.strip() for p in re.split(r"[,/ ]", name) if p.strip()]
                name_1 = name_parts[0] if len(name_parts) > 0 else ""
                name_2 = name_parts[1] if len(name_parts) > 1 else ""

                prefix = fat_id[0]
                num_part = int(fat_id[1:])

                fat_port_counters[fat_id] += 1
                fat_port = fat_port_counters[fat_id]

                fdt_port = ""
                if fat_port == 1:
                    fdt_port = fdt_port_counter
                    fdt_port_counter += 1

                core = ""
                if fat_port in (1, 2):
                    c = core_by_prefix[prefix]
                    while is_skipped_core(c):
                        c += 1
                    core = c
                    core_by_prefix[prefix] = c + 1

                line, cap, tube_number = "", "", ""
                if core:
                    line = f"LINE {prefix}"
                    max_num = fat_id_max.get(prefix, 0)
                    cap = next((c for limit, c in CABLE_CAPACITY if max_num <= limit), "")
                    if not cap:
                        over_capacity.append(f"{fdt_name} LINE {prefix} ({max_num} FAT)")
                    tube_number = str(math.ceil(num_part / FATS_PER_TUBE)) if num_part else ""

                tray = math.ceil(fdt_port / PORTS_PER_TRAY) if isinstance(fdt_port, int) else ""
                if isinstance(tray, int) and tray > 5:
                    over_tray.append(f"{fdt_name} port {fdt_port}")

                pole = fat_to_pole.get((fdt_num, fat_id))
                pole_name = pole["name"] if pole else ""
                pole_lat = pole["lat"] if pole else ""
                pole_lon = pole["lon"] if pole else ""
                if not pole:
                    fat_without_pole.add(f"{fdt_name} {fat_id}")

                hpc = fat_to_hpc.get((fdt_num, fat_id))
                hpc_text = "IN FRONT OF HP NUMBER " + hpc[0] if hpc else ""

                processed_list.append([
                    tray, fdt_port, line, cap, tube_number, core, fat_id, fat_port,
                    pole_name, pole_lat, pole_lon, hpc_text,
                    name_1, name_2, lat, lon
                ])

            fdt_processed_rows[fdt_name] = processed_list

        rep = self.report
        rep.stat("hp", sum(len(v) for v in fdt_processed_rows.values()))
        rep.stat("fat", len({(f, r[6]) for f, rows in fdt_processed_rows.items() for r in rows}))
        rep.stat("fdt", len([f for f in sorted_fdts if fdt_processed_rows.get(f)]))
        if no_fat:
            rep.warn(f"{len(no_fat)} HP dilewati karena ID FAT (mis. A01) tidak "
                     "ditemukan di nama folder/HP-nya", no_fat)
        if over_capacity:
            rep.warn("Kapasitas kabel dikosongkan karena jumlah FAT melebihi 96C/8T",
                     sorted(set(over_capacity)))
        if over_tray:
            rep.warn("Port FDT melebihi 40 (tray > 5)", over_tray)
        if fat_without_pole:
            rep.warn("FAT tanpa tiang dalam radius 15 m (kolom POLE kosong)",
                     sorted(fat_without_pole))
        
        output_filename = f"{os.path.splitext(self.input_filename)[0]}_with_pole.xlsx"
        
        # If template provided, integrate with template
        if self.apd_template_content:
            return self._integrate_with_template(fdt_processed_rows, output_filename)
        
        # Otherwise, save as raw Excel
        wb = Workbook()
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for idx, fdt_name in enumerate(sorted_fdts):
            if idx == 0:
                ws = wb.active
                ws.title = f"Homepass Database {fdt_name}"
            else:
                ws = wb.create_sheet(title=f"Homepass Database {fdt_name}")
                
            headers = [
                "FDT Tray (Front)", "FDT Port", "Line", "Capacity",
                "Tube Colour", "Core Number", "FAT ID",
                "FAT Port", "POLE_Name", "POLE_Lat", "POLE_Lon",
                "HP_Cover", "name_1", "name_2", "latitude", "longitude"
            ]
            ws.append(headers)
            
            for row in fdt_processed_rows.get(fdt_name, []):
                ws.append(row)
                
            for row in ws.iter_rows(min_row=2):
                for cell_idx, cell in enumerate(row, 1):
                    if cell.value not in (None, ""):
                        cell.border = thin_border
                    if cell_idx == 5:
                        if cell.value == "1":
                            cell.fill = PatternFill(start_color="ADD8E6", end_color="ADD8E6", fill_type="solid")
                        elif cell.value == "2":
                            cell.fill = PatternFill(start_color="FFD580", end_color="FFD580", fill_type="solid")
                        elif cell.value == "3":
                            cell.fill = PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid")
                        elif cell.value == "4":
                            cell.fill = PatternFill(start_color="D2B48C", end_color="D2B48C", fill_type="solid")
                            
        output_buffer = io.BytesIO()
        wb.save(output_buffer)
        output_buffer.seek(0)
        
        return {
            "status": "success",
            "filename": output_filename,
            "content": output_buffer.getvalue(),
            "report": self.report.to_dict(),
        }
    
    def _integrate_with_template(self, fdt_processed_rows: Dict[str, List], output_filename: str) -> Dict[str, Any]:
        """Integrate data with APD template."""
        wb_template = load_workbook(io.BytesIO(self.apd_template_content))
        
        headers = [
            "FDT Tray (Front)", "FDT Port", "Line", "Capacity",
            "Tube Colour", "Core Number", "FAT ID",
            "FAT Port", "POLE_Name", "POLE_Lat", "POLE_Lon",
            "HP_Cover", "name_1", "name_2", "latitude", "longitude"
        ]
        
        header_map = {
            "FDT Tray (Front)": "A",
            "FDT Port": "B",
            "Line": "C",
            "Capacity": "D",
            "Tube Colour": "E",
            "Core Number": "F",
            "FAT ID": ["G", "AT"],
            "FAT Port": "H",
            "POLE_Name": "I",
            "POLE_Lat": "J",
            "POLE_Lon": "K",
            "HP_Cover": "L",
            "name_1": "AJ",
            "name_2": "AJ",
            "latitude": "AV",
            "longitude": "AW",
        }
        
        tube_colors = {
            "1": "ADD8E6",
            "2": "FFD580",
            "3": "90EE90",
            "4": "D2B48C",
        }
        
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        # Get FDT coordinates mapped by FDT name
        all_fdt_coords = self.get_all_fdt_coords()
        
        # Clean and set location name (remove dash)
        file_base_name = os.path.splitext(os.path.basename(self.input_filename))[0]
        file_base_name_clean = file_base_name.replace("APD_HPDB_", "")
        parts = file_base_name_clean.split(" ", 1)
        lokasi_nama = parts[1].strip() if len(parts) > 1 else file_base_name_clean.strip()
        lokasi_nama_clean = lokasi_nama.replace("-", " ")
        
        sorted_fdts = sorted(fdt_processed_rows.keys())
        
        # 1. Create/prepare worksheets for each FDT in sorted order
        fdt_worksheets = {}
        template_ws = wb_template.worksheets[0]
        
        if len(sorted_fdts) <= 1:
            fdt_name = sorted_fdts[0] if sorted_fdts else "FDT 01"
            fdt_worksheets[fdt_name] = template_ws
        else:
            for idx, fdt_name in enumerate(sorted_fdts):
                if idx == 0:
                    ws = template_ws
                    ws.title = f"Homepass Database {fdt_name}"
                else:
                    ws = wb_template.copy_worksheet(template_ws)
                    ws.title = f"Homepass Database {fdt_name}"
                fdt_worksheets[fdt_name] = ws
        
        # 2. Populate each worksheet with its own FDT data
        for fdt_name in sorted_fdts:
            ws = fdt_worksheets[fdt_name]
            data_rows = fdt_processed_rows.get(fdt_name, [])
            
            start_row = 10
            for i, row in enumerate(data_rows, start=start_row):
                row_dict = dict(zip(headers, row))
                
                for key, target in header_map.items():
                    if key not in row_dict:
                        continue
                    val = row_dict[key]
                    if val in (None, ""):
                        continue
                    
                    if isinstance(target, list):
                        for col in target:
                            cell = ws[f"{col}{i}"]
                            cell.value = val
                            cell.border = thin_border
                    elif key == "name_1":
                        combined = str(val)
                        if row_dict.get("name_2"):
                            combined += " " + str(row_dict["name_2"])
                        cell = ws[f"{target}{i}"]
                        cell.value = combined
                        cell.border = thin_border
                    elif key == "name_2":
                        continue
                    else:
                        cell = ws[f"{target}{i}"]
                        if key in ["POLE_Lat", "POLE_Lon", "latitude", "longitude"]:
                            try:
                                val = float(val)
                            except:
                                pass
                        
                        cell.value = val
                        cell.border = thin_border
                        
                        if key == "Tube Colour":
                            color_hex = tube_colors.get(str(val).strip(), None)
                            if color_hex:
                                cell.fill = PatternFill(start_color=color_hex, end_color=color_hex, fill_type="solid")
            
            # Set FDT coordinates for this sheet
            lat_fdt, lon_fdt = all_fdt_coords.get(fdt_name, (None, None))
            # Fallback if specific not found, use first found or None
            if not lat_fdt and all_fdt_coords:
                lat_fdt, lon_fdt = next(iter(all_fdt_coords.values()))
            if lat_fdt and lon_fdt:
                # Format mengikuti placeholder pada template:
                #   ": -6.702440°, 108.455580°"
                ws["N6"].value = f": {lat_fdt}\u00b0, {lon_fdt}\u00b0"
            else:
                # Dikosongkan, BUKAN dibiarkan. Nilai bawaan template
                # adalah koordinat cluster lain — kalau ditinggal, ia
                # terbaca seolah data asli. Sel kosong lebih aman.
                ws["N6"].value = ": "
                self.report.warn(f"Koordinat FDT tidak ditemukan untuk {fdt_name}; "
                                 "sel N6 dikosongkan (titik FDT harus di folder bernama FDT)")
            
            # Set cluster/location name
            ws["C5"].value = lokasi_nama_clean
            ws["Y10"].value = lokasi_nama_clean
            ws["Z10"].value = lokasi_nama_clean
            
            # Reverse geocode PER FAT. Dulu satu titik (baris 10) di-geocode
            # lalu hasilnya disalin ke semua baris, sehingga ratusan HP di
            # jalan dan desa berbeda tercatat dengan jalan/desa yang sama.
            max_row_data = start_row + len(data_rows) - 1
            geo_by_fat = self._geocode_rows(data_rows)
            for offset, row in enumerate(data_rows):
                r = start_row + offset
                geo = geo_by_fat.get(row[6], self._empty_geo_result())
                ws[f"M{r}"] = geo["province"]
                ws[f"N{r}"] = geo["kabupaten"]
                ws[f"W{r}"] = geo["kabupaten"]
                ws[f"O{r}"] = geo["kecamatan"]
                ws[f"P{r}"] = geo["desa"]
                ws[f"Q{r}"] = geo["kodepos"]
                ws[f"AD{r}"] = geo["jalan"]
                ws[f"Y{r}"] = lokasi_nama_clean
                ws[f"Z{r}"] = lokasi_nama_clean
            if data_rows:
                # C3 pada kop lembar HPDB memuat nama kabupaten
                ws["C3"] = ws["N10"].value
            
            # Count unique FAT IDs to determine capacity (Cell N3)
            fat_id_col_idx = headers.index("FAT ID") if "FAT ID" in headers else -1
            unique_fat_ids = set()
            if fat_id_col_idx >= 0:
                for row in data_rows:
                    fat_id = row[fat_id_col_idx]
                    if fat_id and str(fat_id).strip():
                        unique_fat_ids.add(str(fat_id).strip().upper())
            
            fat_count = len(unique_fat_ids)
            if fat_count <= 20:
                capacity = "48C"
            elif fat_count <= 30:
                capacity = "72C"
            elif fat_count <= 40:
                capacity = "96C"
            else:
                capacity = "96C"
                self.report.warn(f"{fdt_name}: {fat_count} FAT melebihi kapasitas "
                                 "standar FDT 96C (40 FAT) — periksa kapasitas FDT")

            ws["N3"] = capacity
            
            # Set formula for N4
            if len(data_rows) > 0:
                ws["N4"] = f'=": "&COUNTA(G10:G{max_row_data})&" HP /Aerial"'
            else:
                ws["N4"] = '=": 0 HP /Aerial"'
            
            # Delete unused rows from template
            last_template_row = ws.max_row
            # Jangan pernah menghapus baris 10 ke atas. Kalau data_rows kosong,
            # max_row_data bernilai 9 dan penghapusan dulu dimulai dari baris
            # 10 — ikut membuang baris yang barusan diisi (Y10/Z10 dan hasil
            # geocoding), sehingga lembar keluar tanpa kop data sama sekali.
            delete_start = max(max_row_data + 1, 11)
            if delete_start <= last_template_row:
                ws.delete_rows(delete_start, last_template_row - delete_start + 1)
        
        # Save final output
        output_buffer = io.BytesIO()
        wb_template.save(output_buffer)
        output_buffer.seek(0)
        
        # Generate final filename
        final_name = self._generate_final_filename(output_filename)
        
        self.report.stat("geocoding_request", self._geocode_calls)
        return {
            "status": "success",
            "filename": final_name,
            "content": output_buffer.getvalue(),
            "report": self.report.to_dict(),
        }

    def _geocode_rows(self, data_rows: List[List]) -> Dict[str, Dict[str, str]]:
        """Geocode satu titik per FAT (tiang FAT, atau HP pertamanya).

        FAT di atas batas MAX_GEOCODE_PER_JOB memakai hasil FAT terdekat yang
        sudah di-geocode, supaya job besar tetap selesai dalam waktu wajar.
        """
        titik: Dict[str, Tuple[float, float]] = {}
        for row in data_rows:
            fat_id = row[6]
            if fat_id in titik:
                continue
            for lat, lon in ((row[9], row[10]), (row[14], row[15])):
                try:
                    titik[fat_id] = (float(lat), float(lon))
                    break
                except (TypeError, ValueError):
                    continue

        hasil: Dict[str, Dict[str, str]] = {}
        dipinjam = []
        for fat_id, (lat, lon) in titik.items():
            if self._geocode_calls < MAX_GEOCODE_PER_JOB:
                geo = self.reverse_geocode(lat, lon)
                if any(geo.values()):
                    hasil[fat_id] = geo
                    continue
            dipinjam.append(fat_id)

        for fat_id in dipinjam:
            if not hasil:
                break
            lat, lon = titik[fat_id]
            terdekat = min(hasil, key=lambda f: haversine(lat, lon, *titik[f]))
            hasil[fat_id] = hasil[terdekat]
        if dipinjam:
            self.report.warn(
                f"{len(dipinjam)} FAT memakai alamat FAT terdekat karena geocoding "
                "gagal atau melewati batas permintaan", dipinjam)
        return hasil

    def _generate_final_filename(self, output_filename: str) -> str:
        """Generate final filename according to format."""
        excel_name = os.path.basename(output_filename)
        excel_base = os.path.splitext(excel_name)[0]
        
        excel_base = excel_base.replace("_with_pole", "")
        
        # Remove old prefixes if they exist in the original filename
        for old_prefix in ["APD_HPDB_", "HPDB_"]:
            if excel_base.startswith(old_prefix):
                excel_base = excel_base[len(old_prefix):]
        
        # New prefix format requested by user
        prefix = "HPDB_-"
        
        parts = excel_base.split(" ", 1)
        lokasi_nama_final = parts[1].strip() if len(parts) > 1 else excel_base.strip()
        
        # Ensure there's a space after the prefix
        return f"{prefix} {lokasi_nama_final}.xlsx"


def process_apd_hpdb(
    kml_content: bytes,
    filename: str,
    apd_template_content: bytes = None
) -> Dict[str, Any]:
    """
    Process APD HPDB from KML or KMZ file.
    
    Args:
        kml_content: Raw bytes of KML or KMZ file
        filename: Original filename
        apd_template_content: Optional APD template Excel bytes
    
    Returns:
        Dict with status, filename, and content bytes
    """
    is_kmz = filename.lower().endswith(".kmz")
    engine = APDEngine(apd_template_content=apd_template_content)
    engine.load_kml(kml_content, filename, is_kmz=is_kmz)
    return engine.process()
