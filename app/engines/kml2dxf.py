#!/usr/bin/env python3
"""
kml2dxf.py - Konversi KML/KMZ desain FTTH -> DXF AutoCAD memakai TEMPLATE.dxf.

Alur:
  1. Scan seluruh KML/KMZ, telusuri Folder/sub-Folder secara rekursif.
  2. Cocokkan nama folder DAUN (leaf) dengan tabel RULES di bawah.
  3. Proyeksikan WGS84 (lat/lon) -> UTM WGS84, zona dideteksi otomatis.
  4. Gambar ke modelspace: INSERT blok / LWPOLYLINE / MTEXT.
  5. Cari tempat kotak keterangan FAT/FDT supaya tidak menduduki FAT AREA,
     tidak saling tumpang tindih, dan garis penghubungnya tidak bersilangan.
  6. Sesuaikan jumlah layout dengan jumlah FDT, lalu isi tabel DESIGN SUMMARY.

Semua warna & lebar garis dibiarkan BYLAYER.

Contoh:
  python kml2dxf.py "desain.kmz"
  python kml2dxf.py "desain.kmz" -o hasil.dxf --dry-run
  python kml2dxf.py "desain.kmz" --epsg 32749
"""
from __future__ import annotations

import argparse
import math
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import ezdxf
from ezdxf import bbox
from ezdxf import colors as ezcolors
from ezdxf.lldxf import const as dxfconst
from lxml import etree
from pyproj import Transformer

# --------------------------------------------------------------------------
# TABEL MAPPING  -  folder KML  ->  layer / blok DXF
# --------------------------------------------------------------------------
# geom   : 'point' | 'line' | 'polygon'
# block  : blok simbol yang ditanam di titik placemark
# label  : blok kotak keterangan; ditaruh otomatis di ruang kosong terdekat
#          lalu disambung ke simbol dengan garis siku 2 ruas
# attrib : tag ATTDEF pada blok label yang diisi nama placemark
# text   : True = tulis nama placemark sebagai MTEXT di layer 'POLE ID'
# pole   : kategori hitungan tiang untuk DESIGN SUMMARY

