"""
KML APD Auto-Drafter Engine
============================
Processes KML/KMZ files for FTTH planning:
- Auto-generate FAT positions from pole/boundary analysis
- Calculate cable descriptions (route, slack, toleransi)
- Generate sling wire connections
- HP coverage mapping to boundary polygons
- Pole numbering & classification (size, existing/new)
- Folder reordering and Google Earth style injection

Adapted from standalone desktop script for cloud/server use.
"""

import io
import os
import re
import copy
import math
import zipfile
import traceback
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
# minidom & xml.etree bawaan Python rentan terhadap serangan ini.
import xml.etree.ElementTree as ET
from xml.etree.ElementTree import ParseError
from defusedxml.ElementTree import fromstring as safe_fromstring
from collections import defaultdict
from typing import Dict, Any, List, Tuple, Optional

from utils.commons import (
    repair_unbound_prefixes, load_kml_bytes, read_kmz_attachments, fdt_number,
)
from utils.report import ProcessReport

try:
    from shapely.geometry import Point, Polygon
    from shapely.ops import nearest_points
except ImportError:
    raise ImportError(
        "shapely is required for KML APD engine. "
        "Install it with: pip install shapely>=2.0.0"
    )


# =====================================================================
# Helpers
# =====================================================================

KML_NS = "http://www.opengis.net/kml/2.2"
# Namespace ekstensi dipertahankan (bukan dibuang) supaya gx:Track,
# atom:author, dsb. tetap sah di hasil. Prefiksnya didaftarkan agar ditulis
# sebagai gx:/atom: dan bukan ns0:/ns1:.
for _prefix, _uri in (("gx", "http://www.google.com/kml/ext/2.2"),
                      ("atom", "http://www.w3.org/2005/Atom"),
                      ("xal", "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0")):
    ET.register_namespace(_prefix, _uri)

POLE_DEDUPE_M = 10.0


def _is_kml_ns(ns: str) -> bool:
    return ns == KML_NS or ns.startswith("http://earth.google.com/kml/")


def strip_namespace(root):
    """Buang namespace KML inti supaya elemen bisa diakses tanpa prefix.

    Hanya namespace KML itu sendiri yang dibuang; namespace ekstensi (gx,
    atom) dibiarkan. Dulu SEMUA namespace dibuang dan hasilnya ditulis
    tanpa xmlns sama sekali — gx:Track berubah jadi elemen tak dikenal, dan
    tool lain (BasicMap, QGIS) tidak mengenali berkasnya sebagai KML.
    Namespace default dipasang kembali oleh restore_namespace() sebelum
    ditulis.
    """
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        if el.tag.startswith("{"):
            ns, local = el.tag[1:].split("}", 1)
            if _is_kml_ns(ns):
                el.tag = local
        for key in list(el.attrib):
            if key.startswith("{"):
                ns, local = key[1:].split("}", 1)
                if _is_kml_ns(ns):
                    el.attrib[local] = el.attrib.pop(key)


def restore_namespace(root):
    """Pasang lagi xmlns KML di elemen akar sebelum ditulis."""
    root.set("xmlns", KML_NS)


def _fdt_num_of(text: str) -> Optional[int]:
    return fdt_number(text)


def _localname(tag) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.split("}", 1)[1] if "}" in tag else tag


def strip_metadata_etl(root) -> Tuple[int, int]:
    """Hapus semua <ExtendedData> dan <Schema> agar file lolos validasi ETL.

    Atribut GIS (<ExtendedData>/<SchemaData>/<SimpleData>) dan definisi
    <Schema> membuat parser ETL beralih ke jalur skema dan gagal membaca titik
    atau layer, terutama bila schemaUrl mengarah ke path file lokal lama.
    """
    removed_ext = 0
    removed_schema = 0
    for el in root.iter():
        for child in list(el):
            local = _localname(child.tag)
            if local == "ExtendedData":
                el.remove(child)
                removed_ext += 1
            elif local == "Schema":
                el.remove(child)
                removed_schema += 1
    return removed_ext, removed_schema


def _strip_extended_data(el) -> None:
    for child in list(el):
        if _localname(child.tag) == "ExtendedData":
            el.remove(child)


def _is_line_folder_name(name: str) -> bool:
    u = (name or "").strip().upper()
    return u.startswith("LINE ") or bool(re.match(r"^LINE[\-_]+[A-Z]\b", u))


