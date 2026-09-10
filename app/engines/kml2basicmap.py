#!/usr/bin/env python3
"""
kml2basicmap.py - Bikin BASIC MAP (kotak rumah + jalan + nomor rumah + tiang)
dari KML/KMZ survei FTTH, langsung jadi DXF AutoCAD yang tergeoreferensi.

Yang dihasilkan (semua di koordinat UTM WGS84, 1 unit = 1 meter):
  * kotak rumah         -> LWPOLYLINE tertutup, layer 'Basic Map'
  * nomor rumah         -> MTEXT di TENGAH kotaknya, layer 'Home Number'
  * tepi jalan          -> LWPOLYLINE, layer 'Basic Map'
  * nama jalan          -> MTEXT mengikuti arah jalan, layer 'Basic Map'
  * tiang               -> INSERT blok 'NP7', layer 'NEW POLE 7m'
  * layout VALIDASI     -> sel KOORDINAT, HP OK, TOTAL HP, nama cluster diisi

Empat aturan yang menjaga hasilnya rapi:

1. Kotak dibangun di RUANG PANJANG-JALAN, bukan di bidang datar. Sisi muka
   tiap rumah adalah potongan garis sejajar jalan, jadi di tikungan dan
   simpangan kotaknya ikut melengkung -- bukan persegi kaku yang menabrak
   jalan.
2. Pita deret DIBAGI HABIS di titik tengah antar rumah, jadi kotak
   bertetangga berbagi sisi persis dan mustahil saling tindih.
3. Kotak WAJIB memuat titik HP-nya sendiri. Aturan ini tidak boleh dilanggar
   oleh langkah perapian mana pun, supaya tidak ada rumah yang dipindah ke
   tempat yang bukan tempatnya.
4. Nomor rumah dipaksa muat di dalam kotaknya sendiri (diputar dan
   dikecilkan seperlunya). Karena kotaknya tidak pernah tumpang tindih,
   tulisannya otomatis tidak pernah bertumpuk.
5. Deret yang berbagi jalan, sisi, dan pita kedalaman ikut berbagi panjang
   jalannya (share_bands), dan kotak tidak pernah lebih dalam dari radius
   tikungan jalannya (curve_cap) -- dua sumber tindih yang tidak bisa
   diselesaikan dengan memindah rumah.
6. Sisa tabrakan yang masih ada dirapikan dengan MEMOTONG kotak, bukan
   dibiarkan: bagian yang menduduki badan jalan dibuang, dan daerah yang
   direbutkan dua kotak dibagi di garis tengah antar rumahnya. Aturan 3
   tetap berlaku -- potongan yang membuat kotak kehilangan titik HP-nya
   dibatalkan. Matikan dengan --no-clip.

Garis tepi jalan diambil dari batas GABUNGAN semua koridor jalan, jadi di
simpangan tidak ada garis yang saling memotong dan tidak perlu di-trim
tangan.

Geometri jalan diambil dari OpenStreetMap (Overpass), hasilnya di-cache ke
file JSON di samping input supaya bisa dijalankan ulang tanpa internet.

Contoh:
    python kml2basicmap.py "survei.kmz"
    python kml2basicmap.py "survei.kmz" -o hasil.dxf --depth 11.2
    python kml2basicmap.py "survei.kmz" --dry-run
    python kml2basicmap.py "survei.kmz" --offline
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

import ezdxf
from ezdxf import bbox
from lxml import etree
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import linemerge, unary_union
from shapely.strtree import STRtree

# --------------------------------------------------------------------------
# ANGKA DEFAULT
# --------------------------------------------------------------------------
# Diukur dari contoh basic map di dalam TEMPLATE BASICMAPdwg.dxf (379 rumah,
# SURANENGGALA KIDUL RW 03&04) dan dari 2 gambar drafter sebelumnya:
#   * kedalaman kotak KONSTAN per proyek: 11.20 m (template), 11.20 dan 16.20
#   * lebar muka FLEKSIBEL, median 9.39 m di template
#   * titik HP ada di ~0.35 kedalaman dari sisi muka (dekat jalan)
#   * nomor rumah MTEXT tinggi 1.6, nama jalan 2.21
#   * jarak centerline OSM ke tepi jalan gambar: 2.89 - 2.93 m

TEMPLATE_DEFAULT = "TEMPLATE BASICMAPdwg.dxf"

LAYER_HOUSE = "Basic Map"      # kotak rumah dan tepi jalan
LAYER_NUMBER = "Home Number"   # nomor rumah
LAYER_ROADNAME = "Basic Map"   # nama jalan
LAYER_POLE = "NEW POLE 7m"     # tiang
POLE_BLOCK = "NP7"

TEXT_HEIGHT_HP = 1.6
TEXT_HEIGHT_ROAD = 2.21
TEXT_STYLE = "Standard"
TEXT_WIDTH_FACTOR = 0.62       # perkiraan lebar huruf terhadap tingginya
TEXT_PAD = 0.25                # jarak aman teks ke sisi kotak, meter
TEXT_MIN_SCALE = 0.45          # tulisan boleh dikecilkan sampai sekian x

DEPTH_MIN, DEPTH_MAX = 5.0, 40.0
DEFAULT_MIN_WIDTH = 4.0
DEFAULT_MAX_WIDTH = 12.0
FRONT_RATIO = 0.35             # posisi titik HP diukur dari sisi muka
FRONT_GAP = 0.5                # jarak sisi muka rumah ke tepi koridor jalan
KEEP_INSIDE = 0.30             # jarak aman titik HP ke sisi kotaknya sendiri
ROW_SPLIT_GAP = 30.0           # deret dipotong kalau jeda sepanjang jalan > ini
BAND_GAP_RATIO = 0.60          # beda jarak ke jalan > ini x depth = deret lain
MAX_ROAD_DIST = 45.0           # HP lebih jauh dari ini dianggap tanpa jalan
ORPHAN_LINK = 20.0             # jarak penggandengan HP tanpa jalan
MIN_HOUSE_WIDTH = 0.8          # lebar minimum absolut supaya kotak tetap terlihat
BEND_STEP = 6.0                # sisi kotak dipecah tiap sekian meter di tikungan
BEND_TOL = 3.0                 # belokan di bawah ini dianggap lurus (derajat)
CURVE_SAFETY = 0.85            # kedalaman maks terhadap radius tikungan
CLIP_MIN_AREA = 1.0            # sisa kotak di bawah ini dianggap gagal potong

# setengah lebar jalan per kelas OSM, meter
ROAD_HALF = {
    "motorway": 9.0, "trunk": 7.0, "primary": 6.0, "secondary": 5.0,
    "tertiary": 4.0, "unclassified": 3.2, "residential": 2.9,
    "living_street": 2.9, "service": 2.2, "track": 1.5,
    "pedestrian": 1.5, "footway": 1.0, "path": 1.0, "steps": 1.0,
}
DEFAULT_ROAD_HALF = 2.9
ROAD_SKIP = {"proposed", "construction", "raceway", "bus_guideway", "corridor"}
MIN_ROAD_LABEL_LEN = 25.0      # ruas lebih pendek dari ini tidak diberi nama
LABEL_DEDUPE = 60.0            # nama sama dalam radius ini tidak diulang

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
BBOX_PAD_DEG = 0.0025          # ~275 m

DEG = "°"


# --------------------------------------------------------------------------
# Baca KML/KMZ
# --------------------------------------------------------------------------
def read_kml_bytes(path: Path) -> bytes:
    if path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".kml")]
            if not names:
                raise SystemExit(f"KMZ tidak berisi file .kml: {path}")
            names.sort(key=lambda n: (Path(n).name.lower() != "doc.kml", n))
            return z.read(names[0])
    return path.read_bytes()


class Kml:
    def __init__(self, data: bytes):
        self.root = etree.fromstring(data)
        self.ns = self.root.nsmap.get(None, "http://www.opengis.net/kml/2.2")

    def q(self, tag: str) -> str:
        return "{%s}%s" % (self.ns, tag)

    def name_of(self, el) -> str:
        n = el.find(self.q("name"))
        return (n.text or "").strip() if n is not None and n.text else ""

    def doc_name(self) -> str:
        d = self.root.find(self.q("Document"))
        return self.name_of(d) if d is not None else ""

    def placemarks(self):
        out = []

        def walk(el, path):
            for child in el:
                if child.tag in (self.q("Folder"), self.q("Document")):
                    nm = self.name_of(child)
                    walk(child, path + ([nm] if nm else []))
                elif child.tag == self.q("Placemark"):
                    out.append((path, self.name_of(child), child))

        walk(self.root, [])
        return out

    @staticmethod
    def parse_coords(text: str):
        pts = []
        for tok in (text or "").replace("\n", " ").split():
            parts = tok.split(",")
            if len(parts) >= 2:
                try:
                    pts.append((float(parts[0]), float(parts[1])))
                except ValueError:
                    pass
        return pts

    def points(self, pm):
        for el in pm.iter(self.q("Point")):
            c = el.find(self.q("coordinates"))
            if c is not None:
                for p in self.parse_coords(c.text):
                    yield p

    def rings(self, pm):
        for poly in pm.iter(self.q("Polygon")):
            outer = poly.find(self.q("outerBoundaryIs"))
            target = outer if outer is not None else poly
            for ring in target.iter(self.q("LinearRing")):
                c = ring.find(self.q("coordinates"))
                if c is not None:
                    pts = self.parse_coords(c.text)
                    if len(pts) >= 3:
                        yield pts
                break


def is_hp_folder(nm: str) -> bool:
    """Folder rumah. Aturannya sama dengan fat_auto_boundary.py, kecuali
    HP UNCOVER di sini TETAP digambar -- di gambar drafter rumah uncover
    juga dapat kotak, hanya nomornya ditulis di layer 'Basic Map'."""
    u = (nm or "").strip().upper()
    if "SALAH" in u:
        return False
    if u in ("HP", "HP COVER", "HP UNCOVER") or u.startswith("HP "):
        return True
    return u.startswith("HOMEPASS") or u.startswith("HOME PASS") or "REDUCE" in u


def is_pole_folder(nm: str) -> bool:
    """Folder tiang: POLE, TIANG, NP (new pole), EXT / EXT MR RW 04."""
    u = (nm or "").strip().upper()
    if "POLE" in u or "TIANG" in u:
        return True
    return u == "NP" or u.startswith("NP ") or u == "EXT" or u.startswith("EXT ")


def is_uncover(path) -> bool:
    return any("UNCOVER" in (p or "").upper() for p in path)


def pick_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def clean_name(raw: str) -> str:
    s = re.sub(r"^CBN\d+\s*-\s*", "", (raw or "").strip(), flags=re.I)
    return re.sub(r"\.(kmz|kml)$", "", s, flags=re.I).strip()


# --------------------------------------------------------------------------
# Jalan dari OpenStreetMap
# --------------------------------------------------------------------------
def fetch_osm(bbox_ll, cache: Path, offline: bool, log) -> list:
    """bbox_ll = (south, west, north, east). Hasil query di-cache ke JSON."""
    if cache.exists():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            log(f"  jalan OSM  : dari cache {cache.name} "
                f"({len(data.get('elements', []))} ruas mentah)")
            return data.get("elements", [])
        except (ValueError, OSError) as exc:
            log(f"  !! cache OSM rusak, diabaikan: {exc}")
    if offline:
        log("  !! mode offline dan cache OSM belum ada -> jalan dilewati")
        return []

    s, w, n, e = bbox_ll
    query = ("[out:json][timeout:90];"
             f'(way["highway"]({s:.6f},{w:.6f},{n:.6f},{e:.6f}););'
             "out geom;")
    for url in OVERPASS_MIRRORS:
        try:
            log(f"  minta jalan ke {url.split('/')[2]} ...")
            req = urllib.request.Request(
                url, data=query.encode("utf-8"),
                headers={"User-Agent": "kml2basicmap/2.0 (FTTH basic map)"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            els = data.get("elements", [])
            cache.write_text(json.dumps(data), encoding="utf-8")
            log(f"  jalan OSM  : {len(els)} ruas, disimpan ke {cache.name}")
            return els
        except (urllib.error.URLError, urllib.error.HTTPError, OSError,
                ValueError) as exc:
            log(f"  !! gagal ({type(exc).__name__}: {exc})")
    log("  !! semua server Overpass gagal -> lanjut TANPA jalan")
    return []


def normalize_road_name(name: str) -> str:
    """OSM menulis 'Jalan Haji Abdul Ngalim' / 'Gang Nagasari III';
    gambar memakai 'Jl. H. ABDUL NGALIM' / 'Jl. NAGASARI III'."""
    if not name:
        return ""
    s = re.sub(r"^(jalan|jln\.?|jl\.?|gang|gg\.?)\s+", "", name.strip(),
               flags=re.I)
    return "Jl. " + s.upper()


def build_roads(elements, to_utm, area, log) -> list:
    """Ubah way OSM jadi daftar dict berisi geometri UTM + setengah lebar.

    OSM memecah satu jalan jadi banyak 'way' di setiap persimpangan. Kalau
    pecahan itu dipakai apa adanya, dua rumah bertetangga bisa jatuh ke deret
    yang berbeda dan kotaknya jadi saling tindih. Jadi way disambung dulu
    (linemerge) per kelas+nama; penyambungan hanya terjadi di titik yang
    dilewati tepat dua way, jadi persimpangan tetap terpisah."""
    groups = defaultdict(list)
    raw_lines, raw_ids = [], []
    for el in elements:
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue
        tags = el.get("tags") or {}
        hw = tags.get("highway", "")
        if hw in ROAD_SKIP:
            continue
        line = LineString([to_utm(p["lon"], p["lat"]) for p in geom])
        if area is not None and not line.intersects(area):
            continue
        half = ROAD_HALF.get(hw, DEFAULT_ROAD_HALF)
        if tags.get("width"):
            try:
                half = max(1.0, float(re.split(r"[^\d.]", tags["width"])[0]) / 2)
            except (ValueError, IndexError):
                pass
        name = (tags.get("name") or "").strip()
        groups[(hw, name, round(half, 2))].append(line)
        raw_lines.append(line)
        raw_ids.append(el.get("id"))

    id_tree = STRtree(raw_lines) if raw_lines else None

    def trace_id(line):
        """Cari id way OSM terkecil yang menyusun garis gabungan ini, supaya
        nama manual di CSV tetap nempel ke ruas yang sama di run berikutnya."""
        if id_tree is None:
            return "x"
        band = line.buffer(0.5)
        best = None
        for j in id_tree.query(band):
            j = int(j)
            wid = raw_ids[j]
            if wid is None:
                continue
            if raw_lines[j].intersection(band).length > 1.0:
                best = wid if best is None else min(best, wid)
        return f"w{best}" if best is not None else "x"

    roads, used = [], defaultdict(int)
    for (hw, name, half), lines in groups.items():
        merged = linemerge(lines) if len(lines) > 1 else lines[0]
        pieces = ([merged] if merged.geom_type == "LineString"
                  else list(getattr(merged, "geoms", [])))
        for piece in pieces:
            clipped = piece.intersection(area) if area is not None else piece
            parts = ([clipped] if clipped.geom_type == "LineString"
                     else list(getattr(clipped, "geoms", [])))
            for part in parts:
                if part.geom_type != "LineString" or part.length < 3:
                    continue
                base = trace_id(part)
                used[base] += 1
                oid = base if used[base] == 1 else f"{base}_{used[base]}"
                roads.append(dict(osm_id=oid, highway=hw, half=half, line=part,
                                  name_osm=name, name=normalize_road_name(name),
                                  virtual=False))
    if roads:
        named = sum(r["line"].length for r in roads if r["name"])
        total = sum(r["line"].length for r in roads) or 1.0
        log(f"  dipakai    : {len(roads)} jalan (dari {len(raw_lines)} way OSM), "
            f"{total:.0f} m, bernama {named:.0f} m ({100 * named / total:.0f}%)")
    return roads


def apply_name_sidecar(roads, path: Path, log) -> None:
    """Baca <output>_jalan.csv supaya nama jalan yang tidak ada di OSM bisa
    diisi tangan sekali, lalu ikut terpakai di setiap run berikutnya."""
    if not path.exists():
        return
    manual = {}
    try:
        with path.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                val = (row.get("nama_dipakai") or "").strip()
                if val:
                    manual[(row.get("osm_id") or "").strip()] = val
    except (OSError, csv.Error) as exc:
        log(f"  !! {path.name} tidak terbaca: {exc}")
        return
    hit = 0
    for r in roads:
        if r["osm_id"] in manual and manual[r["osm_id"]] != r["name"]:
            r["name"] = manual[r["osm_id"]]
            hit += 1
    if hit:
        log(f"  nama jalan : {hit} ruas diambil dari {path.name}")


def write_name_sidecar(roads, path: Path, to_ll, log) -> None:
    rows = []
    for r in roads:
        mid = r["line"].interpolate(0.5, normalized=True)
        lon, lat = to_ll(mid.x, mid.y)
        rows.append(dict(osm_id=r["osm_id"], kelas=r["highway"],
                         panjang_m=f"{r['line'].length:.0f}",
                         nama_osm=r["name_osm"], nama_dipakai=r["name"],
                         lon=f"{lon:.6f}", lat=f"{lat:.6f}"))
    try:
        with path.open("w", newline="", encoding="utf-8-sig") as fh:
            wr = csv.DictWriter(fh, fieldnames=["osm_id", "kelas", "panjang_m",
                                                "nama_osm", "nama_dipakai",
                                                "lon", "lat"])
            wr.writeheader()
            wr.writerows(rows)
    except OSError as exc:
        log(f"  !! gagal menulis {path.name}: {exc}")
        return
    kosong = sum(1 for r in rows if not r["nama_dipakai"])
    log(f"  daftar jalan -> {path.name} ({kosong} ruas belum bernama; isi "
        f"kolom 'nama_dipakai' lalu jalankan ulang)")


# --------------------------------------------------------------------------
# Kerangka jalan: semua geometri rumah hidup di ruang (s, d)
#   s = jarak sepanjang centerline jalan
#   d = jarak tegak lurus menjauhi jalan, di sisi yang bersangkutan
# --------------------------------------------------------------------------
def unit(dx, dy):
    m = math.hypot(dx, dy)
    return (dx / m, dy / m) if m else (1.0, 0.0)


def tangent_at(line: LineString, s: float):
    eps = min(max(line.length * 0.005, 0.4), 3.0)
    a = line.interpolate(max(0.0, s - eps))
    b = line.interpolate(min(line.length, s + eps))
    t = unit(b.x - a.x, b.y - a.y)
    if t == (1.0, 0.0) and a.distance(b) == 0:      # ruas nol, ambil ujung
        p0, p1 = line.coords[0], line.coords[-1]
        t = unit(p1[0] - p0[0], p1[1] - p0[1])
    return t


def road_point(line: LineString, s: float, d: float, side: int):
    """Titik di jarak d dari jalan, pada sisi 'side', di panjang s."""
    s = min(max(s, 0.0), line.length)
    p = line.interpolate(s)
    tx, ty = tangent_at(line, s)
    return (p.x - ty * d * side, p.y + tx * d * side)


def bind_house(h, roads, j):
    """Catat posisi rumah dalam kerangka jalan ke-j."""
    line = roads[j]["line"]
    p = Point(h["x"], h["y"])
    s = line.project(p)
    foot = line.interpolate(s)
    tx, ty = tangent_at(line, s)
    cross = (p.x - foot.x) * (-ty) + (p.y - foot.y) * tx
    h.update(road=j, s=s, d=p.distance(line), side=1 if cross >= 0 else -1)


def smooth_assignment(houses, roads, k=8, rounds=3):
    """Selaraskan pilihan jalan dengan tetangga.

    Rumah di kampung padat sering lebih dekat ke gang yang MELINTANG di
    ujungnya daripada ke jalan yang sebenarnya dihadapi, dan kotaknya jadi
    terputar 90 derajat. Rumah bertetangga hampir selalu menghadap jalan yang
    sama, jadi tiap rumah diberi suara oleh k tetangga terdekatnya."""
    pts = [Point(h["x"], h["y"]) for h in houses]
    tree = STRtree(pts)
    neigh = []
    for i, p in enumerate(pts):
        cand = sorted((p.distance(pts[int(j)]), int(j))
                      for j in tree.query(p.buffer(40.0)) if int(j) != i)
        neigh.append([j for _, j in cand[:k]])

    total = 0
    for _ in range(rounds):
        new = [h["road"] for h in houses]
        changed = 0
        for i, h in enumerate(houses):
            if h["road"] is None or not h["cands"]:
                continue
            votes = defaultdict(float)
            for j in neigh[i]:
                r = houses[j]["road"]
                if r is not None and r in h["cands"]:
                    votes[r] += 1.0
            if not votes:
                continue
            best = max(votes, key=lambda r: (votes[r],
                                             -roads[r]["line"].distance(pts[i])))
            if best != h["road"] and votes[best] > votes.get(h["road"], 0) + 1:
                new[i] = best
                changed += 1
        for h, r in zip(houses, new):
            if r != h["road"]:
                bind_house(h, roads, r)
        total += changed
        if not changed:
            break
    return total


def assign_to_roads(houses, roads, log=None):
    """Tiap rumah dicarikan jalan yang dihadapinya, lalu dikelompokkan jadi
    deret: jalan sama + sisi sama + tidak terpisah jeda panjang."""
    for h in houses:
        h["road"] = None
        h["cands"] = []
    if not roads:
        return []

    lines = [r["line"] for r in roads]
    tree = STRtree(lines)
    for h in houses:
        p = Point(h["x"], h["y"])
        cands = []
        for j in tree.query(p.buffer(MAX_ROAD_DIST)):
            j = int(j)
            line = lines[j]
            if line.distance(p) > MAX_ROAD_DIST:
                continue
            # Kalau kaki tegak lurusnya jatuh di UJUNG jalan, rumah itu
            # sebetulnya ada di seberang ujung, bukan di sisi jalan. Kalau
            # dipaksa, semua rumah begitu menumpuk di satu titik panjang
            # yang sama dan kotaknya jadi gepeng.
            s = line.project(p)
            if s < 0.5 or s > line.length - 0.5:
                continue
            cands.append((line.distance(p), j))
        if not cands:
            continue
        cands.sort()
        h["cands"] = [j for _, j in cands]
        bind_house(h, roads, cands[0][1])

    switched = smooth_assignment(houses, roads)
    if log and switched:
        log(f"  {switched} rumah dipindah ke jalan yang dihadapi tetangganya "
            f"(jalan terdekat ternyata gang melintang)")

    rough = defaultdict(list)
    for h in houses:
        if h["road"] is not None:
            rough[(h["road"], h["side"])].append(h)

    rows = []
    for (ri, side), group in rough.items():
        group.sort(key=lambda h: h["s"])
        runs, cur = [], [group[0]]
        for prev, h in zip(group, group[1:]):
            if h["s"] - prev["s"] > ROW_SPLIT_GAP:
                runs.append(cur)
                cur = [h]
            else:
                cur.append(h)
        runs.append(cur)
        for run in runs:
            rows.append(dict(road=ri, side=side, houses=run))
    return rows


def split_bands(rows, depth):
    """Pecah deret yang bertingkat ke belakang.

    Rumah baris kedua punya jalan terdekat yang sama tapi jarak (d) jauh
    berbeda. Selain memotong di jurang, pita yang rentangnya lebih lebar dari
    satu kedalaman juga dipaksa dipecah -- kalau tidak, ada rumah yang titik
    HP-nya tidak akan muat di dalam kotaknya sendiri."""
    limit = depth - 2 * KEEP_INSIDE
    out = []
    queue = list(rows)
    while queue:
        row = queue.pop()
        hs = sorted(row["houses"], key=lambda h: h["d"])
        if len(hs) == 1 or hs[-1]["d"] - hs[0]["d"] <= limit:
            gaps = [(hs[i + 1]["d"] - hs[i]["d"], i) for i in range(len(hs) - 1)]
            big = [g for g in gaps if g[0] > BAND_GAP_RATIO * depth]
            if not big:
                out.append(dict(row, houses=hs))
                continue
            cut = max(big)[1]
        else:
            gaps = [(hs[i + 1]["d"] - hs[i]["d"], i) for i in range(len(hs) - 1)]
            cut = max(gaps)[1] if gaps else 0
        queue.append(dict(row, houses=hs[:cut + 1]))
        queue.append(dict(row, houses=hs[cut + 1:]))
    return [r for r in out if r["houses"]]


def cluster_orphans(orphans, link=ORPHAN_LINK):
    """Gandeng rumah tanpa jalan yang berdekatan jadi satu kelompok."""
    if not orphans:
        return []
    pts = [Point(h["x"], h["y"]) for h in orphans]
    tree = STRtree(pts)
    seen, groups = set(), []
    for i in range(len(orphans)):
        if i in seen:
            continue
        stack, comp = [i], []
        seen.add(i)
        while stack:
            k = stack.pop()
            comp.append(k)
            for j in tree.query(pts[k].buffer(link)):
                j = int(j)
                if j not in seen and pts[k].distance(pts[j]) <= link:
                    seen.add(j)
                    stack.append(j)
        groups.append([orphans[k] for k in comp])
    return groups


def principal_direction(pts):
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - cx) ** 2 for p in pts)
    syy = sum((p[1] - cy) ** 2 for p in pts)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in pts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    return (math.cos(ang), math.sin(ang)), (cx, cy)


def make_virtual_road(group, dom):
    """Jalan bayangan untuk rumah yang tidak punya jalan OSM di dekatnya.

    Cuma dipakai sebagai kerangka arah; tidak digambar dan tidak dinamai.
    Garisnya sengaja DIGESER ke satu sisi sampai seluruh rumah kelompok ini
    berada di sisi yang sama -- kalau tidak, kelompoknya terbelah jadi dua
    deret yang saling berhadapan dan kotaknya malah bertumpuk."""
    pts = [(h["x"], h["y"]) for h in group]
    if len(pts) >= 2:
        d, (cx, cy) = principal_direction(pts)
    else:
        d, (cx, cy) = dom, pts[0]
    nx, ny = -d[1], d[0]
    offs = [(x - cx) * nx + (y - cy) * ny for x, y in pts]
    shift = min(offs) - 5.0
    cx, cy = cx + nx * shift, cy + ny * shift
    span = max(40.0, max(math.dist(p, (cx, cy)) for p in pts) * 2 + 40.0)
    line = LineString([(cx - d[0] * span, cy - d[1] * span),
                       (cx + d[0] * span, cy + d[1] * span)])
    return dict(osm_id="", highway="", half=0.0, line=line,
                name_osm="", name="", virtual=True)


# --------------------------------------------------------------------------
# Pembentukan kotak rumah
# --------------------------------------------------------------------------
def curve_cap(line, s0, s1, side, step=BEND_STEP):
    """Kedalaman maksimum sebelum sisi belakang kotak MELIPAT di tikungan.

    Garis sejajar sejauh d di SISI DALAM tikungan berjari-jari R menyilang
    dirinya sendiri begitu d melewati R. Kotak yang melanggar batas ini pasti
    bertindih dengan tetangganya di deret yang sama, walaupun pita deretnya
    sudah dibagi habis dengan benar -- inilah sebabnya masih ada tindih di
    gang yang berbelok patah."""
    worst = None
    n = max(1, int(math.ceil((s1 - s0) / step)))
    for i in range(n + 1):
        s = s0 + (s1 - s0) * i / n
        a = tangent_at(line, max(0.0, s - step))
        b = tangent_at(line, min(line.length, s + step))
        dth = math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])
        if abs(dth) < 1e-9:
            continue
        if (1 if dth > 0 else -1) != side:
            continue                        # tikungan membuka, sisi ini aman
        R = 2 * step / abs(dth)
        worst = R if worst is None else min(worst, R)
    return worst * CURVE_SAFETY if worst is not None else None


def tile_row(row, roads, depth, min_w, max_w):
    """Bagi habis pita satu deret di titik tengah antar rumah.

    Hasilnya: kotak bertetangga berbagi sisi persis (mustahil tumpang tindih),
    semua kotak sedalam sama, dan sisi mukanya sejajar jalan."""
    line = roads[row["road"]]["line"]
    hs = sorted(row["houses"], key=lambda h: h["s"])
    row["houses"] = hs

    ds = sorted(h["d"] for h in hs)
    d_med = ds[len(ds) // 2]
    road = roads[row["road"]]
    clear = 0.0 if road["virtual"] else road["half"] + FRONT_GAP
    d_front = max(clear, d_med - FRONT_RATIO * depth)

    # Garis muka tidak boleh ditarik masuk badan jalan hanya gara-gara satu
    # rumah yang lebih maju. Turunkan hanya kalau masih di luar jalan;
    # kalau tidak, biarkan enforce_bands() yang memisahkan rumah itu.
    low = ds[0] - KEEP_INSIDE
    if low >= clear:
        d_front = min(d_front, low)
    elif len(hs) == 1:
        d_front = max(0.0, low)                # rumah memang di bibir jalan

    need = ds[-1] + KEEP_INSIDE - d_front
    row["depth"] = need if depth <= need <= depth * 1.35 else depth

    # Tikungan tajam: kotak tidak boleh lebih dalam dari radius tikungannya.
    # Tetap tunduk aturan 3 -- kalau titik HP butuh lebih dalam, itu menang.
    cap = curve_cap(line, hs[0]["s"] - max_w / 2, hs[-1]["s"] + max_w / 2,
                    row["side"])
    row["capped"] = False
    if cap is not None and cap < row["depth"]:
        row["depth"] = max(cap, min(ds[-1] + KEEP_INSIDE - d_front,
                                    row["depth"]))
        row["capped"] = True

    row["depth0"] = row["depth"]
    row["d_front"] = d_front
    row["depth_i"] = [None] * len(hs)

    bounds = []
    for i, h in enumerate(hs):
        lo = (h["s"] - max_w / 2 if i == 0
              else max((hs[i - 1]["s"] + h["s"]) / 2, h["s"] - max_w / 2))
        hi = (h["s"] + max_w / 2 if i == len(hs) - 1
              else min((h["s"] + hs[i + 1]["s"]) / 2, h["s"] + max_w / 2))
        # Kotak ujung boleh dilebarkan sampai min_w, kotak tengah TIDAK --
        # batas tengah satu-satunya yang menjamin tidak ada tindih.
        if len(hs) > 1:
            if i == 0:
                lo = min(lo, hi - min_w)
            if i == len(hs) - 1:
                hi = max(hi, lo + min_w)
        bounds.append((max(0.0, lo), min(line.length, hi)))
    row["bounds"] = bounds
    row["fixed"] = [None] * len(hs)
    row["narrow"] = sum(1 for lo, hi in bounds if hi - lo < MIN_HOUSE_WIDTH)
    return row


def enforce_bands(rows, roads, depth, min_w, max_w, rounds=8):
    """Pastikan tiap kotak memuat titik HP-nya sendiri, dengan MEMISAHKAN
    deret -- bukan dengan menggeser garis muka sampai masuk badan jalan.

    Rumah yang tidak muat di pita deretnya dikeluarkan jadi deret sendiri.
    Itu justru yang benar: rumah begitu memang berdiri di baris lain."""
    split = 0
    for _ in range(rounds):
        out, did = [], 0
        for row in rows:
            d0 = row["d_front"]
            d1 = d0 + row["depth"]
            keep, drop = [], []
            for h in row["houses"]:
                if d0 - 1e-6 <= h["d"] - KEEP_INSIDE and \
                        h["d"] + KEEP_INSIDE <= d1 + 1e-6:
                    keep.append(h)
                else:
                    drop.append(h)
            if not drop or not keep:
                out.append(row)
                continue
            did += 1
            for part in (keep, drop):
                new = dict(row, houses=list(part))
                tile_row(new, roads, depth, min_w, max_w)
                out.append(new)
        rows[:] = out
        split += did
        if not did:
            break
    return split


def share_bands(rows, roads, min_gap=0.4):
    """Deret yang berbagi jalan, sisi, DAN pita kedalaman ikut berbagi
    panjang jalannya juga.

    enforce_bands mengeluarkan rumah yang tidak muat jadi deret sendiri.
    Deret pecahan itu di-tile ulang seolah-olah tidak punya tetangga, jadi
    kotaknya selebar max_w penuh dan menimpa kotak deret asalnya -- inilah
    sumber tindih terbesar (bisa 96% luas kotak). Di sini batas s antar deret
    dikembalikan ke aturan yang sama seperti di dalam satu deret: titik
    tengah antara dua rumah. Titik HP tidak mungkin ikut terpotong, karena
    titik tengah selalu berada di antara kedua rumah.

    Yang dipotong HANYA pasangan yang kotaknya memang bertindih. Kalau semua
    pasangan sepita ikut dipotong, kotak di kampung padat jadi kesempitan
    tanpa perlu -- pita yang beririsan belum tentu kotaknya bertemu."""
    groups = defaultdict(list)
    for row in rows:
        groups[(row["road"], row["side"])].append(row)
    polys = {id(row): row_polys(row, roads) for row in rows}

    n = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                ra, rb = group[a], group[b]
                # Pita kedalamannya harus beririsan. Kalau bertingkat ke
                # belakang, kotaknya memang tidak mungkin bertemu.
                if ra["d_front"] + ra["depth"] <= rb["d_front"] + 0.05:
                    continue
                if rb["d_front"] + rb["depth"] <= ra["d_front"] + 0.05:
                    continue
                for i, ha in enumerate(ra["houses"]):
                    for j, hb in enumerate(rb["houses"]):
                        gap = hb["s"] - ha["s"]
                        if abs(gap) < min_gap:
                            continue
                        pa, pb = polys[id(ra)][i], polys[id(rb)][j]
                        if pa.is_empty or pb.is_empty or not pa.intersects(pb):
                            continue
                        it = pa.intersection(pb)
                        if it.is_empty or it.area <= 0.05:
                            continue
                        mid = (ha["s"] + hb["s"]) / 2
                        lo_a, hi_a = ra["bounds"][i]
                        lo_b, hi_b = rb["bounds"][j]
                        if gap > 0:
                            new_a, new_b = (lo_a, min(hi_a, mid)), (max(lo_b, mid), hi_b)
                        else:
                            new_a, new_b = (max(lo_a, mid), hi_a), (lo_b, min(hi_b, mid))
                        if new_a != (lo_a, hi_a):
                            ra["bounds"][i] = new_a
                            polys[id(ra)][i] = house_poly_at(ra, roads, i)
                            n += 1
                        if new_b != (lo_b, hi_b):
                            rb["bounds"][j] = new_b
                            polys[id(rb)][j] = house_poly_at(rb, roads, j)
                            n += 1
    if n:
        for row in rows:
            row["narrow"] = sum(1 for lo, hi in row["bounds"]
                                if hi - lo < MIN_HOUSE_WIDTH)
    return n


def house_poly(line, side, s0, s1, d0, d1):
    """Kotak satu rumah di ruang (s, d).

    Di jalan lurus hasilnya persegi panjang 4 titik. Di tikungan dan
    simpangan sisinya dipecah mengikuti lengkung jalan, jadi kotaknya
    menyesuaikan bentuk jalan dan tidak menabraknya."""
    a = math.degrees(math.atan2(*reversed(tangent_at(line, s0))))
    b = math.degrees(math.atan2(*reversed(tangent_at(line, s1))))
    bend = abs((b - a + 180) % 360 - 180)
    if bend <= BEND_TOL:
        ss = [s0, s1]
    else:
        n = max(2, min(12, int(math.ceil((s1 - s0) / BEND_STEP))))
        ss = [s0 + (s1 - s0) * i / n for i in range(n + 1)]
    front = [road_point(line, s, d0, side) for s in ss]
    back = [road_point(line, s, d1, side) for s in reversed(ss)]
    poly = Polygon(front + back)
    if not poly.is_valid:
        poly = poly.buffer(0)
        if poly.geom_type != "Polygon" or poly.is_empty:
            return None
    return poly


def house_poly_at(row, roads, i):
    """Kotak rumah ke-i dalam deret.

    'fixed' berisi kotak yang sudah dipotong oleh langkah perapian terakhir
    (lepas dari badan jalan / bagi dua daerah rebutan). Bentuk itu tidak bisa
    dinyatakan dalam (s, d), jadi disimpan apa adanya dan menang atas bentuk
    parametriknya."""
    fixed = row.get("fixed") or [None] * len(row["bounds"])
    if fixed[i] is not None:
        return fixed[i]
    s0, s1 = row["bounds"][i]
    di = row["depth_i"][i]
    d0 = row["d_front"]
    d1 = d0 + (row["depth"] if di is None else min(di, row["depth"]))
    p = house_poly(roads[row["road"]]["line"], row["side"], s0, s1, d0, d1)
    return p if p is not None else Polygon()


def row_polys(row, roads):
    return [house_poly_at(row, roads, i) for i in range(len(row["bounds"]))]


def holds_own_point(row, roads, polys=None) -> bool:
    """Aturan mutlak: tiap kotak harus memuat titik HP-nya sendiri."""
    polys = polys if polys is not None else row_polys(row, roads)
    for h, p in zip(row["houses"], polys):
        if p.is_empty or not p.buffer(0.05).contains(Point(h["x"], h["y"])):
            return False
    return True


def audit_points(rows, roads, corridors):
    """Rumah yang kotaknya TIDAK memuat titik HP-nya, dipisah menurut sebab.

    Dua sebabnya beda jauh penanganannya:
      * titik HP jatuh di dalam koridor jalan -- ini soal data: titik survei
        melenceng ke tengah gang, atau koridor OSM lebih lebar dari gang
        aslinya (perbaiki titiknya, atau kecilkan 'setengah lebar jalan').
      * sisanya soal geometri: kotak melipat di tikungan sangat tajam.
    """
    merged = unary_union(corridors) if corridors else None
    on_road, other = [], []
    for row in rows:
        for h, p in zip(row["houses"], row_polys(row, roads)):
            pt = Point(h["x"], h["y"])
            if not p.is_empty and p.buffer(0.05).contains(pt):
                continue
            (on_road if merged is not None and merged.intersects(pt)
             else other).append(h["name"] or "?")
    return on_road, other


def d_range(geom, line):
    """Rentang jarak tegak lurus sebuah geometri terhadap sebuah jalan."""
    lo = hi = None
    stack = ([geom] if geom.geom_type in ("Polygon", "LineString", "Point")
             else list(getattr(geom, "geoms", [])))
    for g in stack:
        if g.geom_type == "Polygon":
            coords = list(g.exterior.coords)
        elif g.geom_type in ("LineString", "Point"):
            coords = list(g.coords)
        else:
            continue
        for x, y in coords:
            d = line.distance(Point(x, y))
            lo = d if lo is None else min(lo, d)
            hi = d if hi is None else max(hi, d)
    return lo, hi


def s_range(geom, line):
    lo = hi = None
    stack = ([geom] if geom.geom_type in ("Polygon", "LineString", "Point")
             else list(getattr(geom, "geoms", [])))
    for g in stack:
        if g.geom_type == "Polygon":
            coords = list(g.exterior.coords)
        elif g.geom_type in ("LineString", "Point"):
            coords = list(g.coords)
        else:
            continue
        for x, y in coords:
            s = line.project(Point(x, y))
            lo = s if lo is None else min(lo, s)
            hi = s if hi is None else max(hi, s)
    return lo, hi


def min_depth_for(row):
    """Kedalaman terkecil yang masih memuat semua titik HP deret ini."""
    return max(h["d"] for h in row["houses"]) + KEEP_INSIDE - row["d_front"]


def resolve_depth(rows, roads, obstacles, keep_ratio=0.55, rounds=14):
    """Pendekkan kedalaman deret sampai tidak ada yang saling tindih.

    Kedalaman diseragamkan per deret supaya kotak tetap sama panjang, dan
    tidak pernah dipendekkan sampai titik HP-nya sendiri keluar kotak."""
    trimmed = 0
    for _ in range(rounds):
        merged = [unary_union(row_polys(r, roads)) for r in rows]
        tree = STRtree(merged)
        want = [None] * len(rows)
        for i, gi in enumerate(merged):
            if gi.is_empty:
                continue
            line = roads[rows[i]["road"]]["line"]
            floor_i = max(min_depth_for(rows[i]),
                          keep_ratio * rows[i]["depth0"])
            hits = [merged[int(j)] for j in tree.query(gi) if int(j) != i]
            hits += [ob for ob in obstacles if gi.intersects(ob)]
            for other in hits:
                inter = gi.intersection(other)
                if inter.is_empty or inter.area <= 0.01:
                    continue
                lo, _ = d_range(inter, line)
                need = lo - rows[i]["d_front"] - 0.05
                if need >= floor_i:
                    want[i] = need if want[i] is None else min(want[i], need)
        changed = False
        for r, w in zip(rows, want):
            floor_r = max(min_depth_for(r), keep_ratio * r["depth0"])
            if w is not None and w < r["depth"] - 1e-6:
                r["depth"] = max(w, floor_r)
                trimmed += 1
                changed = True
        if not changed:
            break
    return trimmed


def repair_rows(rows, roads, depth, min_w, max_w, share=0.40, rounds=4):
    """Perbaiki pengelompokan deret, bukan cuma menambal kotaknya.

    Kalau kotak dua rumah hampir bertindih penuh, biasanya keduanya memang
    satu deret tapi kepisah gara-gara OSM memecah jalan. Rumah dari deret
    yang lebih kecil dipindah ke deret tetangganya -- TAPI hanya kalau
    setelah pindah kotaknya masih memuat titik HP-nya sendiri. Kalau tidak,
    rumah itu dibiarkan di tempatnya; lebih baik kotaknya dipendekkan
    daripada rumahnya dipindah ke lokasi yang bukan tempatnya."""
    moved = rejected = 0
    for _ in range(rounds):
        index, polys = [], []
        for row in rows:
            for i, p in enumerate(row_polys(row, roads)):
                index.append((row, i))
                polys.append(p)
        tree = STRtree(polys)
        pending, seen = [], set()
        for a in range(len(polys)):
            if polys[a].is_empty:
                continue
            for b in tree.query(polys[a]):
                b = int(b)
                if b <= a or polys[b].is_empty:
                    continue
                row_a, ia = index[a]
                row_b, ib = index[b]
                if row_a is row_b:
                    continue
                inter = polys[a].intersection(polys[b])
                if inter.is_empty or inter.area < share * min(polys[a].area,
                                                             polys[b].area):
                    continue
                if len(row_a["houses"]) <= len(row_b["houses"]):
                    src, si, dst = row_a, ia, row_b
                else:
                    src, si, dst = row_b, ib, row_a
                h = src["houses"][si]
                if id(h) in seen:
                    continue
                seen.add(id(h))
                pending.append((src, h, dst))
        if not pending:
            break
        did = 0
        for src, h, dst in pending:
            if h not in src["houses"] or len(src["houses"]) < 1:
                continue
            keep = dict(h)
            src["houses"].remove(h)
            dst["houses"].append(h)
            bind_house(h, roads, dst["road"])
            h["side"] = dst["side"]
            tile_row(dst, roads, depth, min_w, max_w)
            if holds_own_point(dst, roads):
                moved += 1
                did += 1
            else:                                   # batalkan, kembalikan
                dst["houses"].remove(h)
                h.clear()
                h.update(keep)
                src["houses"].append(h)
                tile_row(dst, roads, depth, min_w, max_w)
                rejected += 1
        rows[:] = [r for r in rows if r["houses"]]
        for row in rows:
            tile_row(row, roads, depth, min_w, max_w)
        if not did:
            break
    return moved, rejected


def trim_one(row, i, inter, roads):
    """Potong satu kotak supaya lepas dari daerah tabrakan 'inter'.

    Dicoba dipendekkan dulu (bentuknya tetap sejajar deret), baru lebar
    mukanya dipotong. Keduanya dibatalkan kalau sampai membuat kotak tidak
    lagi memuat titik HP-nya sendiri."""
    line = roads[row["road"]]["line"]
    h = row["houses"][i]
    pt = Point(h["x"], h["y"])
    old_d, old_b = row["depth_i"][i], row["bounds"][i]

    lo, _ = d_range(inter, line)
    need = lo - row["d_front"] - 0.05
    cur = row["depth_i"][i] or row["depth"]
    if h["d"] + KEEP_INSIDE <= need < cur:
        row["depth_i"][i] = need
        p = row_polys(row, roads)[i]
        if not p.is_empty and p.buffer(0.05).contains(pt):
            return "depth", p
        row["depth_i"][i] = old_d

    slo, shi = s_range(inter, line)
    blo, bhi = old_b
    keep_hi = bhi - (shi + 0.05)
    keep_lo = (slo - 0.05) - blo
    if max(keep_hi, keep_lo) >= MIN_HOUSE_WIDTH:
        cand = ((shi + 0.05, bhi) if keep_hi >= keep_lo else (blo, slo - 0.05))
        if cand[0] + 0.05 <= h["s"] <= cand[1] - 0.05:
            row["bounds"][i] = cand
            p = row_polys(row, roads)[i]
            if not p.is_empty and p.buffer(0.05).contains(pt):
                return "width", p
            row["bounds"][i] = old_b
    return None, None


def trim_corner(rows, roads, obstacles=(), rounds=6):
    """Jalan terakhir untuk kotak yang masih bertabrakan -- biasanya dua
    deret yang bersilangan di sudut. Kotak yang lebih kecil dipendekkan
    sendirian; kalau tidak menolong, lebar mukanya yang dipotong. Keduanya
    tetap tunduk pada aturan 'kotak memuat titik HP-nya sendiri'."""
    n_depth = n_width = 0
    for _ in range(rounds):
        index, polys = [], []
        for row in rows:
            for i, p in enumerate(row_polys(row, roads)):
                index.append((row, i))
                polys.append(p)
        tree = STRtree(polys)
        touched = False
        for a in range(len(polys)):
            if polys[a].is_empty:
                continue
            for b in tree.query(polys[a]):
                b = int(b)
                if b <= a or polys[b].is_empty:
                    continue
                inter = polys[a].intersection(polys[b])
                if inter.is_empty or inter.area <= 0.05:
                    continue
                k = a if polys[a].area <= polys[b].area else b
                kind, new_poly = trim_one(index[k][0], index[k][1], inter, roads)
                if kind is None:
                    continue
                n_depth += 1 if kind == "depth" else 0
                n_width += 1 if kind == "width" else 0
                polys[k] = new_poly
                touched = True

        # --- kotak yang menabrak BADAN JALAN, biasanya jalan lain di
        #     belakang atau di sampingnya -------------------------------
        if obstacles:
            otree = STRtree(obstacles)
            for k, poly in enumerate(polys):
                if poly.is_empty:
                    continue
                row, i = index[k]
                own = roads[row["road"]]["line"]
                for oi in otree.query(poly):
                    ob = obstacles[int(oi)]
                    inter = poly.intersection(ob)
                    if inter.is_empty or inter.area <= 0.5:
                        continue
                    if ob.intersects(own.buffer(0.1)) and \
                            ob.intersection(own.buffer(0.1)).length > own.length * 0.5:
                        continue          # koridor jalannya sendiri, lewati
                    kind, new_poly = trim_one(row, i, inter, roads)
                    if kind is None:
                        continue
                    n_depth += 1 if kind == "depth" else 0
                    n_width += 1 if kind == "width" else 0
                    polys[k] = poly = new_poly
                    touched = True
        if not touched:
            break
    return n_depth, n_width


def piece_with(geom, pt):
    """Pecahan poligon yang masih memuat titik HP-nya. None kalau tidak ada."""
    if geom.is_empty:
        return None
    parts = ([geom] if geom.geom_type == "Polygon"
             else [g for g in getattr(geom, "geoms", [])
                   if g.geom_type == "Polygon"])
    for g in parts:
        if not g.is_empty and g.buffer(0.05).contains(pt):
            return g
    return None


def clip_road_body(rows, roads, corridors, log, tol=0.5):
    """Potong bagian kotak yang menduduki badan jalan.

    Langkah paling akhir, setelah semua cara memindah dan memendekkan kotak
    dicoba. Yang hilang hanya bagian yang menimpa jalan; sisa kotaknya tetap
    bentuk aslinya. Kalau justru TITIK HP-nya yang jatuh di badan jalan
    (titik survei melenceng ke tengah gang), kotaknya dibiarkan utuh --
    memotongnya akan melanggar aturan 'kotak memuat titik HP-nya sendiri',
    dan yang perlu diperbaiki memang titik surveinya."""
    if not corridors:
        return 0, 0
    merged = unary_union(corridors)
    cut = skip = 0
    for row in rows:
        row.setdefault("fixed", [None] * len(row["houses"]))
        for i, (h, p) in enumerate(zip(row["houses"], row_polys(row, roads))):
            if p.is_empty:
                continue
            inter = p.intersection(merged)
            if inter.is_empty or inter.area <= tol:
                continue
            pt = Point(h["x"], h["y"])
            if merged.intersects(pt.buffer(0.05)):
                skip += 1
                continue
            new = piece_with(p.difference(merged), pt)
            # Kotak berlubang di tengah tidak bisa digambar (draw() cuma
            # menulis cincin luarnya), jadi lebih baik dibiarkan utuh.
            if new is None or new.area < CLIP_MIN_AREA or new.interiors:
                skip += 1
                continue
            row["fixed"][i] = new
            cut += 1
    if cut:
        log(f"  {cut} kotak dipotong supaya lepas dari badan jalan")
    if skip:
        log(f"  !! {skip} kotak dibiarkan menimpa jalan karena titik HP-nya "
            f"sendiri ada di badan jalan -- titik surveinya yang perlu digeser")
    return cut, skip


def nearer_half(keep, other, span):
    """Setengah bidang berisi semua titik yang lebih dekat ke 'keep'."""
    mx, my = (keep[0] + other[0]) / 2, (keep[1] + other[1]) / 2
    ux, uy = unit(other[0] - keep[0], other[1] - keep[1])
    px, py = -uy, ux
    a = (mx + px * span, my + py * span)
    b = (mx - px * span, my - py * span)
    return Polygon([a, b, (b[0] - ux * span, b[1] - uy * span),
                    (a[0] - ux * span, a[1] - uy * span)])


def split_overlaps(rows, roads, log, rounds=4, tol=0.05):
    """Bagi dua daerah yang direbutkan dua kotak.

    Batasnya garis bagi tegak lurus antara kedua titik HP: tiap kotak dapat
    bagian yang lebih dekat ke rumahnya sendiri -- persis seperti drafter
    membagi sudut pertemuan dua deret dengan tangan. Karena garis itu selalu
    memisahkan kedua titik, kedua kotak DIJAMIN tetap memuat titik HP-nya
    masing-masing, jadi aturan 3 tetap utuh.

    Berlaku juga untuk dua kotak dalam SATU deret: di tikungan yang sangat
    tajam sisi belakangnya masih bisa melipat walaupun kedalamannya sudah
    dibatasi curve_cap, karena aturan 3 melarang pemendekan lebih jauh."""
    n = 0
    area = 0.0
    for _ in range(rounds):
        index, polys = [], []
        for row in rows:
            row.setdefault("fixed", [None] * len(row["houses"]))
            for i, p in enumerate(row_polys(row, roads)):
                index.append((row, i))
                polys.append(p)
        tree = STRtree(polys)
        did = 0
        for a in range(len(polys)):
            if polys[a].is_empty:
                continue
            for b in tree.query(polys[a]):
                b = int(b)
                if b <= a or polys[b].is_empty:
                    continue
                inter = polys[a].intersection(polys[b])
                if inter.is_empty or inter.area <= tol:
                    continue
                ra, ia = index[a]
                rb, ib = index[b]
                ha = ra["houses"][ia]
                hb = rb["houses"][ib]
                pa, pb = (ha["x"], ha["y"]), (hb["x"], hb["y"])
                if math.dist(pa, pb) < 0.5:
                    continue                # dua titik HP hampir berimpit
                span = 4 * max(polys[a].length, polys[b].length) + 50.0
                na = piece_with(polys[a].intersection(nearer_half(pa, pb, span)),
                                Point(pa))
                nb = piece_with(polys[b].intersection(nearer_half(pb, pa, span)),
                                Point(pb))
                if na is not None and nb is not None and \
                        min(na.area, nb.area) >= CLIP_MIN_AREA:
                    ra["fixed"][ia] = polys[a] = na
                    rb["fixed"][ib] = polys[b] = nb
                else:
                    # Salah satu kotak tidak bisa dipotong -- biasanya kotak
                    # yang memang belum memuat titik HP-nya sendiri. Yang
                    # masih bisa mengalah, mengalah SELURUHNYA; daerah
                    # rebutan diberikan utuh ke kotak satunya.
                    # (kotak berlubang tidak bisa digambar, jadi ditolak)
                    ca = piece_with(polys[a].difference(polys[b]), Point(pa))
                    cb = piece_with(polys[b].difference(polys[a]), Point(pb))
                    if ca is not None and ca.area >= CLIP_MIN_AREA \
                            and not ca.interiors:
                        ra["fixed"][ia] = polys[a] = ca
                    elif cb is not None and cb.area >= CLIP_MIN_AREA \
                            and not cb.interiors:
                        rb["fixed"][ib] = polys[b] = cb
                    else:
                        continue
                area += inter.area
                n += 1
                did += 1
        if not did:
            break
    if n:
        log(f"  {n} pasang kotak dibagi dua di garis tengah antar rumahnya "
            f"({area:.0f} m2 daerah rebutan)")
    return n


def check_overlap(polys, tol=0.05):
    live = [p for p in polys if not p.is_empty]
    if not live:
        return 0
    tree = STRtree(live)
    n = 0
    for i, p in enumerate(live):
        for j in tree.query(p):
            j = int(j)
            if j <= i:
                continue
            inter = p.intersection(live[j])
            if not inter.is_empty and inter.area > tol:
                n += 1
    return n


def auto_depth(houses):
    """Tebak kedalaman kotak dari jarak tetangga terdekat x 1.6.
    Contoh: 6.8 m -> 11.2 m dan 10.5 m -> 16.2 m (rasio 1.55-1.65)."""
    pts = [Point(h["x"], h["y"]) for h in houses]
    if len(pts) < 2:
        return 11.2
    tree = STRtree(pts)
    nn = []
    for i, p in enumerate(pts):
        best = None
        for j in tree.query(p.buffer(40.0)):
            j = int(j)
            if j == i:
                continue
            d = p.distance(pts[j])
            if best is None or d < best:
                best = d
        if best:
            nn.append(best)
    if not nn:
        return 11.2
    nn.sort()
    return round(max(DEPTH_MIN, min(DEPTH_MAX, nn[len(nn) // 2] * 1.6)), 2)


# --------------------------------------------------------------------------
# Penempatan tulisan
# --------------------------------------------------------------------------
def text_rect(cx, cy, w, h, ang_deg):
    """Kotak pembungkus tulisan, di posisi dan rotasi yang diminta."""
    a = math.radians(ang_deg)
    ca, sa = math.cos(a), math.sin(a)
    hw, hh = w / 2, h / 2
    return Polygon([(cx + x * ca - y * sa, cy + x * sa + y * ca)
                    for x, y in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))])


def label_anchor(poly):
    c = poly.centroid
    return c if poly.contains(c) else poly.representative_point()


def long_axis_angle(poly):
    """Arah sisi terpanjang sebuah kotak, dinormalkan ke rentang terbaca."""
    co = list(poly.exterior.coords)[:-1]
    best, ang = 0.0, 0.0
    for i in range(len(co)):
        a, b = co[i], co[(i + 1) % len(co)]
        d = math.dist(a, b)
        if d > best:
            best = d
            ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    return readable(ang)


def readable(ang):
    """Putar 180 derajat kalau tulisan jadi terbalik."""
    ang %= 360
    if 90 < ang <= 270:
        ang -= 180
    return ang % 360


SIZE_STEPS = (1.0, 0.92, 0.84, 0.76, 0.68, 0.60, 0.52, TEXT_MIN_SCALE)


def fit_label(poly, text, height):
    """Cari rotasi dan tinggi supaya nomor rumah benar-benar muat DI DALAM
    kotaknya sendiri -- diuji ke bentuk kotaknya, bukan ke kotak
    pembungkusnya, supaya kotak yang miring atau sempit ketahuan.

    Dicoba mendatar dulu; kalau tidak muat, diputar mengikuti sisi terpanjang
    kotak; kalau masih belum muat, tulisannya dikecilkan bertahap. Karena
    kotak tidak pernah saling tindih, tulisan yang muat di kotaknya sendiri
    otomatis tidak akan bertumpuk dengan tulisan rumah lain."""
    if poly.is_empty or not text:
        return 0.0, height, 0.0, False
    c = label_anchor(poly)
    w_unit = max(len(text) * TEXT_WIDTH_FACTOR, 0.1)
    best = None
    for ang in (0.0, long_axis_angle(poly)):
        for f in SIZE_STEPS:
            h = height * f
            r = text_rect(c.x, c.y, w_unit * h + 2 * TEXT_PAD,
                          h + 2 * TEXT_PAD, ang)
            if poly.contains(r):
                if best is None or h > best[1] + 1e-9:
                    best = (ang, h)
                break
        if best is not None and abs(best[1] - height) < 1e-9 and best[0] == 0.0:
            break                                   # mendatar & penuh, sudah
    if best is None:                                # kotaknya memang mungil
        return long_axis_angle(poly), height * TEXT_MIN_SCALE, c, True
    return best[0], best[1], c, best[1] < height - 1e-6


# --------------------------------------------------------------------------
# Gambar ke DXF
# --------------------------------------------------------------------------
def block_center(doc, name):
    """Isi blok simbol di template digambar jauh dari base point-nya (base
    point (0,0), isinya di sekitar +10475, -5327). Titik tanam harus
    dikoreksi sebanyak itu, kalau tidak simbolnya melenceng belasan km."""
    try:
        blk = doc.blocks.get(name)
    except Exception:
        return None
    try:
        e = bbox.extents(blk, fast=False)
    except Exception:
        return None
    if not e.has_data:
        return None
    return (e.extmin.x + e.size.x / 2, e.extmin.y + e.size.y / 2)


def road_edges(roads, log):
    """Tepi jalan = batas GABUNGAN semua koridor.

    Kalau tiap jalan di-offset sendiri-sendiri, di simpangan garisnya saling
    memotong dan harus di-trim tangan. Digabung dulu, jadi yang tersisa cuma
    garis tepi yang benar-benar kelihatan."""
    corr = [r["line"].buffer(r["half"], cap_style=2, join_style=2)
            for r in roads if not r["virtual"] and r["half"] > 0]
    if not corr:
        return [], None
    merged = unary_union(corr)
    parts = ([merged] if merged.geom_type == "Polygon"
             else list(getattr(merged, "geoms", [])))
    edges = []
    for poly in parts:
        if poly.geom_type != "Polygon":
            continue
        edges.append(list(poly.exterior.coords))
        for ring in poly.interiors:
            edges.append(list(ring.coords))
    return edges, merged


def draw(doc, rows, roads, poles, opts, log):
    msp = doc.modelspace()
    for lay in (LAYER_HOUSE, LAYER_NUMBER, LAYER_ROADNAME):
        if lay not in doc.layers:
            doc.layers.add(lay)

    # --- jalan ------------------------------------------------------------
    edges, _ = road_edges(roads, log)
    for coords in edges:
        msp.add_lwpolyline(coords, close=True,
                           dxfattribs={"layer": LAYER_HOUSE})

    placed, n_name = [], 0
    for r in sorted(roads, key=lambda r: -r["line"].length):
        if r["virtual"] or not r["name"] or r["line"].length < MIN_ROAD_LABEL_LEN:
            continue
        line = r["line"]
        mid = line.interpolate(0.5, normalized=True)
        if any(nm == r["name"] and math.dist((mid.x, mid.y), pt) < LABEL_DEDUPE
               for nm, pt in placed):
            continue
        tx, ty = tangent_at(line, line.length / 2)
        msp.add_mtext(r["name"], dxfattribs={
            "layer": LAYER_ROADNAME, "style": TEXT_STYLE,
            "char_height": opts["road_text"], "attachment_point": 5,
            "rotation": readable(math.degrees(math.atan2(ty, tx))),
            "insert": (mid.x, mid.y)})
        placed.append((r["name"], (mid.x, mid.y)))
        n_name += 1

    # --- kotak rumah + nomor di tengahnya --------------------------------
    n_rect = shrunk = 0
    for row in rows:
        for h, poly in zip(row["houses"], row_polys(row, roads)):
            if poly.is_empty:
                continue
            msp.add_lwpolyline(list(poly.exterior.coords)[:-1], close=True,
                               dxfattribs={"layer": LAYER_HOUSE})
            n_rect += 1
            name = h["name"] or ""
            if not name:
                continue
            ang, size, c, small = fit_label(poly, name, opts["hp_text"])
            shrunk += 1 if small else 0
            layer = (LAYER_HOUSE if (h["uncover"] and opts["uncover_basic"])
                     else LAYER_NUMBER)
            msp.add_mtext(name, dxfattribs={
                "layer": layer, "style": TEXT_STYLE, "char_height": size,
                "attachment_point": 5, "rotation": ang, "insert": (c.x, c.y)})

    # --- tiang ------------------------------------------------------------
    n_pole = 0
    if poles:
        if LAYER_POLE not in doc.layers:
            doc.layers.add(LAYER_POLE)
        ctr = block_center(doc, opts["pole_block"])
        if ctr is None:
            log(f"  !! blok {opts['pole_block']!r} tidak ada di template -> "
                f"tiang dilewati")
        else:
            for p in poles:
                msp.add_blockref(opts["pole_block"],
                                 (p["x"] - ctr[0], p["y"] - ctr[1]),
                                 dxfattribs={"layer": LAYER_POLE})
                n_pole += 1

    log(f"  digambar   : {n_rect} kotak rumah, {len(edges)} garis tepi jalan, "
        f"{n_name} nama jalan, {n_pole} tiang")
    if shrunk:
        log(f"  {shrunk} nomor rumah dikecilkan/diputar supaya muat di kotaknya")
    return n_rect, len(edges), n_name, n_pole


# --------------------------------------------------------------------------
# Layout VALIDASI: isi kop
# --------------------------------------------------------------------------
COORD_RE = re.compile(r"-?\d{1,3}\.\d{3,}\s*" + DEG + r"?\s*,\s*"
                      r"-?\d{1,3}\.\d{3,}\s*" + DEG + r"?")


def fmt_coord(lon, lat):
    return f" {lat:.6f}{DEG}, {lon:.6f}{DEG}"


def aim_viewports(layout, info) -> int:
    """Arahkan viewport kertas ke tengah gambar, dengan skala yang memuat
    seluruh peta (sisa 8% jadi margin).

    Viewport ber-id 1 adalah 'kertas'-nya sendiri, bukan jendela peta, jadi
    dilewati. Dipisah dari fill_layout supaya penggabung (kml2dxf_full.py)
    bisa mengarahkan viewport tanpa ikut mengisi kop VALIDASI."""
    vps = [e for e in layout.query("VIEWPORT") if e.dxf.id > 1]
    for vp in vps:
        w = max(vp.dxf.width, 1e-6)
        h = max(vp.dxf.height, 1e-6)
        need_h = max(info["h"] / 0.92, info["w"] / (w / h) / 0.92, 10.0)
        vp.dxf.view_center_point = (info["cx"], info["cy"], 0)
        vp.dxf.view_height = need_h
    return len(vps)


def fill_layout(doc, info, log):
    """Isi sel KOORDINAT, HP OK, TOTAL HP, dan nama cluster di kop layout."""
    touched = []
    for lay in doc.layouts:
        if lay.name.lower() == "model":
            continue
        texts = [e for e in lay if e.dxftype() == "MTEXT"]

        # --- sel koordinat: dikenali dari POLANYA, bukan dari label ------
        for e in texts:
            if COORD_RE.fullmatch(e.text.strip()) or (
                    COORD_RE.search(e.text) and len(e.text) < 40):
                e.text = info["coord"]
                touched.append(f"{lay.name}: KOORDINAT")
                break

        # --- blok keterangan cluster --------------------------------------
        for e in texts:
            if "Nama Cluster" not in e.text:
                continue
            raw = e.text
            raw = re.sub(r"(Nama Cluster Master Data[^:]*:\s*)[^\\}]*",
                         lambda m: m.group(1) + info["cluster"], raw, count=1)
            raw = re.sub(r"(Nama Cluster Aktual Hasil Survey\s*:\s*"
                         r"(?:\\H[\d.]+x;)?)[^\\}]*",
                         lambda m: m.group(1) + info["cluster"], raw, count=1)
            raw = COORD_RE.sub(info["coord"].strip(), raw)
            if raw != e.text:
                e.text = raw
                touched.append(f"{lay.name}: nama cluster + koordinat")
            break

        # --- angka HP: hanya sel yang MEMANG sudah berisi angka ----------
        for label, value in (("HP OK", info["hp"]), ("TOTAL HP", info["hp"])):
            # Sel angkanya dicari lewat POSISI: sebaris dengan labelnya dan
            # ada di sebelah kanannya. Label yang selnya masih kosong (bagian
            # SURVEY, diisi surveyor belakangan) otomatis terlewat.
            row = None
            for e in texts:
                plain = e.plain_text().strip()
                if not (plain.upper().startswith(label)
                        and len(plain) <= len(label) + 2):
                    continue
                near = [(abs(c.dxf.insert.y - e.dxf.insert.y), c) for c in texts
                        if c is not e
                        and abs(c.dxf.insert.y - e.dxf.insert.y) <= 3.0
                        and c.dxf.insert.x > e.dxf.insert.x
                        and c.plain_text().strip().isdigit()]
                if near:
                    row = min(near, key=lambda t: t[0])[1]
                    break
            if row is not None:
                row.text = str(value)
                touched.append(f"{lay.name}: {label} = {value}")

        # --- viewport peta ------------------------------------------------
        n_vp = aim_viewports(lay, info)
        if n_vp:
            touched.append(f"{lay.name}: {n_vp} viewport diarahkan ke peta")
    for t in touched:
        log(f"  layout     : {t}")
    if not touched:
        log("  !! tidak ada kop layout yang cocok untuk diisi")
    return touched


# --------------------------------------------------------------------------
# Proses utama
# --------------------------------------------------------------------------
def process(kml_path, out_path=None, depth=None, min_width=DEFAULT_MIN_WIDTH,
            max_width=DEFAULT_MAX_WIDTH, template=None, epsg=None,
            offline=False, dry_run=False, road_half=None,
            hp_text=TEXT_HEIGHT_HP, road_text=TEXT_HEIGHT_ROAD,
            uncover_basic=True, keep_template=False, no_roads=False,
            no_poles=False, no_clip=False, pole_block=POLE_BLOCK,
            doc=None, save=True, fill_kop=True, log=print):
    """doc/save/fill_kop dipakai oleh kml2dxf_full.py:

    doc      : gambar ke dokumen DXF yang sudah dibuka (template tidak dibaca
               lagi), supaya basic map dan desain APD jadi satu file.
    save     : False = jangan simpan, biar penggabung yang menyimpan sekali.
    fill_kop : False = jangan sentuh kop layout; di gambar gabungan kop dan
               DESIGN SUMMARY diisi oleh kml2dxf.py.
    no_clip  : True = jangan potong kotak di langkah perapian terakhir;
               sisa tabrakan dibiarkan untuk dirapikan tangan."""
    kml_path = Path(kml_path)
    out_path = Path(out_path) if out_path else kml_path.with_suffix(".dxf")

    kml = Kml(read_kml_bytes(kml_path))
    pms = kml.placemarks()
    if not pms:
        raise SystemExit("Tidak ada Placemark di file ini.")

    # --- kumpulkan rumah, tiang, poligon batas ---------------------------
    raw, poles, ring_ll = [], [], None
    for path, name, pm in pms:
        if any(is_hp_folder(p) for p in path):
            for lon, lat in kml.points(pm):
                raw.append(dict(name=name, lon=lon, lat=lat,
                                uncover=is_uncover(path)))
        elif any(is_pole_folder(p) for p in path):
            for lon, lat in kml.points(pm):
                poles.append(dict(name=name, lon=lon, lat=lat))
        if ring_ll is None:
            for ring in kml.rings(pm):
                ring_ll = ring
                break
    if not raw:
        raise SystemExit("Tidak ada titik di folder HP / HOMEPASS di file ini.")
    if no_poles:
        poles = []

    lons = [h["lon"] for h in raw]
    lats = [h["lat"] for h in raw]
    code = epsg or pick_epsg(sum(lons) / len(lons), sum(lats) / len(lats))
    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{code}",
                                  always_xy=True).transform
    to_ll = Transformer.from_crs(f"EPSG:{code}", "EPSG:4326",
                                 always_xy=True).transform
    for h in raw + poles:
        h["x"], h["y"] = to_utm(h["lon"], h["lat"])

    n_unc = sum(1 for h in raw if h["uncover"])
    project = clean_name(kml.doc_name() or kml_path.name)
    log(f"File       : {kml_path.name}")
    log(f"Proyek     : {project}")
    log(f"Rumah (HP) : {len(raw)}"
        + (f"  (termasuk {n_unc} HP UNCOVER)" if n_unc else ""))
    log(f"Tiang      : {len(poles)}")
    log(f"Proyeksi   : EPSG:4326 -> EPSG:{code}"
        f"{' (auto)' if epsg is None else ' (manual)'}")

    # --- titik acuan georeferensi: 1 tiang, kalau tidak ada 1 rumah -------
    ref = poles[0] if poles else raw[0]
    log(f"  acuan koordinat: {'tiang' if poles else 'rumah'} {ref['name']!r} "
        f"-> {ref['lat']:.6f}{DEG}, {ref['lon']:.6f}{DEG}")

    # --- area kerja -------------------------------------------------------
    area = unary_union([Point(h["x"], h["y"])
                        for h in raw]).convex_hull.buffer(80.0)
    if ring_ll and len(ring_ll) >= 3:
        try:
            area = area.union(Polygon([to_utm(*p) for p in ring_ll]).buffer(30.0))
        except (ValueError, TypeError):
            pass

    # --- jalan ------------------------------------------------------------
    roads = []
    sidecar = out_path.with_name(out_path.stem + "_jalan.csv")
    if not no_roads:
        pad = BBOX_PAD_DEG
        els = fetch_osm((min(lats) - pad, min(lons) - pad,
                         max(lats) + pad, max(lons) + pad),
                        kml_path.with_name(kml_path.stem + "_osm.json"),
                        offline, log)
        roads = build_roads(els, to_utm, area, log)
        if road_half is not None:
            for r in roads:
                r["half"] = road_half
        apply_name_sidecar(roads, sidecar, log)
    n_real_roads = len(roads)

    # --- kedalaman kotak --------------------------------------------------
    if depth is None:
        depth = auto_depth(raw)
        log(f"  kedalaman  : {depth:.2f} m (auto dari jarak antar rumah)")
    else:
        depth = max(DEPTH_MIN, min(DEPTH_MAX, depth))
        log(f"  kedalaman  : {depth:.2f} m (dari pengaturan)")

    # --- deret -------------------------------------------------------------
    rows = assign_to_roads(raw, roads, log)
    orphans = [h for h in raw if h.get("road") is None]
    dom = (1.0, 0.0)
    if rows:
        big = max(rows, key=lambda r: len(r["houses"]))
        dom = tangent_at(roads[big["road"]]["line"],
                         roads[big["road"]]["line"].length / 2)
    for grp in cluster_orphans(orphans):
        roads.append(make_virtual_road(grp, dom))
        j = len(roads) - 1
        for h in grp:
            bind_house(h, roads, j)
        # garis bayangannya sudah digeser, jadi semua rumah satu sisi
        rows.append(dict(road=j, side=1, houses=list(grp)))
    if orphans:
        log(f"  !! {len(orphans)} rumah tidak ketemu jalan dalam "
            f"{MAX_ROAD_DIST:.0f} m -- arah kotaknya ditebak dari deretan rumah")

    rows = split_bands(rows, depth)
    for row in rows:
        tile_row(row, roads, depth, min_width, max_width)
    band_split = enforce_bands(rows, roads, depth, min_width, max_width)
    if band_split:
        log(f"  {band_split} deret dipecah supaya tiap kotak memuat titik "
            f"HP-nya sendiri")
    shared = share_bands(rows, roads)

    # --- beresi tabrakan bertahap -----------------------------------------
    corridors = [r["line"].buffer(r["half"], cap_style=2)
                 for r in roads if not r["virtual"] and r["half"] > 0]
    moved = rejected = trimmed = corner = narrowed = 0
    overlap = 0
    for _ in range(3):
        mv, rj = repair_rows(rows, roads, depth, min_width, max_width)
        moved += mv
        rejected += rj
        enforce_bands(rows, roads, depth, min_width, max_width)
        shared += share_bands(rows, roads)
        trimmed += resolve_depth(rows, roads, corridors)
        c, n = trim_corner(rows, roads, corridors)
        corner += c
        narrowed += n
        polys = [p for row in rows for p in row_polys(row, roads)]
        overlap = check_overlap(polys)
        if not overlap:
            break
    # --- jalan terakhir: potong kotaknya, jangan biarkan bertabrakan ------
    clipped = hp_on_road = halved = 0
    if not no_clip:
        clipped, hp_on_road = clip_road_body(rows, roads, corridors, log)
        halved = split_overlaps(rows, roads, log)
        if clipped or halved:
            polys = [p for row in rows for p in row_polys(row, roads)]
            overlap = check_overlap(polys)

    capped = sum(1 for r in rows if r.get("capped"))
    if shared:
        log(f"  {shared} batas kotak dirapikan karena deret bersebelahan "
            f"berbagi pita jalan yang sama")
    if capped:
        log(f"  {capped} deret dipendekkan mengikuti radius tikungan jalannya")
    if moved or rejected:
        log(f"  {moved} rumah dipindah ke deret tetangganya"
            + (f", {rejected} penolakan karena kotaknya jadi tidak memuat "
               f"titik HP sendiri" if rejected else ""))
    if trimmed:
        log(f"  {trimmed} kali kedalaman deret dipendekkan supaya tidak "
            f"menabrak deret lain atau jalan")
    if corner or narrowed:
        log(f"  tabrakan di sudut deret: {corner} kotak dipendekkan sendirian, "
            f"{narrowed} kotak dipersempit")

    bad = sum(1 for row in rows if not holds_own_point(row, roads))
    hp_in_road, hp_geom = audit_points(rows, roads, corridors)
    narrow = sum(r.get("narrow", 0) for r in rows)
    if narrow:
        log(f"  !! {narrow} kotak lebih sempit dari {MIN_HOUSE_WIDTH:.1f} m "
            f"karena titik HP-nya hampir berimpit dengan tetangganya")
    if hp_in_road:
        contoh = ", ".join(hp_in_road[:6]) + ("..." if len(hp_in_road) > 6 else "")
        log(f"  !! {len(hp_in_road)} titik HP jatuh DI DALAM koridor jalan, "
            f"jadi kotaknya digambar di tepi jalan dan tidak memuat titiknya:")
        log(f"     {contoh}")
        log(f"     -> perbaiki titik surveinya, atau kecilkan 'setengah lebar "
            f"jalan' kalau koridor OSM lebih lebar dari gang aslinya")
    if hp_geom:
        log(f"  !! {len(hp_geom)} kotak tidak memuat titik HP-nya karena "
            f"geometri (tikungan sangat tajam): "
            + ", ".join(hp_geom[:6]) + ("..." if len(hp_geom) > 6 else ""))
    depths = sorted(round(r["depth"], 2) for r in rows)
    log(f"  hasil      : {len(polys)} kotak dalam {len(rows)} deret, "
        f"kedalaman {depths[0]:.2f}-{depths[-1]:.2f} m")
    if overlap:
        log(f"  !! masih ada {overlap} pasang kotak bertumpang tindih "
            f"(> 0.05 m2) -- perlu dirapikan tangan")
    else:
        log("  tidak ada kotak yang saling tumpang tindih")

    # kotak yang menabrak badan jalan
    on_road = 0
    if corridors:
        merged = unary_union(corridors)
        on_road = sum(1 for p in polys
                      if not p.is_empty and p.intersection(merged).area > 0.5)
    log(f"  kotak menimpa badan jalan (> 0.5 m2): {on_road}")

    report = dict(hp=len(raw), poles=len(poles), rects=len(polys),
                  rows=len(rows), roads=n_real_roads,
                  roads_named=sum(1 for r in roads
                                  if r["name"] and not r["virtual"]),
                  orphan=len(orphans), overlap=overlap, on_road=on_road,
                  moved=moved, rejected=rejected, trimmed=trimmed,
                  corner=corner, narrowed=narrowed, narrow=narrow,
                  shared=shared, capped=capped, clipped=clipped,
                  halved=halved, hp_on_road=hp_on_road,
                  hp_in_road=len(hp_in_road), hp_geom=len(hp_geom),
                  outside=bad, depth=depth, epsg=code, out=out_path,
                  ref=dict(name=ref["name"], lon=ref["lon"], lat=ref["lat"],
                           kind="tiang" if poles else "rumah"),
                  polygons=polys)
    if dry_run:
        log("\n(mode cek -- tidak ada file yang ditulis)")
        return report

    # --- tulis DXF ---------------------------------------------------------
    if doc is None:
        tpl = Path(template) if template else None
        if tpl and tpl.exists():
            doc = ezdxf.readfile(tpl)
            if not keep_template:
                msp = doc.modelspace()
                for e in list(msp):
                    msp.delete_entity(e)
            log(f"  template   : {tpl.name}"
                + ("" if keep_template else " (isi modelspace dikosongkan)"))
        else:
            doc = ezdxf.new("R2013", setup=True)
            if template:
                log(f"  !! template {template} tidak ada -> pakai DXF kosong")
    doc.header["$INSUNITS"] = 6            # meter

    draw(doc, rows, roads, poles,
         dict(hp_text=hp_text, road_text=road_text,
              uncover_basic=uncover_basic, pole_block=pole_block), log)

    xs = [c[0] for p in polys if not p.is_empty for c in p.exterior.coords]
    ys = [c[1] for p in polys if not p.is_empty for c in p.exterior.coords]
    if fill_kop:
        fill_layout(doc, dict(
            coord=fmt_coord(ref["lon"], ref["lat"]), cluster=project.upper(),
            hp=len(raw), cx=(min(xs) + max(xs)) / 2, cy=(min(ys) + max(ys)) / 2,
            w=max(xs) - min(xs), h=max(ys) - min(ys)), log)

    if save:
        doc.saveas(out_path)
        log(f"\nSelesai. Tersimpan di:\n{out_path}")
    if n_real_roads:
        write_name_sidecar([r for r in roads if not r["virtual"]],
                           sidecar, to_ll, log)
    return report


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Bikin basic map (kotak rumah + jalan + nomor + tiang) "
                    "dari KML/KMZ.")
    ap.add_argument("kml", help="file KML atau KMZ survei")
    ap.add_argument("-o", "--output", help="file DXF hasil")
    ap.add_argument("--depth", type=float,
                    help="kedalaman kotak dalam meter (default: auto)")
    ap.add_argument("--min-width", type=float, default=DEFAULT_MIN_WIDTH,
                    help="lebar muka minimum, meter (default %(default)s)")
    ap.add_argument("--max-width", type=float, default=DEFAULT_MAX_WIDTH,
                    help="lebar muka maksimum, meter (default %(default)s)")
    ap.add_argument("--road-half", type=float,
                    help="setengah lebar jalan, meter (default per kelas OSM, "
                         "gang 2.9)")
    ap.add_argument("--template", default=TEMPLATE_DEFAULT,
                    help="DXF template sumber layer & blok (default %(default)s)")
    ap.add_argument("--keep-template", action="store_true",
                    help="jangan kosongkan modelspace template")
    ap.add_argument("--epsg", type=int, help="paksa EPSG tujuan")
    ap.add_argument("--offline", action="store_true",
                    help="jangan query Overpass, pakai cache saja")
    ap.add_argument("--no-roads", action="store_true",
                    help="sama sekali tidak menggambar jalan")
    ap.add_argument("--no-poles", action="store_true",
                    help="jangan menggambar tiang")
    ap.add_argument("--no-clip", action="store_true",
                    help="jangan potong kotak di perapian terakhir; sisa "
                         "tabrakan dibiarkan untuk dirapikan tangan")
    ap.add_argument("--pole-block", default=POLE_BLOCK,
                    help="nama blok tiang di template (default %(default)s)")
    ap.add_argument("--hp-text", type=float, default=TEXT_HEIGHT_HP)
    ap.add_argument("--road-text", type=float, default=TEXT_HEIGHT_ROAD)
    ap.add_argument("--number-layer", action="store_true",
                    help="HP UNCOVER ikut ditulis di layer 'Home Number' "
                         "(default: layer 'Basic Map', mengikuti gambar drafter)")
    ap.add_argument("--dry-run", action="store_true",
                    help="hitung dan laporkan saja, tanpa menulis file")
    a = ap.parse_args()

    src = Path(a.kml)
    if not src.exists():
        raise SystemExit(f"File tidak ada: {src}")
    tpl = Path(a.template)
    if not tpl.is_absolute():
        tpl = Path(__file__).resolve().parent / tpl

    process(src, a.output, depth=a.depth, min_width=a.min_width,
            max_width=a.max_width, template=tpl, epsg=a.epsg,
            offline=a.offline, dry_run=a.dry_run, road_half=a.road_half,
            hp_text=a.hp_text, road_text=a.road_text,
            uncover_basic=not a.number_layer, keep_template=a.keep_template,
            no_roads=a.no_roads, no_poles=a.no_poles, no_clip=a.no_clip,
            pole_block=a.pole_block)


if __name__ == "__main__":
    main()