RULES = [
    # --- FDT --------------------------------------------------------------
    dict(folder="FDT", geom="point", layer="FDT-Info",
         block="FDT", label="FAT Info", attrib="FAT_SEQUENCE"),

    # --- FAT --------------------------------------------------------------
    # 'BOUNDARY FAT' harus menang atas 'FAT' (aturan terpanjang dicek dulu)
    dict(folder="BOUNDARY FAT", geom="polygon", layer="FAT AREA"),
    dict(folder="FAT", geom="point", layer="FAT_Info",
         block="FAT", label="FAT Info", attrib="FAT_SEQUENCE"),

    # --- EXISTING POLE ----------------------------------------------------
    dict(folder="EXISTING POLE EMR 7-2.5",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 7-3",     geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 7-4",     geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 9-4",     geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    # Tiang partner digambar, tapi TIDAK ikut baris 'TOTAL POLE EXISTING MR'.
    dict(folder="EXISTING POLE PARTNER 7-4", geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_PARTNER"),
    dict(folder="EXISTING POLE PARTNER 9-4", geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_PARTNER"),

    # --- NEW POLE ---------------------------------------------------------
    dict(folder="NEW POLE 7-2.5", geom="point", layer="NEW POLE 7m 2.5'",      block="NP 7 2.5", text=True, pole="NEW_7_25"),
    dict(folder="NEW POLE 7-3",   geom="point", layer="NEW POLE HC",           block="NP 7 3",   text=True, pole="NEW_7_3"),
    dict(folder="NEW POLE 7-4",   geom="point", layer="NEW POLE 7m(4 inches)", block="NP 7 4",   text=True, pole="NEW_7_4"),
    dict(folder="NEW POLE 9-4",   geom="point", layer="NEW POLE 9m(4 inches)", block="NP 9 4",   text=True, pole="NEW_9"),

    # --- KABEL & SLING ----------------------------------------------------
    dict(folder="DISTRIBUTION CABLE", geom="line", by_name="cable"),
    dict(folder="SLING WIRE",         geom="line", layer="SLING WIRE"),
]

CABLE_LAYERS = [
    (r"24\s*C\s*/\s*2\s*T|\b24\s*CORE\b|\b24C\b", "FO 24 CORE"),
    (r"36\s*C\s*/\s*3\s*T|\b36\s*CORE\b|\b36C\b", "FO 36 CORE."),
    (r"48\s*C\s*/\s*4\s*T|\b48\s*CORE\b|\b48C\b", "FO 48 CORE"),
]

POLE_TEXT_LAYER = "POLE ID"
POLE_TEXT_HEIGHT = 1.8
POLE_TEXT_STYLE = "Standard"
POLE_TEXT_OFFSET = (2.5, 2.5)

LABEL_SCALE = 1.0

# --- pencarian tempat kotak keterangan -------------------------------------
# Jarak dicoba dari yang TERPENDEK, dinyatakan sebagai kelipatan lebar kotak,
# supaya ikut menyesuaikan kalau ukuran blok label diubah.
LEADER_STEPS = (1.10, 1.30, 1.55, 1.85, 2.20, 2.60, 3.10, 3.70)
LEADER_ANGLES = 36          # arah yang dicoba, tiap 10 derajat
LEADER_LANDING = 6.0        # ruas mendatar yang mendarat ke sisi kotak, meter
CLEARANCE = 1.5             # jarak aman antar objek, meter

SUMMARY_LAYER = "DESIGN SUMMARY"
EMPTY_CELL = "...."

# Folder utama diakhiri penanda FDT: 'LINE A FDT 01', 'LINE B FDT 1', dst.
# Penanda inilah yang memisahkan hitungan summary antar FDT.
FDT_TAG = re.compile(r"\bFDT\s*0*(\d+)\b", re.I)

# Kapasitas FDT dibaca dari WARNA ikon placemark FDT di KMZ, bukan dari nama
# style-nya: nama style tidak konsisten antar file (pernah ditemui
# 'style_fdt_72c0' padahal ikonnya ungu). Dipilih warna acuan terdekat.
FDT_CORE_COLORS = {
    "ungu":   ((0xAA, 0x00, 0xFF), 48),
    "coklat": ((0x80, 0x40, 0x00), 72),
    "merah":  ((0xFF, 0x00, 0x00), 96),
}
FDT_COLOR_TOLERANCE = 120.0     # jarak RGB maksimum supaya masih dianggap cocok

# Pola sel koordinat di kop: ' -6.628655°, 108.524847°'
COORD_CELL = re.compile(r"-?\d{1,3}\.\d{3,}\s*°?\s*,\s*-?\d{1,3}\.\d{3,}\s*°?")
DEG = "°"

BYLAYER_COLOR = ezcolors.BYLAYER
BYLAYER_LW = -1

SMART = {0x2018: "'", 0x2019: "'", 0x201C: '"', 0x201D: '"',
         0x2013: "-", 0x2014: "-"}


# --------------------------------------------------------------------------
# Util nama
# --------------------------------------------------------------------------
def norm(s: str) -> str:
    s = (s or "").upper().strip()
    s = s.translate(SMART).replace('"', "")
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s+", " ", s)
    return s


_RULES_SORTED = sorted(RULES, key=lambda r: -len(norm(r["folder"])))
_RULES_EXACT = {norm(r["folder"]): r for r in RULES}


def match_rule(leaf_folder: str):
    key = norm(leaf_folder)
    if key in _RULES_EXACT:
        return _RULES_EXACT[key]
    for r in _RULES_SORTED:
        if norm(r["folder"]) in key:
            return r
    return None


def cable_layer_for(name: str):
    up = (name or "").upper()
    for pattern, layer in CABLE_LAYERS:
        if re.search(pattern, up):
            return layer
    return None


def clean_project_name(raw: str) -> str:
    """'CBN005381 - MATANGAJI RW 01 ... .KMZ' -> 'MATANGAJI RW 01 ...'."""
    s = (raw or "").strip()
    s = re.sub(r"\.(kmz|kml)$", "", s, flags=re.I).strip()
    s = re.sub(r"^[A-Za-z]*\d[A-Za-z0-9._]*\s*-\s*", "", s).strip()
    return s


def parse_cable_name(name: str):
    """'... CABLE LINE A (FO 24C/2T) - AE - 998 m' -> ('A', 'FO 24C/2T', 998.0)."""
    up = (name or "").upper()
    m_line = re.search(r"\bLINE\s+([A-Z])\b", up)
    m_type = re.search(r"\(([^)]+)\)", name or "")
    m_len = re.search(r"([\d]+(?:[.,]\d+)?)\s*M?\s*$", up)
    line = m_line.group(1) if m_line else None
    ctype = m_type.group(1).strip() if m_type else None
    length = None
    if m_len:
        try:
            length = float(m_len.group(1).replace(",", "."))
        except ValueError:
            length = None
    return line, ctype, length


def core_from_color(rgb):
    """Kapasitas FDT dari warna ikonnya. -> (core, nama_warna, jarak) atau None."""
    if rgb is None:
        return None
    best = None
    for label, (ref, core) in FDT_CORE_COLORS.items():
        d = math.dist(rgb, ref)
        if best is None or d < best[2]:
            best = (core, label, d)
    if best and best[2] <= FDT_COLOR_TOLERANCE:
        return best
    return None


def group_tag(path):
    """Nomor FDT dari nama folder, mis. 'LINE A FDT 01' -> 1. None kalau tak ada."""
    for seg in path:
        m = FDT_TAG.search(seg or "")
        if m:
            return int(m.group(1))
    return None


def fmt_coord(lon: float, lat: float) -> str:
    """Format seperti di kop template: lintang dulu, 6 desimal, pakai derajat."""
    return f" {lat:.6f}{DEG}, {lon:.6f}{DEG}"


def read_kml_bytes(path: Path) -> bytes:
    """Baca KML/KMZ lewat pemuat bersama backend.

    Versi web: pemuat bersama membongkar KMZ dengan batas ukuran (anti zip
    bomb), memilih doc.kml, membereskan encoding/entitas/prefix yatim, dan
    membuang DOCTYPE. Di luar backend (skrip desktop) jatuh ke cara lama.
    """
    try:
        from utils.commons import load_kml_bytes, KmlLoadError
    except ImportError:
        load_kml_bytes = None
    if load_kml_bytes is not None:
        try:
            return load_kml_bytes(Path(path).read_bytes())
        except KmlLoadError as exc:
            raise SystemExit(str(exc))
    if path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".kml")]
            if not names:
                raise SystemExit(f"KMZ tidak berisi file .kml: {path}")
            names.sort(key=lambda n: (Path(n).name.lower() != "doc.kml", n))
            return z.read(names[0])
    return path.read_bytes()


# --------------------------------------------------------------------------
# Parsing KML
# --------------------------------------------------------------------------
class Kml:
    def __init__(self, data: bytes):
        # Parser aman: entitas tidak di-resolve, tanpa akses jaringan.
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        self.root = etree.fromstring(data, parser)
        # Namespace diambil dari tag akar, supaya KML tanpa xmlns tetap terbaca.
        tag = self.root.tag if isinstance(self.root.tag, str) else ""
        self.ns = tag[1:].split("}", 1)[0] if tag.startswith("{") else ""
        self._styles = None
        self._smaps = None

    # ---- warna ikon ----------------------------------------------------
    def _load_styles(self):
        if self._styles is not None:
            return
        self._styles, self._smaps = {}, {}
        for s in self.root.iter(self.q("Style")):
            sid = s.get("id")
            ic = s.find(self.q("IconStyle"))
            if sid and ic is not None:
                c = ic.find(self.q("color"))
                if c is not None and c.text:
                    self._styles[sid] = c.text.strip()
        for sm in self.root.iter(self.q("StyleMap")):
            sid = sm.get("id")
            for p in sm.findall(self.q("Pair")):
                k = p.find(self.q("key"))
                u = p.find(self.q("styleUrl"))
                if sid and k is not None and k.text == "normal" \
                        and u is not None and u.text:
                    self._smaps[sid] = u.text.strip().lstrip("#")

    def icon_rgb(self, pm):
        """Warna ikon placemark sebagai (r, g, b). KML menyimpannya ABGR."""
        self._load_styles()
        col = None
        st = pm.find(self.q("Style"))
        if st is not None:
            ic = st.find(self.q("IconStyle"))
            if ic is not None:
                c = ic.find(self.q("color"))
                if c is not None and c.text:
                    col = c.text.strip()
        if col is None:
            su = pm.find(self.q("styleUrl"))
            if su is not None and su.text:
                sid = su.text.strip().lstrip("#")
                sid = self._smaps.get(sid, sid)
                col = self._styles.get(sid)
        if not col or len(col) != 8:
            return None
        try:
            return (int(col[6:8], 16), int(col[4:6], 16), int(col[2:4], 16))
        except ValueError:
            return None

    def q(self, tag: str) -> str:
        return "{%s}%s" % (self.ns, tag) if self.ns else tag

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

    def lines(self, pm):
        for el in pm.iter(self.q("LineString")):
            c = el.find(self.q("coordinates"))
            if c is not None:
                pts = self.parse_coords(c.text)
                if len(pts) >= 2:
                    yield pts

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


# --------------------------------------------------------------------------
# Geometri blok
# --------------------------------------------------------------------------
def pick_epsg(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def block_extent(doc, name):
    try:
        e = bbox.extents(doc.blocks.get(name), fast=False)
        return e if e.has_data else None
    except Exception:
        return None


def symbol_parts(doc, name):
    """Pisahkan blok gabungan jadi simbol + info garis penghubung bawaan.

    Blok 'FAT' dan 'FDT' di template berisi satu INSERT simbol PLUS satu
    LWPOLYLINE garis penghubung. Garis bawaan itu arahnya mati, jadi kalau
    bloknya diputar untuk mengarahkan garis, tulisan 'FAT'/'FDT' di dalamnya
    ikut terbalik.

    Maka blok gabungan dipecah: yang ditanam cuma simbolnya (selalu tegak),
    dan garis penghubungnya digambar ulang oleh converter sebagai siku 2 ruas
    yang bebas arah dan bebas panjang.

    Kalau blok TIDAK berisi garis (misal user sudah memisahkannya sendiri di
    template), blok itu dipakai utuh apa adanya.
    """
    blk = doc.blocks.get(name)
    nested = None
    line = None
    for e in blk:
        if e.dxftype() == "INSERT" and nested is None:
            nested = e
        elif e.dxftype() == "LWPOLYLINE" and line is None:
            line = e

    if nested is not None and line is not None:
        eb = bbox.extents([nested], fast=False)
        if eb.has_data:
            return dict(block=nested.dxf.name,
                        scale=nested.dxf.xscale,
                        size=(eb.extmax[0] - eb.extmin[0], eb.extmax[1] - eb.extmin[1]),
                        leader_layer=line.dxf.layer,
                        split=True)

    ext = block_extent(doc, name)
    if ext is None:
        return None
    return dict(block=name, scale=1.0,
                size=(ext.extmax[0] - ext.extmin[0], ext.extmax[1] - ext.extmin[1]),
                leader_layer=None, split=False)


def set_base_point(doc, name, point):
    blk = doc.blocks.get(name)
    old = blk.block.dxf.base_point
    blk.block.dxf.base_point = (point[0], point[1], 0.0)
    return (point[0] - old[0], point[1] - old[1])


def center_base_point(doc, name):
    ext = block_extent(doc, name)
    if ext is None:
        return False
    set_base_point(doc, name, ((ext.extmin[0] + ext.extmax[0]) / 2.0,
                               (ext.extmin[1] + ext.extmax[1]) / 2.0))
    return True


# --------------------------------------------------------------------------
# Penempatan kotak keterangan
# --------------------------------------------------------------------------
def place_labels(nodes, boundaries, label_w, label_h, log):
    """Cari posisi kotak keterangan untuk tiap FAT/FDT.

    nodes      : list dict(point=(x,y), sym=(w,h))
    boundaries : list poligon FAT AREA sebagai list titik

    Syarat mutlak, berlaku di semua tingkat:
      - kotak tidak menimpa kotak lain
      - kotak tidak menimpa simbol mana pun
      - garis penghubung tidak menyilang garis penghubung lain
      - garis penghubung tidak menembus kotak lain

    Tingkat pelonggaran, dicoba berurutan, selalu ambil garis TERPENDEK:
      1. kotak di luar SEMUA boundary FAT
      2. kotak di luar boundary miliknya sendiri saja
      3. boundary diabaikan

    Kembalikan list dict(center, leader, tier) sejajar dengan `nodes`.
    """
    try:
        from shapely.geometry import LineString, Point, Polygon, box
        from shapely.ops import unary_union
    except ImportError:
        log.append("shapely tidak terpasang -> kotak keterangan dipasang "
                   "di arah tetap tanpa penghindaran tabrakan")
        out = []
        for nd in nodes:
            x, y = nd["point"]
            c = (x + label_w * 1.1, y - label_h * 3.0)
            out.append(dict(center=c, leader=[(x, y), (c[0] - label_w / 2 - LEADER_LANDING, c[1]),
                                              (c[0] - label_w / 2, c[1])], tier=0))
        return out

    polys = []
    for ring in boundaries:
        try:
            p = Polygon(ring).buffer(0)
            if not p.is_empty:
                polys.append(p)
        except Exception:
            pass
    union = unary_union(polys) if polys else None

    sym_boxes = []
    for nd in nodes:
        x, y = nd["point"]
        w, h = nd["sym"]
        sym_boxes.append(box(x - w / 2 - CLEARANCE, y - h / 2 - CLEARANCE,
                             x + w / 2 + CLEARANCE, y + h / 2 + CLEARANCE))

    own_poly = []
    for nd in nodes:
        pt = Point(nd["point"])
        own = None
        for p in polys:
            if p.contains(pt):
                own = p
                break
        own_poly.append(own)

    def leader_for(node_pt, sym_size, center):
        """Siku 2 ruas: simbol -> titik belok -> mendarat mendatar ke kotak."""
        x, y = node_pt
        right = center[0] >= x
        attach = (center[0] - label_w / 2, center[1]) if right else \
                 (center[0] + label_w / 2, center[1])
        bend = (attach[0] - LEADER_LANDING, attach[1]) if right else \
               (attach[0] + LEADER_LANDING, attach[1])
        # mulai dari tepi simbol, bukan dari tengahnya
        sw, sh = sym_size
        dx, dy = bend[0] - x, bend[1] - y
        d = math.hypot(dx, dy) or 1.0
        t = min((sw / 2) / abs(dx) if dx else 9e9,
                (sh / 2) / abs(dy) if dy else 9e9)
        t = min(t, 0.9)
        start = (x + dx * t, y + dy * t)
        return [start, bend, attach]

    order = sorted(range(len(nodes)),
                   key=lambda i: (own_poly[i].area if own_poly[i] is not None else 0.0))

    results = [None] * len(nodes)
    placed_boxes = []
    placed_leads = []

    for i in order:
        nd = nodes[i]
        x, y = nd["point"]
        chosen = None
        for tier in (1, 2, 3):
            best = None
            for step in LEADER_STEPS:
                r = label_w * step
                for k in range(LEADER_ANGLES):
                    a = 2 * math.pi * k / LEADER_ANGLES
                    cx, cy = x + r * math.cos(a), y + r * math.sin(a)
                    b = box(cx - label_w / 2 - CLEARANCE, cy - label_h / 2 - CLEARANCE,
                            cx + label_w / 2 + CLEARANCE, cy + label_h / 2 + CLEARANCE)

                    if tier == 1 and union is not None and b.intersects(union):
                        continue
                    if tier == 2 and own_poly[i] is not None and b.intersects(own_poly[i]):
                        continue
                    if any(b.intersects(q) for q in placed_boxes):
                        continue
                    if any(b.intersects(s) for j, s in enumerate(sym_boxes) if j != i):
                        continue
                    # kotak baru tidak boleh mendarat di atas garis yang sudah ada
                    if any(b.intersects(q) for q in placed_leads):
                        continue

                    lead = LineString(leader_for((x, y), nd["sym"], (cx, cy)))
                    if any(lead.intersects(q) for q in placed_leads):
                        continue
                    if any(lead.intersects(q) for q in placed_boxes):
                        continue
                    if any(lead.intersects(s) for j, s in enumerate(sym_boxes) if j != i):
                        continue

                    best = ((cx, cy), lead, b)
                    break
                if best:
                    break                 # jarak terpendek yang berhasil
            if best:
                chosen = (best, tier)
                break
        if chosen is None:
            # benar-benar buntu: pakai arah bawaan template
            c = (x + label_w * 1.1, y - label_h * 3.0)
            lead = LineString(leader_for((x, y), nd["sym"], c))
            chosen = (((c), lead, box(c[0] - label_w / 2, c[1] - label_h / 2,
                                      c[0] + label_w / 2, c[1] + label_h / 2)), 0)
        (center, lead, b), tier = chosen
        placed_boxes.append(b)
        placed_leads.append(lead)
        results[i] = dict(center=center, leader=list(lead.coords), tier=tier)

    tiers = Counter(r["tier"] for r in results)
    log.append(f"penempatan kotak keterangan: "
               f"{tiers.get(1,0)} di luar semua boundary, "
               f"{tiers.get(2,0)} di luar boundary sendiri, "
               f"{tiers.get(3,0)} terpaksa menimpa boundary, "
               f"{tiers.get(0,0)} gagal")
    lens = [math.dist(r["leader"][0], r["leader"][-1]) for r in results]
    if lens:
        log.append(f"panjang garis penghubung: {min(lens):.0f} - {max(lens):.0f} m "
                   f"(rata-rata {sum(lens)/len(lens):.0f} m)")
    return results


# --------------------------------------------------------------------------
# DESIGN SUMMARY
# --------------------------------------------------------------------------
def cell_text(e) -> str:
    return e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text


def set_cell(e, value: str) -> None:
    if e.dxftype() == "MTEXT":
        e.text = value
    else:
        e.dxf.text = value


NUMERIC = re.compile(r"^[\d.,]+$")


class SummaryTable:
    """Tabel DESIGN SUMMARY di satu layout.

    Isinya TEXT lepas-lepas, bukan tabel sungguhan: label, ':' dan angka
    masing-masing entitas sendiri pada baris Y yang hampir sama. Sebagian
    baris malah menggabung label + ':' + angka dalam satu TEXT.
    """

    Y_TOL = 0.06
    X_SPAN = 1.05

    def __init__(self, layout):
        self.cells = [e for e in layout
                      if e.dxftype() in ("TEXT", "MTEXT")
                      and e.dxf.layer == SUMMARY_LAYER]
        self.touched = set()

    def _label(self, pred):
        for e in self.cells:
            if pred(cell_text(e)):
                return e
        return None

    def value_cell(self, label):
        ly = label.dxf.insert[1]
        lx = label.dxf.insert[0]
        cands = [c for c in self.cells
                 if c is not label
                 and abs(c.dxf.insert[1] - ly) <= self.Y_TOL
                 and lx < c.dxf.insert[0] <= lx + self.X_SPAN
                 and NUMERIC.fullmatch(cell_text(c).strip())]
        return min(cands, key=lambda c: c.dxf.insert[0]) if cands else None

    def set_row(self, pred, value, relabel=None) -> bool:
        lab = self._label(pred)
        if lab is None:
            return False
        if relabel is not None:
            set_cell(lab, relabel)
        self.touched.add(id(lab))

        vc = self.value_cell(lab)
        if vc is not None:
            set_cell(vc, str(value))
            self.touched.add(id(vc))
            return True

        txt = cell_text(lab)
        new = re.sub(r"(:\s*)([\d.,]+)", lambda m: m.group(1) + str(value), txt, count=1)
        if new != txt:
            set_cell(lab, new)
            return True
        # Teks tidak berubah berarti angkanya kebetulan sudah benar -- itu
        # bukan kegagalan. Yang gagal adalah kalau pola ': angka' tak ketemu.
        return re.search(r":\s*[\d.,]+", txt) is not None

    def reset_untouched(self) -> list:
        """Kosongkan angka baris yang tidak kita isi.

        Template datang berisi angka proyek sebelumnya; kalau dibiarkan,
        gambar ini akan memajang angka proyek lain.
        """
        done = []
        for lab in self.cells:
            if id(lab) in self.touched:
                continue
            t = cell_text(lab).strip()
            if not (t.startswith("TOTAL") or t.startswith("- LINE")):
                continue
            vc = self.value_cell(lab)
            if vc is not None and id(vc) not in self.touched:
                if cell_text(vc).strip() != EMPTY_CELL:
                    set_cell(vc, EMPTY_CELL)
                    done.append(t)
            else:
                new = re.sub(r"(:\s*)([\d,]+(?:\.\d+)?)(?!\S)",
                             lambda m: m.group(1) + EMPTY_CELL, t, count=1)
                if new != t:
                    set_cell(lab, new)
                    done.append(t)
        return done


def replace_project_name(layout, old: str, new: str) -> int:
    n = 0
    for e in layout:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        if e.dxftype() == "MTEXT":
            if old in e.text:
                e.text = e.text.replace(old, new)
                n += 1
        elif old in e.dxf.text:
            e.dxf.text = e.dxf.text.replace(old, new)
            n += 1
    return n


def current_project_name(layout):
    """Nama proyek di template: teks tepat di bawah kepala 'DESIGN SUMMARY'."""
    head = None
    for e in layout:
        if e.dxftype() == "TEXT" and e.dxf.layer == SUMMARY_LAYER \
                and cell_text(e).strip() == "DESIGN SUMMARY":
            head = e
            break
    if head is None:
        return None
    hx, hy = head.dxf.insert[0], head.dxf.insert[1]
    best = None
    for e in layout:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        x, y = e.dxf.insert[0], e.dxf.insert[1]
        if y >= hy or hy - y > 0.35 or not (hx - 1.0 < x < hx + 2.0):
            continue
        t = cell_text(e).strip()
        if len(t) < 4 or t.startswith("TOTAL"):
            continue
        if best is None or y > best[0]:
            best = (y, t)
    return best[1] if best else None


def set_coord_cell(layout, text: str):
    """Isi sel 'Kordinat FDT / Ref' di kop.

    Dicari lewat POLA ISINYA (sepasang derajat desimal), bukan lewat posisi,
    supaya tetap ketemu kalau kop digeser. Label 'Kordinat FDT / Ref' sendiri
    tertanam di dalam blok title block, jadi tidak bisa dijadikan pegangan.
    """
    for e in layout:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        if COORD_CELL.search(cell_text(e)):
            set_cell(e, text)
            return True
    return False


def blank_hub_cells(layout, value: str = EMPTY_CELL) -> list:
    """Kosongkan isi 'Hub Plan Name' dan 'OLT/ Sub Hub Plan Name' di kop.

    Nilainya adalah teks tepat di bawah label dua bahasa itu.
    """
    cells = [e for e in layout if e.dxftype() in ("TEXT", "MTEXT")]
    done = []
    for label in ("Nama Rencana Hub", "Nama Rencana OLT"):
        lab = next((e for e in cells if cell_text(e).strip().startswith(label)), None)
        if lab is None:
            continue
        lx, ly = lab.dxf.insert[0], lab.dxf.insert[1]
        # Dua kolom kop ini hanya berjarak 0.79, jadi toleransi X harus rapat;
        # kalau longgar, label kolom kiri bisa mengambil nilai kolom kanan.
        cand = [e for e in cells
                if e is not lab
                and abs(e.dxf.insert[0] - lx) < 0.35
                and ly - 0.30 < e.dxf.insert[1] < ly - 0.02
                and cell_text(e).strip()]
        if cand:
            v = max(cand, key=lambda e: (e.dxf.insert[1],
                                         -abs(e.dxf.insert[0] - lx)))
            old = cell_text(v).strip()
            if old != value:
                set_cell(v, value)
                done.append(f"{label}: {old!r} -> {value!r}")
    return done


def sync_layout_count(doc, n_fdt: int, log: list) -> None:
    """Jumlah layout mengikuti jumlah FDT di KMZ: 1 FDT 1 layout, 2 FDT 2, dst."""
    names = sorted(n for n in doc.layout_names() if n != "Model")
    want = max(1, n_fdt)
    if len(names) == want:
        log.append(f"jumlah layout sudah pas: {want} (FDT = {n_fdt})")
        return

    if len(names) > want:
        for nm in names[want:]:
            doc.layouts.delete(nm)
            log.append(f"layout {nm!r} dihapus (FDT cuma {n_fdt})")
        return

    src_name = names[-1]
    src = doc.layouts.get(src_name)
    for i in range(len(names), want):
        new_name = f"layout ({i + 1})"
        while new_name in doc.layout_names():
            new_name += "_"
        lo = doc.layouts.new(new_name)
        try:
            for k, v in src.dxf_layout.dxf.all_existing_dxf_attribs().items():
                if k in ("handle", "owner", "name", "block_record_handle",
                         "taborder", "block_record"):
                    continue
                lo.dxf_layout.dxf.set(k, v)
        except Exception:
            pass
        n = 0
        failed = Counter()
        for e in src:
            try:
                lo.add_entity(e.copy())
                n += 1
            except Exception:
                failed[e.dxftype()] += 1
        log.append(f"layout {new_name!r} dibuat menyalin {src_name!r} ({n} objek) "
                   f"karena ada {n_fdt} FDT")
        if failed:
            rincian = ", ".join(f"{v} {k}" for k, v in sorted(failed.items()))
            log.append(f"  PERHATIAN: {rincian} tidak bisa disalin ke {new_name!r}. "
                       f"OLE2FRAME adalah objek OLE tertanam (mis. logo di kop gambar) "
                       f"yang tidak didukung ezdxf -- salin manual di AutoCAD.")


# --------------------------------------------------------------------------
# Konversi
# --------------------------------------------------------------------------
def convert(kml_path: Path, template: Path, out_path: Path,
            epsg=None, keep_template=False, dry_run=False,
            fill_summary=True, reset_summary=True, auto_layouts=True,
            doc=None, save=True, log=print):
    """doc/save dipakai oleh kml2dxf_full.py:

    log  : fungsi pencatat (default print). Backend mengirim penampung
           sendiri supaya catatan proses masuk ke laporan job, tanpa
           mengalihkan stdout yang dipakai bersama oleh job lain.

    doc  : gambar ke dokumen DXF yang sudah dibuka (template tidak dibaca
           lagi), supaya desain APD dan basic map jadi satu file.
    save : False = jangan simpan, biar penggabung yang menyimpan sekali.

    Mengembalikan ringkasan hitungan (proyek, EPSG, jumlah FDT, homepass,
    FAT, tiang) supaya penggabung bisa ikut melaporkannya."""

    kml = Kml(read_kml_bytes(kml_path))
    pms = kml.placemarks()
    if not pms:
        raise SystemExit("Tidak ada Placemark di file ini.")

    lons, lats = [], []
    for _, _, pm in pms:
        for c in pm.iter(kml.q("coordinates")):
            for lon, lat in Kml.parse_coords(c.text):
                lons.append(lon)
                lats.append(lat)
    if not lons:
        raise SystemExit("Tidak ada koordinat yang terbaca.")

    clon = (min(lons) + max(lons)) / 2
    clat = (min(lats) + max(lats)) / 2
    code = epsg or pick_epsg(clon, clat)
    tr = Transformer.from_crs("EPSG:4326", f"EPSG:{code}", always_xy=True)

    def xy(lon, lat):
        return tr.transform(lon, lat)

    project = clean_project_name(kml.doc_name() or kml_path.name)

    log(f"File      : {kml_path.name}")
    log(f"Proyek    : {project}")
    log(f"Placemark : {len(pms)}")
    log(f"Proyeksi  : EPSG:4326 -> EPSG:{code}"
          f"{' (auto)' if epsg is None else ' (manual)'}")

    stat = Counter()
    warn = []
    summary_log = []
    place_log = []

    # --- placemark FDT: nama, koordinat, kapasitas core dari warna ikon ----
    fdt_pms = []
    for path, name, pm in pms:
        if path and norm(path[-1]) == "FDT":
            for lon, lat in kml.points(pm):
                rgb = kml.icon_rgb(pm)
                fdt_pms.append(dict(name=name, lonlat=(lon, lat), rgb=rgb,
                                    core=core_from_color(rgb)))

    plan = []
    skipped = defaultdict(int)
    groups = defaultdict(lambda: dict(poles=Counter(), cables={}, n_fat=0,
                                      homepass=0, cable_names=[]))

    for path, name, pm in pms:
        leaf = path[-1] if path else ""
        gid = group_tag(path)
        if any("HP COVER" in norm(p) for p in path):
            groups[gid]["homepass"] += sum(1 for _ in kml.points(pm))
        rule = match_rule(leaf)
        if rule is None:
            skipped["/".join(path[1:]) or "(root)"] += 1
            continue
        plan.append((rule, path, name, pm))

        g = groups[gid]
        if rule.get("pole"):
            g["poles"][rule["pole"]] += sum(1 for _ in kml.points(pm))
        if rule.get("by_name") == "cable":
            line, ctype, length = parse_cable_name(name)
            if line:
                g["cables"][line] = (ctype, length)
            g["cable_names"].append(name)
        if norm(rule["folder"]) == "FAT":
            g["n_fat"] += sum(1 for _ in kml.points(pm))

    # gid None = konten tanpa penanda FDT di nama foldernya
    tagged = sorted(k for k in groups if k is not None)
    if not tagged:
        merged = groups.pop(None, None)
        groups = {1: merged} if merged else {}
        tagged = sorted(groups)
    else:
        groups.pop(None, None)

    # --- pasangkan tiap grup dengan placemark FDT-nya ----------------------
    # Nama kabel memuat nama FDT ('ABL1.2.1.048 - CABLE LINE A ABL1.2.1.048'),
    # jadi itu yang dipakai; urutan folder hanya jadi cadangan.
    used = set()
    for gid in tagged:
        g = groups[gid]
        g["fdt"] = None
        blob = " ".join(g["cable_names"]).upper()
        for i, f in enumerate(fdt_pms):
            if i not in used and f["name"] and f["name"].upper() in blob:
                g["fdt"] = f
                used.add(i)
                break
    for gid in tagged:
        if groups[gid]["fdt"] is None:
            for i, f in enumerate(fdt_pms):
                if i not in used:
                    groups[gid]["fdt"] = f
                    used.add(i)
                    warn.append(f"FDT untuk grup 'FDT {gid:02d}' tidak bisa "
                                f"dicocokkan lewat nama kabel -> dipakai urutan "
                                f"({f['name']!r})")
                    break

    n_fdt = len(fdt_pms)
    poles = Counter()
    cables = {}
    homepass = 0
    n_fat = 0
    for gid in tagged:
        g = groups[gid]
        poles.update(g["poles"])
        cables.update(g["cables"])
        homepass += g["homepass"]
        n_fat += g["n_fat"]

    if dry_run:
        log("\n=== DRY RUN - tidak ada file ditulis ===")
    else:
        if doc is None:
            doc = ezdxf.readfile(str(template))
        msp = doc.modelspace()
        doc.header["$INSUNITS"] = 6

        if not keep_template:
            n = 0
            for e in list(msp):
                msp.delete_entity(e)
                n += 1
            log(f"Modelspace: {n} objek bawaan template dihapus")

        layers = {l.dxf.name for l in doc.layers}
        blocks = {b.name for b in doc.blocks}

        def ensure_layer(nm):
            if nm and nm not in layers:
                doc.layers.add(nm)
                layers.add(nm)
                warn.append(f"layer '{nm}' tidak ada di template -> dibuat baru")

        def base(layer):
            return {"layer": layer, "color": BYLAYER_COLOR, "lineweight": BYLAYER_LW}

        # --- siapkan blok --------------------------------------------------
        # Isi blok di template digambar jauh dari base point-nya sendiri
        # (isi 'NP7' ada di +10.475, -5.327). Tanpa dinormalkan, simbol
        # muncul belasan kilometer dari titik yang benar.
        parts = {}
        prepared = set()
        for rule, *_ in plan:
            bn = rule.get("block")
            if bn and bn in blocks and bn not in prepared:
                prepared.add(bn)
                info = symbol_parts(doc, bn)
                if info:
                    parts[bn] = info
                    center_base_point(doc, info["block"])
            lb = rule.get("label")
            if lb and lb in blocks and lb not in prepared:
                prepared.add(lb)
                ext = block_extent(doc, lb)
                if ext:
                    set_base_point(doc, lb, (ext.extmin[0], ext.extmin[1]))

        label_dims = {}
        for rule, *_ in plan:
            lb = rule.get("label")
            if lb and lb in blocks and lb not in label_dims:
                ext = block_extent(doc, lb)
                if ext:
                    label_dims[lb] = (ext.extmax[0] - ext.extmin[0],
                                      ext.extmax[1] - ext.extmin[1])

        # --- gambar; FAT/FDT ditunda sampai posisinya dihitung --------------
        pending = []
        rings_all = []

        for rule, path, name, pm in plan:
            geom = rule["geom"]
            layer = rule.get("layer")

            if rule.get("by_name") == "cable":
                layer = cable_layer_for(name)
                if layer is None:
                    warn.append(f"jenis core tidak dikenali, kabel dilewati: {name!r}")
                    stat["!! kabel tak dikenali"] += 1
                    continue
            ensure_layer(layer)

            if geom == "point":
                blk = rule.get("block")
                info = parts.get(blk)
                for lon, lat in kml.points(pm):
                    p = xy(lon, lat)

                    if info:
                        sc = info["scale"]
                        msp.add_blockref(info["block"], p, dxfattribs={
                            **base(layer), "xscale": sc, "yscale": sc, "zscale": sc})
                        stat[f"{layer}  <- blok '{info['block']}'"] += 1
                    elif blk:
                        warn.append(f"blok '{blk}' tidak ada di template "
                                    f"-> digambar sebagai POINT")
                        msp.add_point(p, dxfattribs=base(layer))
                        stat[f"{layer}  <- POINT"] += 1
                    else:
                        msp.add_point(p, dxfattribs=base(layer))
                        stat[f"{layer}  <- POINT"] += 1

                    if rule.get("label") and rule["label"] in blocks:
                        pending.append(dict(
                            point=p,
                            sym=(info["size"][0] * info["scale"],
                                 info["size"][1] * info["scale"]) if info else (5.0, 5.0),
                            label=rule["label"], layer=layer,
                            leader_layer=(info or {}).get("leader_layer") or layer,
                            attrib=rule.get("attrib"), name=name))

                    if rule.get("text") and name:
                        ensure_layer(POLE_TEXT_LAYER)
                        t = msp.add_mtext(name, dxfattribs={
                            **base(POLE_TEXT_LAYER),
                            "style": POLE_TEXT_STYLE,
                            "char_height": POLE_TEXT_HEIGHT})
                        t.set_location(
                            (p[0] + POLE_TEXT_OFFSET[0], p[1] + POLE_TEXT_OFFSET[1]),
                            attachment_point=dxfconst.MTEXT_BOTTOM_LEFT)
                        stat[f"{POLE_TEXT_LAYER}  <- MTEXT"] += 1

            elif geom == "line":
                for pts in kml.lines(pm):
                    msp.add_lwpolyline([xy(*p) for p in pts],
                                       format="xy", dxfattribs=base(layer))
                    stat[f"{layer}  <- LWPOLYLINE"] += 1

            elif geom == "polygon":
                for pts in kml.rings(pm):
                    ring = [xy(*p) for p in pts]
                    rings_all.append(ring)
                    pl = msp.add_lwpolyline(ring, format="xy", dxfattribs=base(layer))
                    pl.close(True)
                    stat[f"{layer}  <- LWPOLYLINE tertutup"] += 1

        # --- cari tempat kotak keterangan, lalu gambar ----------------------
        if pending:
            lname = pending[0]["label"]
            lw, lh = label_dims.get(lname, (40.0, 13.0))
            lw *= LABEL_SCALE
            lh *= LABEL_SCALE
            spots = place_labels(pending, rings_all, lw, lh, place_log)

            for nd, spot in zip(pending, spots):
                c = spot["center"]
                q = (c[0] - lw / 2, c[1] - lh / 2)      # base blok = kiri-bawah
                ref = msp.add_blockref(nd["label"], q, dxfattribs={
                    **base(nd["layer"]), "xscale": LABEL_SCALE,
                    "yscale": LABEL_SCALE, "zscale": LABEL_SCALE})
                if nd["attrib"]:
                    ref.add_auto_attribs({nd["attrib"]: nd["name"]})
                stat[f"{nd['layer']}  <- blok '{nd['label']}'"] += 1

                ensure_layer(nd["leader_layer"])
                msp.add_lwpolyline(spot["leader"], format="xy",
                                   dxfattribs=base(nd["leader_layer"]))
                stat[f"{nd['leader_layer']}  <- garis penghubung"] += 1

        # --- layout & DESIGN SUMMARY ---------------------------------------
        if auto_layouts:
            sync_layout_count(doc, n_fdt, summary_log)

        if fill_summary:
            sheets = sorted(n for n in doc.layout_names() if n != "Model")
            per_sheet = len(tagged) > 1 or n_fdt > 1

            for idx, loname in enumerate(sheets):
                lo = doc.layouts.get(loname)
                gid = tagged[idx] if idx < len(tagged) else None
                g = groups.get(gid) if gid is not None else None
                fdt = (g or {}).get("fdt")

                # Judul di bawah kepala DESIGN SUMMARY diberi akhiran FDT 01,
                # sedangkan Nama Proyek di kop kanan tetap polos.
                suffix = f" FDT {gid:02d}" if (per_sheet and gid is not None) else ""
                old = current_project_name(lo)
                if old:
                    for e in lo:
                        if e.dxftype() not in ("TEXT", "MTEXT"):
                            continue
                        if old not in cell_text(e):
                            continue
                        is_summary_side = e.dxf.insert[0] < 5.0
                        set_cell(e, cell_text(e).replace(
                            old, project + (suffix if is_summary_side else "")))
                    summary_log.append(
                        f"[{loname}] judul summary: {project + suffix!r}; "
                        f"kop: {project!r}")

                # koordinat FDT di kop
                if fdt:
                    lon, lat = fdt["lonlat"]
                    if set_coord_cell(lo, fmt_coord(lon, lat)):
                        summary_log.append(f"[{loname}] koordinat FDT "
                                           f"{fdt['name']}: {fmt_coord(lon, lat).strip()}")
                    else:
                        warn.append(f"[{loname}] sel koordinat FDT tidak ketemu di kop")

                for s in blank_hub_cells(lo):
                    summary_log.append(f"[{loname}] {s}")

                tbl = SummaryTable(lo)
                filled = []
                gp = (g or {}).get("poles", Counter())
                gc = (g or {}).get("cables", {})

                for letter in sorted(gc):
                    ctype, length = gc[letter]
                    lbl = f"- LINE {letter}" + (f" ({ctype})" if ctype else "")
                    ok = tbl.set_row(
                        lambda t, L=letter: t.strip().upper().startswith(f"- LINE {L}"),
                        int(round(length)) if length is not None else EMPTY_CELL,
                        relabel=lbl)
                    if ok:
                        filled.append(f"{lbl} = "
                                      f"{int(round(length)) if length else '-'}")

                # Kapasitas core diambil dari warna ikon FDT di KMZ
                core_lbl = None
                if fdt and fdt.get("core"):
                    core, wname, dist = fdt["core"]
                    core_lbl = f"TOTAL FDT ({core} CORE)"
                    summary_log.append(
                        f"[{loname}] warna FDT RGB{fdt['rgb']} -> {wname} "
                        f"-> {core} CORE (jarak warna {dist:.0f})")
                elif fdt:
                    warn.append(f"[{loname}] warna ikon FDT {fdt['name']!r} = "
                                f"{fdt['rgb']} tidak cocok ungu/coklat/merah -> "
                                f"kapasitas core dibiarkan seperti template")

                rows = [
                    ("TOTAL POLE EXISTING MR",
                     lambda t: t.strip().upper().startswith("TOTAL POLE EXISTING MR"),
                     gp["EXISTING_MR"], None),
                    ('TOTAL NEW 7M POLE 2.5"',
                     lambda t: '2.5"' in t and "7M POLE" in t.upper(),
                     gp["NEW_7_25"], None),
                    ('TOTAL NEW 7M POLE 3"',
                     lambda t: '3"' in t and "7M POLE" in t.upper(),
                     gp["NEW_7_3"], None),
                    ('TOTAL NEW 7M POLE 4"',
                     lambda t: '4"' in t and "7M POLE" in t.upper(),
                     gp["NEW_7_4"], None),
                    ("TOTAL NEW 9M POLE",
                     lambda t: t.strip().upper().startswith("TOTAL NEW 9M POLE"),
                     gp["NEW_9"], None),
                    ("TOTAL HOMEPASS",
                     lambda t: t.strip().upper().startswith("TOTAL HOMEPASS"),
                     (g or {}).get("homepass", 0), None),
                    ("TOTAL FDT",
                     lambda t: t.strip().upper().startswith("TOTAL FDT"),
                     1 if per_sheet else n_fdt, core_lbl),
                    ("TOTAL FAT (POLE MOUNTED)",
                     lambda t: "FAT (POLE MOUNTED)" in t.upper(),
                     (g or {}).get("n_fat", 0), None),
                ]
                for title, pred, val, relabel in rows:
                    if tbl.set_row(pred, val, relabel=relabel):
                        filled.append(f"{relabel or title} = {val}")
                    else:
                        warn.append(f"[{loname}] baris {title!r} tidak ketemu di summary")

                for f in filled:
                    summary_log.append(f"[{loname}] {f}")

                if reset_summary:
                    for c in tbl.reset_untouched():
                        summary_log.append(f"[{loname}] dikosongkan: {c}")

        if save:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            doc.saveas(str(out_path))

    # --- laporan -----------------------------------------------------------
    log("\n=== DIKONVERSI (per folder KML) ===")
    byfolder = Counter()
    for rule, path, name, pm in plan:
        byfolder[(path[-1] if path else "", rule.get("layer") or "(dari nama)")] += 1
    for (folder, layer), n in sorted(byfolder.items()):
        log(f"  {folder:<26} -> {layer:<24} {n:>4}")

    if stat:
        log("\n=== OBJEK DIGAMBAR (per layer DXF) ===")
        for k, v in sorted(stat.items()):
            log(f"  {k:<46} {v:>4}")
        log(f"  {'TOTAL':<46} {sum(stat.values()):>4}")

    if place_log:
        log("\n=== PENEMPATAN KOTAK KETERANGAN ===")
        for s in place_log:
            log("  " + s)

    log(f"\n=== HITUNGAN DESIGN SUMMARY ({len(tagged)} grup, {n_fdt} FDT) ===")
    for gid in tagged:
        g = groups[gid]
        f = g.get("fdt")
        gp = g["poles"]
        head = f"FDT {gid:02d}"
        if f:
            lon, lat = f["lonlat"]
            core = f"{f['core'][0]} CORE ({f['core'][1]})" if f.get("core") else "core?"
            head += f"  {f['name']}  {lat:.6f}, {lon:.6f}  {core}"
        log(f"  --- {head} ---")
        log(f"      Existing MR {gp['EXISTING_MR']:>4} | "
              f"7m2.5\" {gp['NEW_7_25']:>3} | 7m3\" {gp['NEW_7_3']:>3} | "
              f"7m4\" {gp['NEW_7_4']:>3} | 9m {gp['NEW_9']:>3}")
        if gp["EXISTING_PARTNER"]:
            log(f"      Existing PARTNER {gp['EXISTING_PARTNER']} "
                  f"(digambar, tidak masuk baris MR)")
        log(f"      Homepass {g['homepass']:>4} | FAT {g['n_fat']:>3}")
        for letter in sorted(g["cables"]):
            ctype, length = g["cables"][letter]
            log(f"      LINE {letter} ({ctype}) : {length}")

    if summary_log:
        log("\n=== LAYOUT & DESIGN SUMMARY ===")
        for s in summary_log:
            log("  " + s)

    if skipped:
        log("\n=== FOLDER DILEWATI (tidak ada di tabel RULES) ===")
        for f, n in sorted(skipped.items(), key=lambda kv: -kv[1]):
            log(f"  {f:<46} {n:>4} placemark")

    if warn:
        log("\n=== PERINGATAN ===")
        for w in sorted(set(warn)):
            log("  -", w)

    if not dry_run and save:
        log(f"\nTersimpan: {out_path}")

    return dict(project=project, epsg=code, n_fdt=n_fdt, groups=len(tagged),
                homepass=homepass, n_fat=n_fat, poles=dict(poles),
                drawn=sum(stat.values()), placemarks=len(pms),
                skipped=sum(skipped.values()), warn=sorted(set(warn)))


def main():
    ap = argparse.ArgumentParser(description="Konversi KML/KMZ FTTH ke DXF AutoCAD.")
    ap.add_argument("input", type=Path, help="file .kml atau .kmz")
    ap.add_argument("-o", "--output", type=Path, help="file .dxf keluaran")
    ap.add_argument("-t", "--template", type=Path,
                    default=Path(__file__).with_name("TEMPLATE.dxf"),
                    help="template DXF (default: TEMPLATE.dxf di folder skrip)")
    ap.add_argument("--epsg", type=int,
                    help="paksa EPSG tujuan, mis. 32749 (default: UTM auto-deteksi)")
    ap.add_argument("--keep-template", action="store_true",
                    help="jangan hapus geometri bawaan template")
    ap.add_argument("--no-summary", action="store_true",
                    help="jangan sentuh tabel DESIGN SUMMARY")
    ap.add_argument("--keep-old-summary", action="store_true",
                    help="biarkan angka proyek lama di baris yang tidak diisi")
    ap.add_argument("--fixed-layouts", action="store_true",
                    help="jangan sesuaikan jumlah layout dengan jumlah FDT")
    ap.add_argument("--dry-run", action="store_true",
                    help="hanya tampilkan rencana konversi, tidak menulis file")
    a = ap.parse_args()

    if not a.input.exists():
        raise SystemExit(f"Input tidak ditemukan: {a.input}")
    if not a.dry_run and not a.template.exists():
        raise SystemExit(f"Template tidak ditemukan: {a.template}")

    out = a.output or a.input.with_suffix(".dxf")
    convert(a.input, a.template, out, a.epsg, a.keep_template, a.dry_run,
            fill_summary=not a.no_summary,
            reset_summary=not a.keep_old_summary,
            auto_layouts=not a.fixed_layouts)


if __name__ == "__main__":
    main()