def _line_letter(line_name: str) -> str:
    """Ambil huruf line ('LINE A' / 'LINE-A' / 'LINE A FDT 01' -> 'A')."""
    text = (line_name or "").strip()
    m = re.search(r"\bLINE[\s\-_]*([A-Z])\b", text, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    parts = text.split()
    if len(parts) >= 2 and parts[1]:
        return parts[1][0].upper()
    letters = "".join(ch for ch in text if ch.isalpha())
    return letters[0].upper() if letters else "X"


def _is_fdt_folder(name: str) -> bool:
    u = (name or "").strip().upper()
    if not u or _is_line_folder_name(u) or "SLACK" in u or "BOUNDARY" in u or "CABLE" in u:
        return False
    return u.startswith("FDT") or bool(re.search(r"\bFDT\b", u))


def _is_pole_folder_name(name: str) -> bool:
    """True untuk folder tiang (baik input mentah POLE/NP/EXT maupun hasil APD)."""
    u = (name or "").strip().upper()
    if not u or any(bad in u for bad in ("CABLE", "KABEL", "SLING", "SLACK", "BOUNDARY", "HP ")):
        return False
    if u in ("POLE", "NP", "EXT", "EXST", "EXISTING", "EKSISTING", "TIANG"):
        return True
    if u.startswith(("NP ", "EXT ", "EXST ")):
        return True
    return bool(re.search(r"\b(POLE|TIANG)\b", u))


def _pole_metadata_text(pm, folder_hint: str = "") -> str:
    """Gabungkan teks atribut relevan tiang tanpa ikut membaca schemaUrl/LookAt.

    Membaca ET.tostring(pm) penuh rentan salah baca bila schemaUrl berisi path
    file lokal yang mengandung kata 'EXISTING' atau angka ukuran tiang.
    """
    parts = [folder_hint] if folder_hint else []
    for tag in ("name", "description", "styleUrl"):
        el = pm.find(tag)
        if el is not None and el.text:
            parts.append(el.text)
    for child in pm.iter():
        local = _localname(child.tag)
        if local in ("SimpleData", "Data"):
            if child.get("name"):
                parts.append(child.get("name"))
            if child.text:
                parts.append(child.text)
            val = child.find("value")
            if val is not None and val.text:
                parts.append(val.text)
    return " ".join(parts).upper()


def _parse_point_coords(pm) -> Optional[Tuple[float, float]]:
    """Ambil koordinat (lon, lat) pertama yang valid dari Point (termasuk MultiGeometry)."""
    for coords_el in pm.findall(".//Point/coordinates"):
        if coords_el.text:
            pts = parse_coords(coords_el.text)
            if pts:
                return pts[0]
    return None


def _extract_cable_prefix(orig_name: str) -> str:
    """Pertahankan kode cluster di depan CABLE (mis. 'SRG05.057 - ') bila sudah ada."""
    m = re.match(
        r"^\s*([A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)\s*-\s*(?:CABLE|KABEL)\b",
        orig_name or "",
        re.IGNORECASE,
    )
    if not m:
        return ""
    prefix = m.group(1).strip()
    if re.match(r"^(?:LINE|FDT)\b", prefix, re.IGNORECASE):
        return ""
    if "." in prefix or any(ch.isdigit() for ch in prefix):
        return f"{prefix} - "
    return ""


def _detect_cable_topology(orig_name: str, desc_text: str = "", folder_name: str = "") -> str:
    """Deteksi topologi kabel ('UG' jika eksplisit underground, selain itu 'AE')."""
    combined = f"{orig_name or ''} {desc_text or ''} {folder_name or ''}".upper()
    if re.search(r"(?:^|[\s\-_/()])UG(?:$|[\s\-_/()])|UNDERGROUND|KABEL\s+TANAM|\bTANAM\b|\bDUCT\b|\bHDPE\b", combined):
        return "UG"
    return "AE"


def _slack_fat_name(fat_name: str) -> str:
    """Bentuk nama standar Slack Hanger FAT ('SLACK.FAT.A01')."""
    text = (fat_name or "").strip()
    if text.upper().startswith("SLACK"):
        m_code = re.search(r"([A-Za-z]+\d+)$", text)
        if m_code and "FAT" in text.upper():
            return f"SLACK.FAT.{m_code.group(1).upper()}"
        return text
    m = re.search(r"([A-Za-z]\d{1,3})\s*$", text)
    if m:
        return f"SLACK.FAT.{m.group(1).upper()}"
    clean = re.sub(r"^(?:FAT[\s._\-]*)", "", text, flags=re.IGNORECASE).strip()
    return f"SLACK.FAT.{clean or 'FAT'}"


class FdtIndex:
    """Koordinat FDT, dicari dengan nomornya — bukan kecocokan teks persis.

    Nama placemark FDT di lapangan beragam ('FDT 01', 'FDT-01',
    'MR.ABC.FDT01'). Dulu nama folder LINE harus sama persis dengan nama
    placemark FDT; kalau tidak, satu tahap memakai FDT pertama sementara
    tahap lain tidak memakai FDT sama sekali — arah penomoran tiang jadi acak.
    """

    def __init__(self):
        self.by_name: Dict[str, Tuple[float, float]] = {}
        self.by_num: Dict[int, Tuple[float, float]] = {}
        self.entries: List[Tuple[str, float, float, Any]] = []
        self.fallbacks = set()

    def add(self, name: str, lat: float, lon: float, pm: Any = None) -> None:
        self.by_name[name.upper()] = (lat, lon)
        self.entries.append((name, lat, lon, pm))
        num = _fdt_num_of(name)
        if num is not None and num not in self.by_num:
            self.by_num[num] = (lat, lon)

    def __len__(self):
        return len(self.by_name)

    def values(self):
        return self.by_name.values()

    def resolve_entry(self, line_name: str) -> Optional[Tuple[str, float, float, Any]]:
        if not self.entries:
            return None
        num = _fdt_num_of(line_name)
        if num is not None:
            for entry in self.entries:
                if _fdt_num_of(entry[0]) == num:
                    return entry
        key = get_fdt_name_from_line(line_name).upper()
        for entry in self.entries:
            if entry[0].upper() == key:
                return entry
        up_line = (line_name or "").upper()
        for entry in self.entries:
            if entry[0].strip() and entry[0].upper() in up_line:
                return entry
        if len(self.entries) > 1:
            self.fallbacks.add(line_name)
        return self.entries[0]

    def resolve(self, line_name: str) -> Tuple[Optional[float], Optional[float]]:
        if not self.by_name:
            return None, None
        entry = self.resolve_entry(line_name)
        if entry is not None:
            return entry[1], entry[2]
        return next(iter(self.by_name.values()))


def _direct_name(el) -> str:
    nm = el.find("name")
    return (nm.text or "").strip() if nm is not None else ""


def find_line_container(doc):
    """Elemen yang langsung memuat folder LINE.

    Google Earth membungkus hasil 'Save Place As' dalam satu folder proyek,
    sehingga folder LINE tidak lagi anak langsung <Document>. Dulu hanya
    anak langsung Document yang dicari, dan berkas seperti itu 'sukses'
    tanpa satu pun yang diproses.
    """
    queue = [doc]
    while queue:
        node = queue.pop(0)
        subs = node.findall("Folder")
        if any(_is_line_folder_name(_direct_name(f)) for f in subs):
            return node
        queue.extend(subs)
    return doc


def _collect_line_folders(doc):
    """Temukan container utama, semua scope folder global, dan semua folder LINE.

    Mendukung struktur standar (LINE langsung di Document / satu folder proyek)
    maupun struktur berbungkus per-FDT (FDT 01/LINE A, FDT 02/LINE A).
    """
    direct_lines = [f for f in doc.findall("Folder") if _is_line_folder_name(_direct_name(f))]
    if direct_lines:
        return doc, [doc], direct_lines, {}

    container = find_line_container(doc)
    if container is doc:
        return doc, [doc], [], {}

    # Cek apakah ada folder saudara container yang juga membungkus folder LINE
    # (misalnya FDT 01/LINE A dan FDT 02/LINE B).
    parent_map = {child: parent for parent in doc.iter() for child in parent}
    wrapper_parent = parent_map.get(container, doc)
    sibling_wrappers = [
        f for f in wrapper_parent.findall("Folder")
        if any(_is_line_folder_name(_direct_name(sub)) for sub in f.findall("Folder"))
    ]

    if len(sibling_wrappers) > 1:
        scopes = [wrapper_parent] if wrapper_parent is doc else [wrapper_parent, doc]
        scopes.extend(sibling_wrappers)
        line_folders = []
        fdt_hints = {}
        for wr in sibling_wrappers:
            wr_name = _direct_name(wr)
            for sub in wr.findall("Folder"):
                if _is_line_folder_name(_direct_name(sub)):
                    line_folders.append(sub)
                    if _fdt_num_of(wr_name) is not None or "FDT" in wr_name.upper():
                        fdt_hints[id(sub)] = wr_name
        return wrapper_parent, scopes, line_folders, fdt_hints

    scopes = [container, doc]
    line_folders = [f for f in container.findall("Folder") if _is_line_folder_name(_direct_name(f))]
    return container, scopes, line_folders, {}


def scope_folders(scopes):
    """(induk, folder) untuk setiap Folder anak langsung dari tiap scope."""
    seen = set()
    for parent in scopes:
        for f in parent.findall("Folder"):
            if id(f) not in seen:
                seen.add(id(f))
                yield parent, f


def parse_kml_tolerant(raw_kml):
    """Parse KML, dengan satu percobaan pemulihan untuk prefix yatim.

    Ekspor Google Earth Pro memuat <gx:CascadingStyle kml:id="..."> dan
    mendeklarasikan xmlns-nya di elemen akar. Berkas yang sudah pernah
    disunting, dipotong, atau dihasilkan ulang oleh perkakas lain sering
    kehilangan deklarasi itu — dan parser lalu menolak SELURUH dokumen
    dengan 'unbound prefix', padahal sisa isinya utuh.

    Pemulihan hanya dicoba untuk kesalahan itu. Kesalahan lain — XML yang
    benar-benar rusak — tetap dilempar apa adanya, karena menyembunyikannya
    hanya menunda kebingungan ke tahap berikutnya.
    """
    try:
        return safe_fromstring(raw_kml)
    except ParseError as e:
        if "unbound prefix" not in str(e).lower():
            raise

        teks = (
            raw_kml.decode("utf-8", errors="ignore")
            if isinstance(raw_kml, (bytes, bytearray))
            else raw_kml
        )
        diperbaiki = repair_unbound_prefixes(teks)
        if diperbaiki == teks:
            raise

        return safe_fromstring(diperbaiki)


def parse_coords(text):
    """Parse KML coordinate string into list of valid (lon, lat) tuples."""
    pts = []
    if not text:
        return pts
    for c in text.strip().split():
        try:
            parts = c.split(",")
            if len(parts) < 2:
                continue
            lon, lat = float(parts[0]), float(parts[1])
            if (
                math.isfinite(lon)
                and math.isfinite(lat)
                and -180.0 <= lon <= 180.0
                and -90.0 <= lat <= 90.0
            ):
                pts.append((lon, lat))
        except Exception:
            continue
    return pts


def lonlat_to_xy(lon, lat, lat0=None):
    """Convert lon/lat to approximate metric x/y coordinates."""
    if lat0 is None:
        lat0 = lat
    x = lon * 111320.0 * math.cos(math.radians(lat0))
    y = lat * 110540.0
    return x, y


def line_length_m(coords):
    """Calculate total length of a polyline in meters."""
    if not coords or len(coords) < 2:
        return 0.0
    lat0 = sum(lat for lon, lat in coords) / len(coords)
    total = 0.0
    prev = None
    for lon, lat in coords:
        x, y = lonlat_to_xy(lon, lat, lat0)
        if prev is not None:
            total += math.hypot(x - prev[0], y - prev[1])
        prev = (x, y)
    return total


def point_linestring_distance_m(point, coords):
    """Calculate minimum distance from a point to a polyline in meters."""
    if not coords:
        return float('inf')
    lat0 = point[1]
    px, py = lonlat_to_xy(point[0], point[1], lat0)
    min_d = float('inf')
    for i in range(len(coords) - 1):
        x1, y1 = lonlat_to_xy(coords[i][0], coords[i][1], lat0)
        x2, y2 = lonlat_to_xy(coords[i + 1][0], coords[i + 1][1], lat0)
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            d = math.hypot(px - x1, py - y1)
        else:
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
            cx, cy = x1 + t * dx, y1 + t * dy
            d = math.hypot(px - cx, py - cy)
        if d < min_d:
            min_d = d
    return min_d


def haversine(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance between two lat/lon points in meters."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_pole_line_projection(pole_coords, line_coords):
    """Project a pole point onto a polyline. Returns (dist_along, perp_distance)."""
    if not line_coords or len(line_coords) < 2:
        return None

    lat0 = pole_coords[1]
    px, py = lonlat_to_xy(pole_coords[0], pole_coords[1], lat0)

    min_perp_d = float('inf')
    best_dist_along = 0.0
    accum_length = 0.0

    xy_coords = []
    for lon, lat in line_coords:
        x, y = lonlat_to_xy(lon, lat, lat0)
        xy_coords.append((x, y))

    for i in range(len(xy_coords) - 1):
        x1, y1 = xy_coords[i]
        x2, y2 = xy_coords[i + 1]
        dx, dy = x2 - x1, y2 - y1
        seg_len = math.hypot(dx, dy)

        if seg_len == 0:
            d = math.hypot(px - x1, py - y1)
            dist_along = accum_length
        else:
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (seg_len * seg_len)))
            cx, cy = x1 + t * dx, y1 + t * dy
            d = math.hypot(px - cx, py - cy)
            dist_along = accum_length + t * seg_len

        if d < min_perp_d:
            min_perp_d = d
            best_dist_along = dist_along

        accum_length += seg_len

    return best_dist_along, min_perp_d


def find_or_create_folder(parent, name):
    """Find a child Folder by name, or create one."""
    for sub in parent.findall("Folder"):
        nm_el = sub.find("name")
        if nm_el is not None and (nm_el.text or "").strip().upper() == name.upper():
            return sub
    folder = ET.Element("Folder")
    nm = ET.Element("name")
    nm.text = name
    folder.append(nm)
    parent.append(folder)
    return folder


def determine_pole_style(pm):
    """Determine pole style URL based on placemark content."""
    pm_str = _pole_metadata_text(pm)
    if "9-4" in pm_str or "9M" in pm_str:
        return "#style_pole_9m_4inch"
    elif "7-4" in pm_str or "7M 4" in pm_str:
        return "#style_pole_7m_4inch"
    elif "7-3" in pm_str or "7M 3" in pm_str:
        return "#style_pole_7m_3inch"
    elif "2.5" in pm_str or "2_5" in pm_str or "7M 2.5" in pm_str:
        return "#style_pole_7m_2_5inch"
    elif "EXISTING" in pm_str or "EXST" in pm_str:
        return "#style_pole_existing"
    else:
        return "#style_pole_7m_3inch"


# =====================================================================
# Custom Styles Injection
# =====================================================================

def inject_custom_styles(doc):
    """Inject Google Earth custom styles for legend design."""
    ids_to_remove = {
        "style_pole_9m_4inch", "style_pole_7m_4inch", "style_pole_7m_3inch", "style_pole_7m_2_5inch",
        "style_pole_existing", "style_fat", "style_homepass", "style_homepass_not_cover",
        "style_slack_cable", "style_slack_existing", "style_sling_wire", "style_cable_24c",
        "style_cable_36c", "style_cable_48c", "style_fdt_96c", "style_fdt_72c", "style_fdt_48c"
    }
    for el in list(doc):
        if el.tag in ("Style", "StyleMap"):
            style_id = el.get("id")
            if style_id in ids_to_remove:
                doc.remove(el)

    styles_xml = """
    <Style id="style_pole_9m_4inch">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_4inch">
        <IconStyle><color>ff00ff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_3inch">
        <IconStyle><color>ffffff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_2_5inch">
        <IconStyle><color>ffff00aa</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffff00aa</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_existing">
        <IconStyle><color>ffffffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fat">
        <IconStyle><color>ff00ffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_homepass">
        <IconStyle><color>ff00ff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_homepass_not_cover">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_slack_cable">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.0</scale></LabelStyle>
    </Style>
    <Style id="style_slack_existing">
        <IconStyle><color>ffffffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffffff</color><scale>0.0</scale></LabelStyle>
    </Style>
    <Style id="style_sling_wire">
        <LineStyle><color>ffffff00</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_24c">
        <LineStyle><color>ff00ff00</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_36c">
        <LineStyle><color>ffff00ff</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_48c">
        <LineStyle><color>ffff00aa</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_fdt_96c">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fdt_72c">
        <IconStyle><color>ff000055</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ff000055</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fdt_48c">
        <IconStyle><color>ffff00aa</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ffff00aa</color><scale>0.8</scale></LabelStyle>
    </Style>
    """
    for el in ET.fromstring(f"<root>{styles_xml}</root>"):
        doc.insert(0, el)


# =====================================================================
# Per-LINE: BOUNDARY & HP COVER
# =====================================================================


def get_fdt_name_from_line(line_name):
    upper_name = line_name.upper()
    if "FDT" in upper_name:
        idx = upper_name.find("FDT")
        return line_name[idx:].strip()
    return "FDT" # Fallback

def process_boundaries_and_hp_in_line(line_folder):
    """Process boundary polygons within a LINE folder, naming them with letters."""
    line_name = _direct_name(line_folder) or "LINE"
    letter = _line_letter(line_name)

    boundary_folder = None
    for sub in line_folder.findall("Folder"):
        sname = _direct_name(sub).upper()
        if "BOUNDARY" in sname and "CLUSTER" not in sname:
            boundary_folder = sub
            break

    polygons = []
    if boundary_folder is None:
        return polygons

    counter = 0
    for pm in list(boundary_folder.findall(".//Placemark")):
        coords_el = pm.find(".//Polygon/outerBoundaryIs/LinearRing/coordinates")
        if coords_el is None or not coords_el.text:
            continue
        coords = parse_coords(coords_el.text)
        if len(coords) < 3:
            continue
        poly = Polygon([(lon, lat) for lon, lat in coords])
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        counter += 1
        poly_name = f"{letter}{counter:02d}"
        nm_el = pm.find("name")
        if nm_el is None:
            nm_el = ET.Element("name")
            pm.insert(0, nm_el)
        nm_el.text = poly_name
        polygons.append((poly_name, poly, pm, letter))

    return polygons


# =====================================================================
# Move HP root
# =====================================================================

def _line_polygons(line_folder, polygons_by_line, polygons_by_folder=None):
    if polygons_by_folder and id(line_folder) in polygons_by_folder:
        return polygons_by_folder[id(line_folder)]
    line_name = _direct_name(line_folder)
    letter = _line_letter(line_name)
    return polygons_by_line.get(get_fdt_name_from_line(line_name), {}).get(letter, [])


def _iter_placemarks_with_parent(folder):
    for pm in list(folder.findall("Placemark")):
        yield folder, pm
    for sub in list(folder.findall("Folder")):
        yield from _iter_placemarks_with_parent(sub)


def move_root_hp_to_lines(scopes, line_folders, polygons_by_line, polygons_by_folder=None):
    """Move HP placemarks from root HP folder into line-specific HP COVER folders.

    Mengembalikan jumlah HP yang tidak masuk boundary mana pun (HP UNCOVER).
    """
    hp_roots = [
        (parent, f) for parent, f in scope_folders(scopes)
        if _direct_name(f).upper() == "HP"
    ]
    if not hp_roots:
        return 0
    uncovered = 0

    for hp_parent, root_hp_folder in hp_roots:
        to_remove = []
        for pm_parent, pm in list(_iter_placemarks_with_parent(root_hp_folder)):
            pt_coords = _parse_point_coords(pm)
            if pt_coords is None:
                continue
            lon, lat = pt_coords
            pt = Point(lon, lat)
            placed = False

            for line_folder in line_folders:
                polygons = _line_polygons(line_folder, polygons_by_line, polygons_by_folder)
                hp_folder = find_or_create_folder(line_folder, "HP COVER")
                for poly_name, poly, _, _ in polygons:
                    if poly.distance(pt) < 2e-5:
                        subfolder = find_or_create_folder(hp_folder, poly_name)
                        for st in pm.findall("styleUrl"):
                            pm.remove(st)
                        st_el = ET.Element("styleUrl")
                        st_el.text = "#style_homepass"
                        pm.append(st_el)
                        subfolder.append(pm)
                        placed = True
                        break
                if placed:
                    break

            if not placed and len(line_folders) > 0:
                # Masuk ke line yang boundary-nya paling dekat — dulu selalu ke
                # line pertama, meski HP-nya berada di area FDT lain.
                def jarak(lf):
                    polys = _line_polygons(lf, polygons_by_line, polygons_by_folder)
                    return min((p[1].distance(pt) for p in polys), default=float("inf"))
                target_line = min(line_folders, key=jarak)
                hp_folder = find_or_create_folder(target_line, "HP UNCOVER")
                uncovered += 1
                for st in pm.findall("styleUrl"):
                    pm.remove(st)
                st_el = ET.Element("styleUrl")
                st_el.text = "#style_homepass_not_cover"
                pm.append(st_el)
                hp_folder.append(pm)

            to_remove.append((pm_parent, pm))

        for pm_parent, pm in to_remove:
            try:
                pm_parent.remove(pm)
            except ValueError:
                pass

        if len(list(root_hp_folder.findall(".//Placemark"))) == 0:
            try:
                hp_parent.remove(root_hp_folder)
            except ValueError:
                pass
    return uncovered


# =====================================================================
# Update Boundary Descriptions
# =====================================================================

def update_boundary_descriptions(line_folders, polygons_by_line, polygons_by_folder=None):
    """Update boundary polygon descriptions with HP count."""
    for line_folder in line_folders:
        polygons = _line_polygons(line_folder, polygons_by_line, polygons_by_folder)
        hp_folder = None
        for sub in line_folder.findall("Folder"):
            sname = sub.find("name")
            if sname is not None and "HP COVER" in (sname.text or "").upper():
                hp_folder = sub
                break
        if hp_folder is None:
            continue
        for poly_name, poly, pm, letter in polygons:
            subfolder = find_or_create_folder(hp_folder, poly_name)
            jumlah = len(subfolder.findall("Placemark"))
            desc_el = pm.find("description")
            if desc_el is None:
                desc_el = ET.Element("description")
                pm.append(desc_el)
            desc_el.text = f"{jumlah} HP"


# =====================================================================
# FAT / CABLE / SLINGWIRE per LINE
# =====================================================================

def _is_cable_folder(name: str) -> bool:
    u = (name or "").upper()
    return ("DISTRIBUTION" in u or "CABLE" in u or "KABEL" in u) and "SLING" not in u


# Aturan desain: setiap UJUNG kabel distribusi dan setiap titik balik kabel
# LOOPBACK pasti FAT. Dulu FAT dipilih murni dari tiang terdekat ke titik
# tengah boundary, sehingga ujung kabel sering berakhir di tiang biasa.
CABLE_JOIN_TOL_M = 2.0       # ujung yang sedekat ini ke kabel lain = sambungan
SELF_RETURN_SKIP_M = 10.0    # abaikan bagian kabel sepanjang ini dari ujungnya
LOOPBACK_TURN_DEG = 150.0    # belokan sebesar ini = kabel berbalik arah
FORCED_BOUNDARY_TOL_M = 15.0 # tiang ujung kabel boleh sejauh ini di luar boundary


def _dist_to_polygon_m(lon, lat, poly) -> float:
    """Jarak (meter) titik ke poligon lon/lat; 0 kalau di dalamnya."""
    if poly.is_empty:
        return float("inf")
    pt = Point(lon, lat)
    if poly.contains(pt):
        return 0.0
    _, q = nearest_points(pt, poly)
    return haversine(lat, lon, q.y, q.x)


def _cumulative_m(coords):
    acc, out = 0.0, [0.0]
    for a, b in zip(coords, coords[1:]):
        acc += line_length_m([a, b])
        out.append(acc)
    return out


def _end_returns_to_own_line(coords, at_start: bool) -> bool:
    """Ujung kabel yang kembali menempel ke kabelnya sendiri (kabel loopback)."""
    cum = _cumulative_m(coords)
    total = cum[-1]
    if total <= SELF_RETURN_SKIP_M * 2:
        return False
    if at_start:
        pt = coords[0]
        rest = [p for p, c in zip(coords, cum) if c >= SELF_RETURN_SKIP_M]
    else:
        pt = coords[-1]
        rest = [p for p, c in zip(coords, cum) if c <= total - SELF_RETURN_SKIP_M]
    if len(rest) < 2:
        return False
    return point_linestring_distance_m(pt, rest) <= CABLE_JOIN_TOL_M


def mandatory_fat_points(dist_lines, fdt_lonlat=None):
    """Titik yang WAJIB jadi FAT: ujung kabel dan titik balik kabel loopback.

    * Ujung kabel = ujung LineString yang tidak menyambung ke kabel lain dan
      tidak kembali ke kabelnya sendiri. Ujung yang paling dekat FDT adalah
      awal kabel, bukan ujung, jadi dikecualikan. Tanpa titik FDT awal kabel
      tidak bisa dibedakan dari ujungnya, jadi ujung kabel tidak dipaksakan.
    * Titik balik loopback = vertex tempat kabel berbalik arah (belokan
      >= LOOPBACK_TURN_DEG), yaitu ujung sebenarnya dari kabel yang
      pergi lalu kembali lewat jalur yang sama.

    Mengembalikan list (lon, lat, jenis) dengan jenis 'ujung' atau 'loopback'.
    """
    out = []
    ends = []
    for i, line in enumerate(dist_lines):
        if len(line) < 2:
            continue
        for at_start, pt in ((True, line[0]), (False, line[-1])):
            joined = any(
                point_linestring_distance_m(pt, other) <= CABLE_JOIN_TOL_M
                for j, other in enumerate(dist_lines) if j != i and len(other) >= 2
            )
            if joined or _end_returns_to_own_line(line, at_start):
                continue
            ends.append(pt)

    if fdt_lonlat is not None and ends:
        start = min(ends, key=lambda p: haversine(p[1], p[0], fdt_lonlat[1], fdt_lonlat[0]))
        ends.remove(start)
        out.extend((lon, lat, "ujung") for lon, lat in ends)

    for line in dist_lines:
        if len(line) < 3:
            continue
        lat0 = sum(lat for _, lat in line) / len(line)
        xy = [lonlat_to_xy(lon, lat, lat0) for lon, lat in line]
        for k in range(1, len(line) - 1):
            ax, ay = xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]
            bx, by = xy[k + 1][0] - xy[k][0], xy[k + 1][1] - xy[k][1]
            la, lb = math.hypot(ax, ay), math.hypot(bx, by)
            if la == 0 or lb == 0:
                continue
            cos_t = max(-1.0, min(1.0, (ax * bx + ay * by) / (la * lb)))
            if math.degrees(math.acos(cos_t)) >= LOOPBACK_TURN_DEG:
                out.append((line[k][0], line[k][1], "loopback"))
    return out


def process_fat_cable_sling_for_line(line_folder, polygons, global_poles, fdt_count,
                                     doc, line_folders, fdt_lat, fdt_lon,
                                     tol_m_pole_line=5.0, report=None,
                                     all_line_polygons=None):
    """Process FAT placement, cable descriptions, and sling wire for a single LINE folder."""
    dist_lines = []
    cable_pms = []
    cable_segs = []
    line_name = _direct_name(line_folder) or "LINE"
    for sub in line_folder.findall("Folder"):
        sname = sub.find("name")
        if sname is None:
            continue
        # HANYA folder kabel distribusi. Dulu setiap LineString di sub-folder
        # mana pun ikut diperlakukan sebagai kabel — termasuk SLING WIRE —
        # sehingga saat diproses ulang semua sling berganti nama jadi
        # "CABLE LINE ..." dan ikut mendapat slack.
        if not _is_cable_folder(sname.text):
            continue
        for pm in sub.findall("Placemark"):
            segs = [
                parse_coords(c.text)
                for c in pm.findall(".//LineString/coordinates")
                if c.text
            ]
            segs = [s for s in segs if len(s) >= 2]
            if not segs:
                continue
            dist_lines.extend(segs)
            cable_pms.append(pm)
            cable_segs.append((_direct_name(sub), segs))

    other_polys = [
        poly for other_id, opolys in (all_line_polygons or {}).items()
        if other_id != id(line_folder)
        for _, poly, _, _ in opolys
    ]

    poles = []
    for gp in global_poles:
        pm_pole, _, lon, lat, is_exist = gp[:5]
        pt = Point(lon, lat)
        strict_hits = []
        best_strict_d = float("inf")
        best_strict_name = None
        for poly_name, poly, poly_pm, letter in polygons:
            d_m = _dist_to_polygon_m(lon, lat, poly)
            if poly.distance(pt) < 2e-5 or d_m <= 3.0:
                strict_hits.append(poly_name)
                if d_m < best_strict_d:
                    best_strict_d = d_m
                    best_strict_name = poly_name
        if strict_hits:
            poles.append({
                "pm": pm_pole,
                "lon": lon,
                "lat": lat,
                "poly": best_strict_name or strict_hits[0],
                "polys": set(strict_hits),
                "strict_polys": set(strict_hits),
                "is_exist": is_exist,
            })
            continue

        # Tiang pinggir jalan yang berdiri sedikit di luar poligon boundary
        # (<= FORCED_BOUNDARY_TOL_M) ikut dipetakan ke boundary terdekat di
        # line ini asal tidak berada di dalam boundary line lain.
        if not polygons:
            continue
        near_poly, near_d = None, float("inf")
        for poly_name, poly, _, _ in polygons:
            d_m = _dist_to_polygon_m(lon, lat, poly)
            if d_m < near_d:
                near_poly, near_d = poly_name, d_m
        if near_poly is None or near_d > FORCED_BOUNDARY_TOL_M:
            continue
        if other_polys:
            min_other = min(_dist_to_polygon_m(lon, lat, op) for op in other_polys)
            if min_other <= 3.0 or min_other < near_d:
                continue
        poles.append({
            "pm": pm_pole,
            "lon": lon,
            "lat": lat,
            "poly": near_poly,
            "polys": {near_poly},
            "strict_polys": set(),
            "is_exist": is_exist,
        })

    # Tiang yang WAJIB jadi FAT: tiang di ujung kabel / titik balik loopback.
    fdt_lonlat = (fdt_lon, fdt_lat) if fdt_lat is not None else None
    forced = {}              # id(pole dict) -> jenis
    forced_no_pole = []
    forced_outside = []
    by_pm = {id(p["pm"]): p for p in poles}
    for lon, lat, kind in mandatory_fat_points(dist_lines, fdt_lonlat):
        nearest, nd = None, float("inf")
        for gp in global_poles:
            d = haversine(lat, lon, gp[3], gp[2])
            if d < nd:
                nearest, nd = gp, d
        if nearest is None or nd > tol_m_pole_line:
            forced_no_pole.append(f"{kind} {lat:.6f},{lon:.6f}")
            continue
        pole = by_pm.get(id(nearest[0]))
        if pole is None:
            # Tiang ujung kabel biasanya berdiri di jalan, sedikit di luar
            # boundary yang digambar mengelilingi rumah. Tempelkan ke
            # boundary terdekat di line ini kalau jaraknya masih wajar.
            plon, plat = nearest[2], nearest[3]
            near_poly, near_d = None, float("inf")
            for poly_name, poly, _, _ in polygons:
                d = _dist_to_polygon_m(plon, plat, poly)
                if d < near_d:
                    near_poly, near_d = poly_name, d
            if near_poly is None or near_d > FORCED_BOUNDARY_TOL_M:
                forced_outside.append(f"{kind} {lat:.6f},{lon:.6f}")
                continue
            pole = {
                "pm": nearest[0],
                "lon": plon,
                "lat": plat,
                "poly": near_poly,
                "polys": {near_poly},
                "strict_polys": set(),
                "is_exist": nearest[4],
            }
            poles.append(pole)
            by_pm[id(nearest[0])] = pole
        forced[id(pole)] = kind
    if report is not None and fdt_lonlat is None and dist_lines:
        report.warn(f"{line_name}: titik FDT tidak diketahui — ujung kabel tidak bisa "
                    "dibedakan dari awal kabel, jadi FAT di ujung kabel tidak dipaksakan")

    fat_folder = find_or_create_folder(line_folder, "FAT")
    for pm in list(fat_folder.findall("Placemark")):
        fat_folder.remove(pm)
    fat_count = 0
    fat_points = []
    no_fat = []
    forced_used = 0
    double_forced = []
    used_fat_pms = set()
    chosen_by_poly = {}
    candidates_by_poly = {}
    forced_polys = set()
    deferred_polys = []

    def _pick_best_for_poly(poly, pool):
        cx, cy = poly.centroid.x, poly.centroid.y
        best, best_d = None, float('inf')
        for c in pool:
            d = (c["lon"] - cx) ** 2 + (c["lat"] - cy) ** 2
            if d < best_d:
                best, best_d = c, d
        return best

    # Pass 1: pilih FAT untuk tiap boundary dari kandidatnya sendiri.
    for poly_name, poly, poly_pm, letter in polygons:
        strict_candidates = []
        street_candidates = []
        for p in poles:
            if poly_name not in p["polys"]:
                continue
            if any(point_linestring_distance_m((p["lon"], p["lat"]), dline) <= tol_m_pole_line for dline in dist_lines):
                if poly_name in p["strict_polys"]:
                    strict_candidates.append(p)
                else:
                    street_candidates.append(p)
        candidates = strict_candidates if strict_candidates else street_candidates

        in_poly_forced = [
            p for p in poles
            if poly_name in p["polys"] and id(p) in forced
            and (poly_name in p["strict_polys"] or not strict_candidates)
        ]
        if in_poly_forced:
            # Tiang ujung kabel / loopback di boundary ini mengalahkan
            # tiang yang sekadar paling dekat ke titik tengahnya.
            candidates = in_poly_forced
            forced_polys.add(poly_name)
            forced_used += 1
            if len(in_poly_forced) > 1:
                double_forced.append(poly_name)
        if not candidates:
            deferred_polys.append((poly_name, poly))
            continue
        candidates_by_poly[poly_name] = candidates
        # Hindari memilih tiang yang sudah dipakai boundary lain bila masih ada kandidat lain.
        unused = [c for c in candidates if id(c["pm"]) not in used_fat_pms]
        pool = unused if unused else candidates
        best = _pick_best_for_poly(poly, pool)
        if best is not None:
            used_fat_pms.add(id(best["pm"]))
            chosen_by_poly[poly_name] = best

    # Pass 2: boundary yang masih kosong boleh memakai tiang jalur kabel
    # yang belum terpakai di dekatnya (<= FORCED_BOUNDARY_TOL_M), atau bertukar
    # dengan boundary tetangga yang masih punya alternatif tiang lain.
    poly_by_name = {pn: po for pn, po, _, _ in polygons}
    for poly_name, poly in deferred_polys:
        near_cable_poles = [
            p for p in poles
            if _dist_to_polygon_m(p["lon"], p["lat"], poly) <= FORCED_BOUNDARY_TOL_M
            and any(point_linestring_distance_m((p["lon"], p["lat"]), dline) <= tol_m_pole_line for dline in dist_lines)
        ]
        fallback_pool = [p for p in near_cable_poles if id(p["pm"]) not in used_fat_pms]
        if fallback_pool:
            best = _pick_best_for_poly(poly, fallback_pool)
            if best is not None:
                used_fat_pms.add(id(best["pm"]))
                chosen_by_poly[poly_name] = best
            continue

        swapped = False
        for cand in sorted(
            near_cable_poles,
            key=lambda c: _dist_to_polygon_m(c["lon"], c["lat"], poly),
        ):
            owner_poly = next(
                (oname for oname, op in chosen_by_poly.items()
                 if id(op["pm"]) == id(cand["pm"]) and oname not in forced_polys),
                None,
            )
            if owner_poly is None:
                continue
            alts = [
                a for a in candidates_by_poly.get(owner_poly, [])
                if id(a["pm"]) not in used_fat_pms
            ]
            if not alts:
                continue
            alt_best = _pick_best_for_poly(poly_by_name[owner_poly], alts)
            if alt_best is not None:
                chosen_by_poly[owner_poly] = alt_best
                used_fat_pms.add(id(alt_best["pm"]))
                chosen_by_poly[poly_name] = cand
                swapped = True
                break
        if not swapped:
            no_fat.append(poly_name)

    for poly_name, poly, poly_pm, letter in polygons:
        best = chosen_by_poly.get(poly_name)
        if best is not None:
            new_pm = ET.Element("Placemark")
            nm_el = ET.Element("name")
            nm_el.text = poly_name
            new_pm.append(nm_el)
            st_el = ET.Element("styleUrl")
            st_el.text = "#style_fat"
            new_pm.append(st_el)
            pt_el = ET.Element("Point")
            coord_el = ET.Element("coordinates")
            coord_el.text = f"{best['lon']},{best['lat']},0"
            pt_el.append(coord_el)
            new_pm.append(pt_el)
            fat_folder.append(new_pm)
            fat_count += 1
            fat_points.append((best["lon"], best["lat"]))

    if report is not None:
        if no_fat:
            report.warn(f"{line_name}: boundary tanpa FAT karena tidak ada tiang dalam "
                        f"{tol_m_pole_line:.0f} m dari kabel distribusi", no_fat)
        if double_forced:
            report.warn(f"{line_name}: boundary dengan lebih dari satu ujung kabel/loopback — "
                        "hanya satu yang jadi FAT, periksa pembagian boundary", double_forced)
        if forced_outside:
            report.warn(f"{line_name}: tiang ujung kabel/loopback lebih dari "
                        f"{FORCED_BOUNDARY_TOL_M:.0f} m dari boundary mana pun di line ini, "
                        "FAT-nya tidak bisa dibuat", forced_outside)
        if forced_no_pole:
            report.warn(f"{line_name}: ujung kabel/loopback tanpa tiang dalam "
                        f"{tol_m_pole_line:.0f} m", forced_no_pole)
        report.stats["fat_di_ujung_kabel"] = report.stats.get("fat_di_ujung_kabel", 0) + forced_used

    # CABLE processing
    n_poly = len(polygons)
    fo_text = "FO 24C/2T" if n_poly <= 10 else ("FO 36C/3T" if n_poly <= 15 else "FO 48C/4T")
    if report is not None and n_poly > 20:
        report.warn(f"{line_name}: {n_poly} boundary FAT melebihi kapasitas kabel 48C/4T")
    served = set()
    poles_list = poles[:]

    # Slack dibagi ke segmen kabel yang tepat. Dulu SETIAP segmen mendapat
    # slack seluruh FAT di line, ditambah slack SEMUA FDT di dokumen —
    # line dengan dua segmen kabel menghitung slack dua kali lipat.
    valid_idx = list(range(len(cable_pms)))
    fdt_slack = defaultdict(int)
    fat_slack = defaultdict(int)
    if valid_idx:
        def _min_dist_to_segs(pt, segs):
            return min(point_linestring_distance_m(pt, s) for s in segs)

        if fdt_lat is not None:
            nearest = min(valid_idx, key=lambda i: _min_dist_to_segs((fdt_lon, fdt_lat), cable_segs[i][1]))
        else:
            nearest = valid_idx[0]
        fdt_slack[nearest] = 1
        for fp in fat_points:
            j = min(valid_idx, key=lambda i: _min_dist_to_segs(fp, cable_segs[i][1]))
            fat_slack[j] += 1

    for ci, pm in enumerate(cable_pms):
        cable_folder_name, segs = cable_segs[ci]
        total_route = int(round(sum(line_length_m(s) for s in segs)))

        for i, p in enumerate(poles_list):
            if any(point_linestring_distance_m((p["lon"], p["lat"]), s) <= 10 for s in segs):
                served.add(i)

        n_fdt_slack, n_fat_slack = fdt_slack[ci], fat_slack[ci]
        total_slack_units = n_fdt_slack + n_fat_slack
        total_slack = total_slack_units * 20
        # Toleransi standar cluster FTTH: 5% (pembulatan ke atas) dari route + slack.
        toleransi = math.ceil((total_route + total_slack) * 0.05) if (total_route + total_slack) > 0 else 0
        total_length = total_route + total_slack + toleransi

        nm_el = pm.find("name")
        if nm_el is None:
            nm_el = ET.Element("name")
            pm.insert(0, nm_el)

        orig_name = nm_el.text or ""
        desc_el = pm.find("description")
        orig_desc = desc_el.text if desc_el is not None and desc_el.text else ""
        prefix_part = _extract_cable_prefix(orig_name)
        topo = _detect_cable_topology(orig_name, orig_desc, cable_folder_name)

        nm_el.text = f"{prefix_part}CABLE {line_name} ({fo_text}) -{topo}- {total_length} m"

        if "24" in fo_text:
            cable_style = "#style_cable_24c"
        elif "36" in fo_text:
            cable_style = "#style_cable_36c"
        else:
            cable_style = "#style_cable_48c"

        for st in pm.findall("styleUrl"):
            pm.remove(st)
        st_el = ET.Element("styleUrl")
        st_el.text = cable_style
        pm.append(st_el)

        desc = desc_el
        if desc is None:
            desc = ET.Element("description")
            pm.append(desc)
        desc.text = (
            f"Total Route : {total_route} m\n"
            f"Total Slack : {total_slack_units} unit ({n_fdt_slack} slack FDT & {n_fat_slack} slack FAT) @20 m\n"
            f"Toleransi : {toleransi} m\n\n"
            f"Total Length Cable  : {total_route} + {total_slack} + {toleransi}  : {total_length} m"
        )

    # SLING WIRE generation
    sling_folder = find_or_create_folder(line_folder, "SLING WIRE")
    # Sling hasil proses sebelumnya dibuang dulu supaya proses ulang tidak
    # menggandakannya. Sling yang digambar tangan (style lain) dibiarkan.
    manual_sling_lines = []
    for old in list(sling_folder.findall("Placemark")):
        st = old.find("styleUrl")
        if st is not None and (st.text or "").strip() == "#style_sling_wire":
            sling_folder.remove(old)
        else:
            for c_el in old.findall(".//LineString/coordinates"):
                if c_el.text:
                    pts = parse_coords(c_el.text)
                    if len(pts) >= 2:
                        manual_sling_lines.append(pts)
    connections = []

    if served:
        connected = set(served)
        # Propagasikan koneksi lewat sling wire manual agar tidak digandakan.
        if manual_sling_lines:
            manual_adj = defaultdict(set)
            for mpts in manual_sling_lines:
                hit_indices = [
                    i for i, p in enumerate(poles_list)
                    if point_linestring_distance_m((p["lon"], p["lat"]), mpts) <= 5.0
                ]
                for a in hit_indices:
                    for b in hit_indices:
                        if a != b:
                            manual_adj[a].add(b)
            queue_m = list(connected)
            while queue_m:
                cur = queue_m.pop(0)
                for nxt in manual_adj.get(cur, ()):
                    if nxt not in connected:
                        connected.add(nxt)
                        queue_m.append(nxt)

        unconnected = {i for i in range(len(poles_list)) if i not in connected}

        while unconnected:
            best_p, best_q, best_d = None, None, float('inf')
            for p_idx in unconnected:
                p = poles_list[p_idx]
                for q_idx in connected:
                    q = poles_list[q_idx]
                    d = line_length_m([(p["lon"], p["lat"]), (q["lon"], q["lat"])])
                    if d < best_d:
                        best_d = d
                        best_p = p_idx
                        best_q = q_idx
            if best_p is not None and best_d <= 60.0:
                if best_d > 0.5:
                    connections.append((best_p, best_q, best_d, poles_list[best_p], poles_list[best_q]))
                unconnected.remove(best_p)
                connected.add(best_p)
            else:
                break

    created = set()
    for p_idx, q_idx, best_d, p, q in connections:
        key = tuple(sorted((p_idx, q_idx)))
        if key in created:
            continue
        created.add(key)

        pm_ls = ET.Element("Placemark")
        nm_sw = ET.Element("name")
        nm_sw.text = f"{int(round(best_d))} m"
        pm_ls.append(nm_sw)

        st_el = ET.Element("styleUrl")
        st_el.text = "#style_sling_wire"
        pm_ls.append(st_el)

        ls = ET.Element("LineString")
        tess = ET.Element("tessellate")
        tess.text = "1"
        ls.append(tess)
        coords_sw = ET.Element("coordinates")
        coords_sw.text = f"{p['lon']},{p['lat']},0 {q['lon']},{q['lat']},0"
        ls.append(coords_sw)
        pm_ls.append(ls)

        sling_folder.append(pm_ls)

    return fat_count


# =====================================================================
# POLE Numbering (global)
# =====================================================================

def _renamed_pole(pm, name: str, style_url: str):
    """Salinan placemark tiang asli dengan nama & style baru (tanpa ExtendedData)."""
    new_pm = copy.deepcopy(pm)
    _strip_extended_data(new_pm)
    for tag in ("styleUrl", "Style", "StyleMap"):
        for el in new_pm.findall(tag):
            new_pm.remove(el)
    nm = new_pm.find("name")
    if nm is None:
        nm = ET.Element("name")
        new_pm.insert(0, nm)
    nm.text = name
    st_el = ET.Element("styleUrl")
    st_el.text = style_url
    new_pm.append(st_el)
    return new_pm


def _classify_pole_size(
    pm_str: str,
    is_exist: bool,
    is_fdt: bool = False,
    is_fat: bool = False,
    is_loopback: bool = False,
    is_sharp_bend: bool = False,
) -> Tuple[str, str]:
    """Tentukan ukuran tiang ('7-2.5', '7-3', '7-4', '9-4') dan styleUrl.

    Syarat beban (FDT min 7-4; FAT/loopback/belokan tajam min 7-3) hanya
    menaikkan spesifikasi tiang, tidak pernah menurunkan tiang 9-4 atau 7-4
    (mis. EXISTING POLE 7-4 agar tidak bergeser dari kolom BOQ 7-4).
    """
    rank_to_spec = {
        1: ("7-2.5", "#style_pole_7m_2_5inch"),
        2: ("7-3", "#style_pole_7m_3inch"),
        3: ("7-4", "#style_pole_7m_4inch"),
        4: ("9-4", "#style_pole_9m_4inch"),
    }
    if "9-4" in pm_str or "9M" in pm_str:
        base_rank = 4
    elif "7-4" in pm_str or "7M 4" in pm_str:
        base_rank = 3
    elif "7-3" in pm_str or "7M 3" in pm_str:
        base_rank = 2
    elif "2.5" in pm_str or "2_5" in pm_str or "7M 2.5" in pm_str:
        base_rank = 1
    else:
        base_rank = 3 if is_exist else 1

    req_rank = 3 if is_fdt else (2 if (is_fat or is_loopback or is_sharp_bend) else 1)
    return rank_to_spec[max(base_rank, req_rank)]


def _make_slack_placemark(name: str, lon: float, lat: float) -> ET.Element:
    """Buat placemark SLACK HANGER yang bersih tanpa ExtendedData."""
    pm = ET.Element("Placemark")
    nm = ET.Element("name")
    nm.text = name
    pm.append(nm)
    st = ET.Element("styleUrl")
    st.text = "#style_slack_cable"
    pm.append(st)
    pt = ET.Element("Point")
    coords = ET.Element("coordinates")
    coords.text = f"{lon},{lat},0"
    pt.append(coords)
    pm.append(pt)
    return pm


def generate_slack_hangers(scopes, fdts, line_folders, fdt_hints=None) -> None:
    """Bangun folder SLACK HANGER untuk tiap LINE berdasarkan FDT dan FAT aktual.

    Menjamin:
    - Tidak ada placemark bernama mentah 'FDT' di dalam SLACK HANGER (selalu 'SLACK.FDT...').
    - Setiap FAT di folder FAT mendapat 'SLACK.FAT.<KODE>' tepat di koordinatnya.
    - Setiap FDT pada dokumen multi-FDT tetap mendapat slack FDT masing-masing.
    """
    if isinstance(fdts, dict):
        idx = FdtIndex()
        for k, (la, lo) in fdts.items():
            idx.add(k, la, lo)
        fdts = idx

    added_fdt_slacks = set()
    for line_folder in line_folders:
        for sub in list(line_folder.findall("Folder")):
            if _direct_name(sub).upper() == "SLACK HANGER":
                line_folder.remove(sub)

        slack_folder = ET.Element("Folder")
        snm = ET.Element("name")
        snm.text = "SLACK HANGER"
        slack_folder.append(snm)
        has_slack = False

        line_name = _direct_name(line_folder)
        lookup_name = (fdt_hints or {}).get(id(line_folder), line_name)
        fdt_entry = fdts.resolve_entry(lookup_name) if len(fdts) else None
        if fdt_entry is not None:
            fdt_name_resolved, fdt_lat, fdt_lon, _ = fdt_entry
            fdt_key = (round(fdt_lat, 6), round(fdt_lon, 6))
            if fdt_key not in added_fdt_slacks:
                added_fdt_slacks.add(fdt_key)
                fdt_num = _fdt_num_of(fdt_name_resolved)
                slack_fdt_name = (
                    f"SLACK.FDT.{fdt_num:02d}"
                    if (len(fdts) > 1 and fdt_num is not None)
                    else "SLACK.FDT"
                )
                slack_folder.append(_make_slack_placemark(slack_fdt_name, fdt_lon, fdt_lat))
                has_slack = True

        fat_folder_ref = None
        for sub in line_folder.findall("Folder"):
            if _direct_name(sub).upper() == "FAT":
                fat_folder_ref = sub
                break
        if fat_folder_ref is not None:
            for pm in fat_folder_ref.findall("Placemark"):
                pt_coords = _parse_point_coords(pm)
                if pt_coords is None:
                    continue
                flon, flat = pt_coords
                slack_fat_name = _slack_fat_name(_direct_name(pm))
                slack_folder.append(_make_slack_placemark(slack_fat_name, flon, flat))
                has_slack = True

        if has_slack:
            line_folder.append(slack_folder)


def _collect_poles_from_folder(folder, poles_out, hints_out, is_line_sub=False):
    """Kumpulkan placemark tiang secara rekursif beserta hint nama foldernya."""
    fname = _direct_name(folder).upper()
    for pm_parent, pm in _iter_placemarks_with_parent(folder):
        pt_coords = _parse_point_coords(pm)
        if pt_coords is None:
            continue
        lon, lat = pt_coords
        parent_name = _direct_name(pm_parent)
        hint = parent_name or fname
        pm_str = _pole_metadata_text(pm, hint)
        is_exist = (
            fname == "EXT"
            or fname.startswith("EXT ")
            or fname.startswith("EXST")
            or fname.startswith("EXISTING")
            or ("EXISTING" in pm_str)
            or ("EXST" in pm_str)
        )
        poles_out.append((pm, pm_parent, lon, lat, is_exist, hint, is_line_sub))
        hints_out[id(pm)] = hint


def process_poles(
    scopes,
    fdts,
    tol_m=5.0,
    line_folders=None,
    container=None,
    report=None,
    fdt_hints=None,
):
    """Process and renumber all poles based on distribution cable and sling wire routes.

    `scopes`: elemen yang anak-anaknya memuat folder POLE/NP/EXT dan FDT.
    `fdts`: FdtIndex (atau dict nama -> (lat, lon) untuk pemanggil lama).
    """
    if not isinstance(scopes, (list, tuple)):
        scopes = [scopes]
    if isinstance(fdts, dict):
        idx = FdtIndex()
        for k, (la, lo) in fdts.items():
            idx.add(k, la, lo)
        fdts = idx
    container = container if container is not None else scopes[0]

    if line_folders is None:
        line_folders = [
            f for _, f in scope_folders(scopes)
            if _is_line_folder_name(_direct_name(f))
        ]
    line_folders = list(line_folders)

    def fdt_group_key(lf):
        name = (fdt_hints or {}).get(id(lf), _direct_name(lf))
        num = _fdt_num_of(name)
        return (num if num is not None else 0, get_fdt_name_from_line(name).upper())

    # Group line folders by FDT (sort stabil: urutan LINE di dalam FDT tetap)
    line_folders.sort(key=fdt_group_key)

    collected = []
    pole_hints = {}
    seen_pms = set()
    for _, f in scope_folders(scopes):
        fname = _direct_name(f)
        if _is_pole_folder_name(fname):
            tmp = []
            _collect_poles_from_folder(f, tmp, pole_hints, is_line_sub=False)
            for item in tmp:
                if id(item[0]) not in seen_pms:
                    seen_pms.add(id(item[0]))
                    collected.append(item)

    for lf in line_folders:
        for sub in list(lf.findall("Folder")):
            sname = _direct_name(sub)
            if _is_pole_folder_name(sname):
                tmp = []
                _collect_poles_from_folder(sub, tmp, pole_hints, is_line_sub=True)
                for item in tmp:
                    if id(item[0]) not in seen_pms:
                        seen_pms.add(id(item[0]))
                        collected.append(item)

    poles = {}
    for pm, pm_parent, lon, lat, is_exist, _, _ in collected:
        poles[pm] = (lat, lon, is_exist)

    # Bersihkan folder UNASSIGNED lama & tiang lama di dalam LINE agar proses ulang tidak menggandakan tiang.
    for parent, f in list(scope_folders(scopes)):
        if "UNASSIGNED" in _direct_name(f).upper() and _is_pole_folder_name(_direct_name(f)):
            try:
                parent.remove(f)
            except ValueError:
                pass
    for lf in line_folders:
        for sub in list(lf.findall("Folder")):
            if _is_pole_folder_name(_direct_name(sub)):
                for old_pm in list(sub.findall("Placemark")):
                    sub.remove(old_pm)

    if not poles:
        print("[WARNING] Tidak ada POLE ditemukan")
        generate_slack_hangers(scopes, fdts, line_folders, fdt_hints=fdt_hints)
        return

    def coords_key_pm(pm):
        lat, lon, _ = poles[pm]
        return (round(lat, 6), round(lon, 6))

    def map_line_to_poles(coords):
        candidates = []
        for pm, (plat, plon, _) in poles.items():
            proj = get_pole_line_projection((plon, plat), coords)
            if proj is not None:
                dist_along, perp_d = proj
                if perp_d <= tol_m:
                    candidates.append((pm, dist_along))
        candidates.sort(key=lambda x: x[1])
        return [pm for pm, _ in candidates]

    visited_coords = set()
    numbered = 0
    new_pole_counter = 1
    existing_pole_counter = 1
    last_fdt = None

    for line_folder in line_folders:
        line_name = _direct_name(line_folder).upper()
        lookup_name = (fdt_hints or {}).get(id(line_folder), line_name)

        distribution_coords_list = []
        sling_coords_list = []
        for sub in line_folder.findall("Folder"):
            stext = _direct_name(sub).upper()
            if not stext:
                continue
            if ("DISTRIBUTION" in stext or "CABLE" in stext or "KABEL" in stext) and "SLING" not in stext:
                for pm in sub.findall("Placemark"):
                    for coords_el in pm.findall(".//LineString/coordinates"):
                        if coords_el.text:
                            coords = parse_coords(coords_el.text)
                            if len(coords) >= 2:
                                distribution_coords_list.append(coords)
            if "SLING" in stext:
                for pm in sub.findall("Placemark"):
                    for coords_el in pm.findall(".//LineString/coordinates"):
                        if coords_el.text:
                            coords = parse_coords(coords_el.text)
                            if len(coords) >= 2:
                                sling_coords_list.append(coords)

        # Get FAT coordinates for this line
        fat_coords = []
        for sub in line_folder.findall("Folder"):
            if _direct_name(sub).upper() == "FAT":
                for pm in sub.findall("Placemark"):
                    pt_coords = _parse_point_coords(pm)
                    if pt_coords is not None:
                        fat_coords.append((pt_coords[1], pt_coords[0]))

        # Get bend points > 30 degrees for this line
        bend_points = set()
        for pts in distribution_coords_list:
            if len(pts) < 3:
                continue
            avg_lat = sum(lat for lon, lat in pts) / len(pts)
            xy_pts = [lonlat_to_xy(lon, lat, avg_lat) for lon, lat in pts]
            for i in range(1, len(pts) - 1):
                A = xy_pts[i - 1]
                B = xy_pts[i]
                C = xy_pts[i + 1]
                dx1, dy1 = B[0] - A[0], B[1] - A[1]
                dx2, dy2 = C[0] - B[0], C[1] - B[1]
                len1 = math.hypot(dx1, dy1)
                len2 = math.hypot(dx2, dy2)
                if len1 > 0 and len2 > 0:
                    dot = dx1 * dx2 + dy1 * dy2
                    cos_theta = dot / (len1 * len2)
                    cos_theta = max(-1.0, min(1.0, cos_theta))
                    theta = math.degrees(math.acos(cos_theta))
                    if theta > 30.0:
                        bend_points.add((round(pts[i][1], 6), round(pts[i][0], 6)))

        dist_mapped = [map_line_to_poles(coords) for coords in distribution_coords_list]
        sling_mapped = [map_line_to_poles(coords) for coords in sling_coords_list]

        fdt_lat, fdt_lon = fdts.resolve(lookup_name)

        resolved_fdt_name = fdt_group_key(line_folder)
        if resolved_fdt_name != last_fdt:
            new_pole_counter = 1
            existing_pole_counter = 1
            last_fdt = resolved_fdt_name

        # Normalize direction: distribution from FDT to end
        if fdt_lat is not None and dist_mapped:
            for i, seq in enumerate(dist_mapped):
                if len(seq) < 2:
                    continue
                d_start = haversine(poles[seq[0]][0], poles[seq[0]][1], fdt_lat, fdt_lon)
                d_end = haversine(poles[seq[-1]][0], poles[seq[-1]][1], fdt_lat, fdt_lon)
                if d_end < d_start:
                    dist_mapped[i] = list(reversed(seq))

            if len(dist_mapped) > 1:
                ordered = []
                used_seg = set()
                best_i = min(range(len(dist_mapped)),
                             key=lambda si: haversine(poles[dist_mapped[si][0]][0],
                                                       poles[dist_mapped[si][0]][1],
                                                       fdt_lat, fdt_lon) if dist_mapped[si] else float('inf'))
                ordered.append(dist_mapped[best_i])
                used_seg.add(best_i)

                while len(used_seg) < len(dist_mapped):
                    last_pm = ordered[-1][-1] if ordered[-1] else None
                    best_next, best_d = None, float('inf')
                    for j in range(len(dist_mapped)):
                        if j in used_seg or not dist_mapped[j]:
                            continue
                        if last_pm is not None:
                            d = haversine(poles[last_pm][0], poles[last_pm][1],
                                          poles[dist_mapped[j][0]][0], poles[dist_mapped[j][0]][1])
                            if d < best_d:
                                best_d, best_next = d, j
                    if best_next is not None:
                        ordered.append(dist_mapped[best_next])
                        used_seg.add(best_next)
                    else:
                        break
                dist_mapped = ordered

        sling_by_start = defaultdict(list)
        sling_used = set()
        for idx, seq in enumerate(sling_mapped):
            if seq:
                sling_by_start[seq[0]].append((idx, seq))
                if len(seq) > 1 and seq[-1] is not seq[0]:
                    sling_by_start[seq[-1]].append((idx, list(reversed(seq))))

        def process_sling_seq(idx_seq_tuple, order_list):
            idx, seq = idx_seq_tuple
            if idx in sling_used:
                return
            sling_used.add(idx)
            for pm in seq:
                k = coords_key_pm(pm)
                if k in visited_coords:
                    continue
                visited_coords.add(k)
                order_list.append(pm)
                if pm in sling_by_start:
                    for child in list(sling_by_start[pm]):
                        if child[0] not in sling_used:
                            process_sling_seq(child, order_list)

        order = []
        for dist_seq in dist_mapped:
            for pm in dist_seq:
                k = coords_key_pm(pm)
                if k not in visited_coords:
                    visited_coords.add(k)
                    order.append(pm)
                if pm in sling_by_start:
                    children = sorted(sling_by_start[pm], key=lambda x: x[0])
                    for child in children:
                        if child[0] not in sling_used:
                            process_sling_seq(child, order)

        if not order and sling_mapped:
            if fdt_lat is not None:
                best_idx = None
                best_d = float('inf')
                for idx, seq in enumerate(sling_mapped):
                    if not seq:
                        continue
                    pm = seq[0]
                    d = haversine(poles[pm][0], poles[pm][1], fdt_lat, fdt_lon)
                    if d < best_d:
                        best_d = d
                        best_idx = idx
                if best_idx is not None:
                    process_sling_seq((best_idx, sling_mapped[best_idx]), order)
            for idx, seq in enumerate(sling_mapped):
                if idx in sling_used:
                    continue
                if seq and coords_key_pm(seq[0]) in visited_coords:
                    process_sling_seq((idx, seq), order)

        if order:
            def is_loopback_pole(plat, plon):
                for pts in distribution_coords_list:
                    visits = 0
                    for lon, lat in pts:
                        if haversine(plat, plon, lat, lon) <= 2.0:
                            visits += 1
                    if visits > 1:
                        return True
                return False

            for pm in order:
                lat, lon, is_exist = poles[pm]
                if is_exist:
                    pole_name = f"EXT.MR.P{existing_pole_counter:03d}"
                    existing_pole_counter += 1
                else:
                    pole_name = f"MR.XXX.P{new_pole_counter:03d}"
                    new_pole_counter += 1

                pm_str = _pole_metadata_text(pm, pole_hints.get(id(pm), ""))
                owner = "PARTNER" if "PARTNER" in pm_str else "EMR"

                is_fdt = any(
                    haversine(lat, lon, f_lat, f_lon) <= 5.0
                    for f_lat, f_lon in fdts.values()
                )
                is_fat = any(
                    haversine(lat, lon, flat, flon) <= 1.0
                    for flat, flon in fat_coords
                )
                is_loopback = is_loopback_pole(lat, lon)
                is_sharp_bend = any(
                    haversine(lat, lon, blat, blon) <= 2.0
                    for blat, blon in bend_points
                )

                size_str, style_url = _classify_pole_size(
                    pm_str, is_exist, is_fdt, is_fat, is_loopback, is_sharp_bend
                )

                if is_exist:
                    folder_name = f"EXISTING POLE {owner} {size_str}"
                    style_url = "#style_pole_existing"
                else:
                    folder_name = f"NEW POLE {size_str}"

                new_pm = _renamed_pole(pm, pole_name, style_url)
                numbered += 1

                target_folder = find_or_create_folder(line_folder, folder_name)
                target_folder.append(new_pm)

    generate_slack_hangers(scopes, fdts, line_folders, fdt_hints=fdt_hints)

    # Handle remaining poles (not assigned to any line)
    remaining = [pm for pm in poles.keys() if coords_key_pm(pm) not in visited_coords]
    if remaining:
        fallback_lat, fallback_lon = None, None
        if fdts:
            fallback_lat, fallback_lon = list(fdts.values())[0]
        if fallback_lat is not None:
            remaining.sort(key=lambda pm: haversine(poles[pm][0], poles[pm][1], fallback_lat, fallback_lon))
        for pm in remaining:
            lat, lon, is_exist = poles[pm]
            if is_exist:
                pole_name = f"EXT.MR.P{existing_pole_counter:03d}"
                existing_pole_counter += 1
            else:
                pole_name = f"MR.XXX.P{new_pole_counter:03d}"
                new_pole_counter += 1

            pm_str = _pole_metadata_text(pm, pole_hints.get(id(pm), ""))
            size_str, style_url = _classify_pole_size(pm_str, is_exist)

            if is_exist:
                owner = "PARTNER" if "PARTNER" in pm_str else "EMR"
                folder_name = f"EXISTING POLE {owner} {size_str} UNASSIGNED"
                style_url = "#style_pole_existing"
            else:
                folder_name = f"NEW POLE {size_str} UNASSIGNED"

            new_pm = _renamed_pole(pm, pole_name, style_url)

            un_folder = find_or_create_folder(container, folder_name)
            un_folder.append(new_pm)

    if report is not None:
        report.stat("tiang_dinomori", numbered + len(remaining))
        if remaining:
            report.warn(f"{len(remaining)} tiang tidak berada di jalur kabel/sling mana pun; "
                        "dimasukkan ke folder '... UNASSIGNED'")
    print("[SUCCESS] POLE numbering selesai.")


# =====================================================================
# Folder Reordering
# =====================================================================

def reorder_line_folders(line_folder):
    """Reorder sub-folders within a LINE folder to match mandatory structure."""
    MANDATORY_FOLDERS = [
        "BOUNDARY FAT",
        "FAT",
        "HP COVER",
        "HP UNCOVER",
        "EXISTING POLE EMR 7-2.5",
        "EXISTING POLE EMR 7-3",
        "EXISTING POLE EMR 7-4",
        "EXISTING POLE EMR 9-4",
        "EXISTING POLE PARTNER 7-4",
        "EXISTING POLE PARTNER 9-4",
        "NEW POLE 7-2.5",
        "NEW POLE 7-3",
        "NEW POLE 7-4",
        "NEW POLE 9-4",
        "DISTRIBUTION CABLE",
        "SLACK HANGER",
        "SLING WIRE"
    ]

    collected = {name: [] for name in MANDATORY_FOLDERS}

    for sub in list(line_folder.findall("Folder")):
        sname_el = sub.find("name")
        if sname_el is None:
            continue
        sname = (sname_el.text or "").strip()
        sname_upper = sname.upper()

        target = None
        if sname in collected:
            target = sname
        elif "BOUNDARY" in sname_upper:
            target = "BOUNDARY FAT"
        elif sname_upper == "FAT":
            target = "FAT"
        elif "HP COVER" in sname_upper:
            target = "HP COVER"
        elif "HP UNCOVER" in sname_upper or "HP UN" in sname_upper:
            target = "HP UNCOVER"
        elif "SLACK" in sname_upper:
            target = "SLACK HANGER"
        elif "SLING" in sname_upper:
            target = "SLING WIRE"
        elif "DISTRIBUTION" in sname_upper or "CABLE" in sname_upper or "KABEL" in sname_upper:
            target = "DISTRIBUTION CABLE"
        elif "EXISTING POLE" in sname_upper or "EXST POLE" in sname_upper:
            if "PARTNER" in sname_upper:
                if "9-4" in sname_upper or "9M" in sname_upper:
                    target = "EXISTING POLE PARTNER 9-4"
                else:
                    target = "EXISTING POLE PARTNER 7-4"
            else:
                if "9-4" in sname_upper or "9M" in sname_upper:
                    target = "EXISTING POLE EMR 9-4"
                elif "7-4" in sname_upper or "7M 4" in sname_upper:
                    target = "EXISTING POLE EMR 7-4"
                elif "2.5" in sname_upper or "2_5" in sname_upper or "7M 2.5" in sname_upper:
                    target = "EXISTING POLE EMR 7-2.5"
                else:
                    target = "EXISTING POLE EMR 7-3"
        elif "NEW POLE" in sname_upper:
            if "9-4" in sname_upper or "9M" in sname_upper:
                target = "NEW POLE 9-4"
            elif "7-4" in sname_upper or "7M 4" in sname_upper:
                target = "NEW POLE 7-4"
            elif "2.5" in sname_upper or "2_5" in sname_upper or "7M 2.5" in sname_upper:
                target = "NEW POLE 7-2.5"
            else:
                target = "NEW POLE 7-3"

        if target:
            for child in list(sub):
                if child.tag != "name":
                    collected[target].append(child)
            line_folder.remove(sub)

    for name in MANDATORY_FOLDERS:
        f = ET.Element("Folder")
        nm = ET.Element("name")
        nm.text = name
        f.append(nm)
        for child in collected[name]:
            f.append(child)
        line_folder.append(f)


# =====================================================================
# Main Processing Pipeline
# =====================================================================

def _process_kml_tree(tree, report: Optional[ProcessReport] = None):
    """
    Core processing pipeline operating on an ElementTree.
    Returns the modified tree.
    """
    report = report if report is not None else ProcessReport()
    root = tree.getroot()
    strip_namespace(root)
    doc = root.find("Document")
    if doc is None:
        raise ValueError("Tidak ada <Document> di dalam file KML")

    # Folder LINE boleh dibungkus folder proyek atau per-FDT.
    # Folder POLE/NP/EXT, HP, dan FDT dicari di wadah itu DAN di Document.
    container, scopes, line_folders, fdt_hints = _collect_line_folders(doc)

    # Inject custom styles for Legend Design
    inject_custom_styles(doc)

    # Step 1: Process boundaries and HP coverage per LINE
    polygons_by_line = {}    # polygons_by_line[fdt_name][letter]
    polygons_by_folder = {}  # id(line_folder) -> polygons
    for line_folder in line_folders:
        line_name = _direct_name(line_folder)
        hint_name = fdt_hints.get(id(line_folder), line_name)
        fdt_name = get_fdt_name_from_line(hint_name)
        polygons_by_line.setdefault(fdt_name, {})

        polygons = process_boundaries_and_hp_in_line(line_folder)
        letter = _line_letter(line_name)

        polygons_by_folder[id(line_folder)] = polygons
        if polygons:
            polygons_by_line[fdt_name][polygons[0][3]] = polygons
        else:
            polygons_by_line[fdt_name][letter] = []
            report.warn(f"{line_name}: tidak ada poligon di folder BOUNDARY — FAT tidak dibuat")

    if not line_folders:
        raise ValueError(
            "Tidak ditemukan folder bernama 'LINE A', 'LINE B', dst. KML-APD "
            "membutuhkan struktur: folder LINE (berisi BOUNDARY dan kabel "
            "DISTRIBUTION), folder POLE/NP/EXT, folder HP, dan folder FDT."
        )

    # Step 2: Move root HP placemarks into line folders
    uncovered = move_root_hp_to_lines(
        scopes, line_folders, polygons_by_line, polygons_by_folder=polygons_by_folder
    )
    update_boundary_descriptions(
        line_folders, polygons_by_line, polygons_by_folder=polygons_by_folder
    )
    if uncovered:
        report.warn(f"{uncovered} HP berada di luar semua boundary; dimasukkan ke HP UNCOVER")

    # Step 3: Collect global poles (dari POLE/NP/EXT root maupun sub-folder tiang LINE saat proses ulang)
    raw_poles = []
    seen_pole_pms = set()
    dummy_hints = {}
    for _, f in scope_folders(scopes):
        if _is_pole_folder_name(_direct_name(f)):
            tmp = []
            _collect_poles_from_folder(f, tmp, dummy_hints, is_line_sub=False)
            for item in tmp:
                if id(item[0]) not in seen_pole_pms:
                    seen_pole_pms.add(id(item[0]))
                    raw_poles.append(item)
    for line_folder in line_folders:
        for sub in line_folder.findall("Folder"):
            if _is_pole_folder_name(_direct_name(sub)):
                tmp = []
                _collect_poles_from_folder(sub, tmp, dummy_hints, is_line_sub=True)
                for item in tmp:
                    if id(item[0]) not in seen_pole_pms:
                        seen_pole_pms.add(id(item[0]))
                        raw_poles.append(item)

    global_poles = [(pm, pm_parent, lon, lat, is_exist) for pm, pm_parent, lon, lat, is_exist, _, _ in raw_poles]

    # Deduplicate poles within POLE_DEDUPE_M (prioritize existing)
    poles_sorted = sorted(global_poles, key=lambda x: (not x[4]))
    kept_poles = []
    removed = []
    for p in poles_sorted:
        pm, folder, lon, lat, is_exist = p
        dup_of = None
        for kp in kept_poles:
            if haversine(lat, lon, kp[3], kp[2]) < POLE_DEDUPE_M:
                dup_of = kp
                break
        if dup_of is not None:
            try:
                folder.remove(pm)
            except Exception:
                pass
            removed.append(_direct_name(pm) or f"{lat:.6f},{lon:.6f}")
        else:
            kept_poles.append(p)
    global_poles = kept_poles
    if removed:
        report.warn(f"{len(removed)} tiang dihapus karena berjarak < {POLE_DEDUPE_M:.0f} m "
                    "dari tiang lain (tiang eksisting diutamakan)", removed)

    # Step 4: Get FDT info for cable/sling processing
    fdts = FdtIndex()
    for _, f in scope_folders(scopes):
        if not _is_fdt_folder(_direct_name(f)):
            continue
        for _, pm in _iter_placemarks_with_parent(f):
            fdt_name = _direct_name(pm) or _direct_name(f) or "FDT"
            pt_coords = _parse_point_coords(pm)
            if pt_coords is not None:
                lon, lat = pt_coords
                fdts.add(fdt_name, lat, lon, pm=pm)
    if not len(fdts):
        report.warn("Titik FDT tidak ditemukan (folder berawalan 'FDT'); arah penomoran "
                    "tiang dan slack FDT tidak bisa ditentukan")

    # Step 5: Process FAT/Cable/Sling for each line
    for line_folder in line_folders:
        line_name = _direct_name(line_folder)
        hint_name = fdt_hints.get(id(line_folder), line_name)
        fdt_lat, fdt_lon = fdts.resolve(hint_name)

        polygons = polygons_by_folder.get(id(line_folder), [])
        process_fat_cable_sling_for_line(
            line_folder, polygons, global_poles, len(fdts),
            doc=doc, line_folders=line_folders,
            fdt_lat=fdt_lat, fdt_lon=fdt_lon,
            tol_m_pole_line=5.0, report=report,
            all_line_polygons=polygons_by_folder,
        )

    # Step 6: Process pole numbering & Slack Hangers
    process_poles(scopes, fdts, tol_m=5.0, line_folders=line_folders,
                  container=container, report=report, fdt_hints=fdt_hints)

    if fdts.fallbacks:
        report.warn("Nomor FDT di nama folder LINE tidak cocok dengan titik FDT mana pun; "
                    "memakai FDT pertama", sorted(fdts.fallbacks))

    # Step 7: Remove original root pole folders (sisakan folder '... UNASSIGNED' hasil Step 6)
    for parent, f in list(scope_folders(scopes)):
        fname_up = _direct_name(f).upper()
        if _is_pole_folder_name(fname_up) and "UNASSIGNED" not in fname_up:
            try:
                parent.remove(f)
            except ValueError:
                pass

    # Step 8: Reorder folders for each Line
    for line_folder in line_folders:
        reorder_line_folders(line_folder)

    # Step 8b: Sort HP COVER subfolders A-Z by name
    for line_folder in line_folders:
        for sub in line_folder.findall("Folder"):
            if "HP COVER" in _direct_name(sub).upper():
                child_folders = sub.findall("Folder")
                if not child_folders:
                    continue
                for cf in child_folders:
                    sub.remove(cf)
                child_folders.sort(key=lambda f: _direct_name(f).upper())
                for cf in child_folders:
                    sub.append(cf)

    # Count totals
    total_fat_count = 0
    total_hp_count = 0
    total_hp_uncover = 0
    for line_folder in line_folders:
        for sub in line_folder.findall("Folder"):
            stext = _direct_name(sub).upper()
            if stext == "FAT":
                total_fat_count += len(sub.findall("Placemark"))
            elif "HP UNCOVER" in stext or "HP UN" in stext:
                total_hp_uncover += len(sub.findall(".//Placemark"))
            elif "HP COVER" in stext:
                for hp_sub in sub.findall("Folder"):
                    total_hp_count += len(hp_sub.findall("Placemark"))

    report.stat("line", len(line_folders))
    report.stat("fat", total_fat_count)
    report.stat("hp_cover", total_hp_count)
    report.stat("hp_uncover", max(uncovered, total_hp_uncover))
    report.stat("fdt", len(fdts))
    print(f"[KML-APD] Total FAT: {total_fat_count}, Total HP Cover: {total_hp_count}")
    print(f"[KML-APD] Total LINE folders: {len(line_folders)}")

    # Step 9: Apply FDT styles based on core capacity
    for _, f in scope_folders(scopes):
        if not _is_fdt_folder(_direct_name(f)):
            continue
        for pm in f.findall("Placemark"):
            pm_name = _direct_name(pm).upper()
            for st in pm.findall("styleUrl"):
                pm.remove(st)
            for st in pm.findall("Style"):
                pm.remove(st)
            st_el = ET.Element("styleUrl")
            if "96" in pm_name:
                st_el.text = "#style_fdt_96c"
            elif "48" in pm_name:
                st_el.text = "#style_fdt_48c"
            else:
                st_el.text = "#style_fdt_72c"
            pm.append(st_el)

    # Step 10: Strip ExtendedData & Schema agar output bersih untuk ETL validator
    removed_ext, removed_schema = strip_metadata_etl(root)
    if removed_ext or removed_schema:
        report.stat("metadata_dibersihkan", removed_ext + removed_schema)

    restore_namespace(root)
    return tree


# =====================================================================
# Public API
# =====================================================================

def process_kml_apd(
    kml_content: bytes,
    filename: str,
    is_kmz: bool = False,
) -> Dict[str, Any]:
    """
    Process KML/KMZ file for FTTH APD auto-drafting.

    Returns:
        Dict with status, filename, content bytes, content_type and report
    """
    try:
        # Lampiran KMZ (ikon, gambar overlay) dikumpulkan lebih dulu agar
        # bisa dikemas ulang — dengan batas ukuran yang sama dengan pemuat.
        kmz_extra_files = read_kmz_attachments(kml_content)

        # Pemuat bersama menangani KMZ, encoding, entitas, dan prefix yatim.
        raw_kml = load_kml_bytes(kml_content, is_kmz)

        report = ProcessReport()
        tree = ET.ElementTree(parse_kml_tolerant(raw_kml))
        tree = _process_kml_tree(tree, report)

        if hasattr(ET, "indent"):
            ET.indent(tree, space="\t")

        output_buffer = io.BytesIO()
        tree.write(output_buffer, encoding="utf-8", xml_declaration=True)
        output_kml_bytes = output_buffer.getvalue()

        base = os.path.splitext(filename)[0]

        if is_kmz:
            kmz_buffer = io.BytesIO()
            with zipfile.ZipFile(kmz_buffer, "w", zipfile.ZIP_DEFLATED) as kmz_out:
                kmz_out.writestr("doc.kml", output_kml_bytes)
                for extra_name, extra_data in kmz_extra_files.items():
                    if extra_name.lower() != "doc.kml":
                        kmz_out.writestr(extra_name, extra_data)

            return {
                "status": "success",
                "filename": f"{base}_APD.kmz",
                "content": kmz_buffer.getvalue(),
                "content_type": "application/vnd.google-earth.kmz",
                "report": report.to_dict(),
            }
        return {
            "status": "success",
            "filename": f"{base}_APD.kml",
            "content": output_kml_bytes,
            "content_type": "application/vnd.google-earth.kml+xml",
            "report": report.to_dict(),
        }

    except ValueError as ve:
        return {"status": "error", "message": str(ve)}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": f"KML APD processing failed: {str(e)}"}
