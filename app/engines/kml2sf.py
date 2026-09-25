#!/usr/bin/env python3
"""
kml2sf.py - Konversi KML/KMZ SUB FEEDER (SF) -> DXF AutoCAD memakai TEMPLATE.dxf.

Gambar SF jauh lebih ringkas daripada APD: satu rute kabel sub feeder, tiang
yang dilewatinya, satu joint closure, dan beberapa slack hanger. Kop, LEGEND,
dan tabel DESIGN SUMMARY-nya SAMA PERSIS dengan gambar APD, jadi template dan
mesin hitungnya dipakai ulang dari kml2dxf.py -- yang beda cuma isi tabel dan
folder yang dibaca.

Yang digambar (semua BYLAYER, koordinat UTM WGS84, 1 unit = 1 meter):
  * jalan          -> tepi jalan + nama jalan dari OpenStreetMap, layer
                      'Basic Map' (mesinnya dipakai ulang dari kml2basicmap.py)
  * tiang          -> INSERT blok EXT MR / NP 7 2.5 / NP 7 3 / NP 7 4 / NP 9 4
  * ID tiang       -> MTEXT di layer 'POLE ID'
  * kabel          -> LWPOLYLINE di layer sesuai jumlah core (FO 24/36/48 CORE)
  * joint closure  -> simbol bowtie dari blok 'CLOSURE' template + kotak info
                      blok 'CLOSURE INFO' ber-ATRIBUT (CLOSURE_ID, KOORDINAT,
                      SPLICE): klik dua kali kotaknya di AutoCAD untuk mengedit.
                      Yang diisi script hanya KOORDINAT; CLOSURE_ID dan
                      SPLICE dibiarkan '-'
  * slack hanger   -> simbol coil dari blok 'SLACK' template + tulisan
                      'FO A reserved / 20m here' blok 'SLACK INFO' (tanpa
                      atribut -- isinya selalu sama), selalu tegak
  Kotak closure dan tulisan slack dicarikan tempat di LUAR jalan (koridor dan
  nama jalan), tidak menimpa simbol, kabel, atau tulisan lain; garis
  penunjuknya digambar ulang dari simbol ke kotak/tulisan.

Isi DESIGN SUMMARY, dibaca dari KMZ (dicocokkan dengan gambar drafter):
  - LINE A/B/C          panjang diambil dari NAMA kabel, bukan dari geometrinya.
                        Nama menyebut panjang terpasang (sudah termasuk sag dan
                        slack); geometri KMZ selalu lebih pendek.
                        Kabel 'SUBFEEDER' tanpa huruf LINE dihitung sebagai A.
  TOTAL POLE EXISTING MR, NEW 7M POLE 2.5"/3"/4", NEW 9M POLE
  TOTAL JOINT CLOSURE <kapasitas>   label ikut kapasitas di nama closure;
                        yang dihitung HANYA closure baru (NEW), yang existing
                        dibiarkan kosong -- sesuai gambar drafter.
  TOTAL LABEL CABLE     = jumlah tiang (satu label kabel per tiang).
  TOTAL HOMEPASS        TIDAK ada di KMZ SF (angkanya milik proyek APD-nya),
                        jadi diisi lewat --homepass kalau perlu.

Contoh:
  python kml2sf.py "CBN006163 - SF PERUMAHAN BUMI SARI.kmz"
  python kml2sf.py "sf.kmz" -o hasil.dxf --homepass 180 --hub GEBANG
  python kml2sf.py "sf.kmz" --dry-run
"""
from __future__ import annotations

import argparse
import importlib.util
import math
import re
import sys
from collections import Counter
from pathlib import Path

import ezdxf
from ezdxf.enums import TextEntityAlignment
from ezdxf.lldxf import const as dxfconst
from shapely import STRtree
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent

try:                                      # di backend: paket 'engines'
    from engines import kml2dxf as apd    # mesin bersama: KML, blok, summary
except ImportError:                       # skrip desktop: file bersebelahan
    sys.path.insert(0, str(HERE))
    import kml2dxf as apd

TEMPLATE_DEFAULT = "TEMPLATE.dxf"

# --------------------------------------------------------------------------
# TABEL MAPPING  -  folder KML SF  ->  layer / blok DXF
# --------------------------------------------------------------------------
LAYER_ROAD = "Basic Map"        # tepi jalan + nama jalan (abu tipis)
LAYER_JC = "FIBER OPTIC CLOSURE"
LAYER_SLACK = "FIBER SPARE COIL"
JC_BLOCK = "JC"                   # simbol cadangan kalau template tak punya CLOSURE
CLOSURE_BLOCK = "CLOSURE"         # template: bowtie + garis + kotak info
SLACK_BLOCK = "SLACK"             # template: coil + garis + tulisan
CLOSURE_INFO = "CLOSURE INFO"     # dibuat script: kotak info ber-ATRIBUT
SLACK_INFO = "SLACK INFO"         # dibuat script: tulisan slack, tanpa atribut

RULES = [
    dict(folder="JOINT CLOSURE", geom="point", layer=LAYER_JC,
         block=CLOSURE_BLOCK, jc=True),

    dict(folder="EXISTING POLE EMR 7-2.5", geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 7-3",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 7-4",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 7-5",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 9-4",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    dict(folder="EXISTING POLE EMR 9-5",   geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_MR"),
    # Tiang partner digambar, tapi TIDAK ikut baris 'TOTAL POLE EXISTING MR'.
    dict(folder="EXISTING POLE PARTNER 7-4", geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_PARTNER"),
    dict(folder="EXISTING POLE PARTNER 9-4", geom="point", layer="Ext Pole MR", block="EXT MR", text=True, pole="EXISTING_PARTNER"),

    dict(folder="NEW POLE 7-2.5", geom="point", layer="NEW POLE 7m 2.5'",      block="NP 7 2.5", text=True, pole="NEW_7_25"),
    dict(folder="NEW POLE 7-3",   geom="point", layer="NEW POLE HC",           block="NP 7 3",   text=True, pole="NEW_7_3"),
    dict(folder="NEW POLE 7-4",   geom="point", layer="NEW POLE 7m(4 inches)", block="NP 7 4",   text=True, pole="NEW_7_4"),
    # Tiang 5 inci belum punya layer, blok, maupun baris summary sendiri.
    # Digambar seperti 4 inci dan ikut baris 4 inci, tapi selalu diperingatkan.
    dict(folder="NEW POLE 7-5",   geom="point", layer="NEW POLE 7m(4 inches)", block="NP 7 4",   text=True, pole="NEW_7_5"),
    dict(folder="NEW POLE 9-4",   geom="point", layer="NEW POLE 9m(4 inches)", block="NP 9 4",   text=True, pole="NEW_9"),
    dict(folder="NEW POLE 9-5",   geom="point", layer="NEW POLE 9m(4 inches)", block="NP 9 4",   text=True, pole="NEW_9_5"),

    dict(folder="CABLE", geom="line", by_name="cable"),
    dict(folder="SLACK HANGER", geom="point", layer=LAYER_SLACK,
         block=SLACK_BLOCK, slack=True),
]

_RULES_SORTED = sorted(RULES, key=lambda r: -len(apd.norm(r["folder"])))
_RULES_EXACT = {apd.norm(r["folder"]): r for r in RULES}

POLE_TEXT_LAYER = "POLE ID"
POLE_TEXT_HEIGHT = 1.8
POLE_TEXT_OFFSET = (2.5, 2.5)
TEXT_STYLE = "Standard"

DEG = "°"

# Isi kotak info closure, baris demi baris: (label, tag atribut, prompt).
# Label None = atributnya menempati baris sendiri (isi splice bisa panjang).
CLOSURE_LINES = [
    ("Closure ID : ", "CLOSURE_ID", "Closure ID"),
    ("Coordinate : ", "KOORDINAT", "Coordinate"),
    ("Splice Configuration :", None, None),
    (None, "SPLICE", "Splice Configuration"),
]

# Gaya cadangan kalau blok CLOSURE / SLACK tidak ada di template. Angkanya
# diambil dari blok buatan drafter di TEMPLATE.dxf.
CLOSURE_DEFAULT = dict(
    box=(88.1, 28.3), pad=(2.1, 3.6), tinggi=3.19, style=TEXT_STYLE,
    warna_teks=7, layer_teks="0", jarak_baris=1.0, wipeout=True,
    gaya_kotak={"layer": LAYER_JC}, gaya_garis={"layer": LAYER_JC},
    arah=(26.5, 43.5), layer_insert=LAYER_JC)
SLACK_DEFAULT = dict(
    teks=[("FO A reserved", 1.3), ("20m here", -7.08)], garis=40.1,
    gaya_teks={"layer": LAYER_SLACK, "style": TEXT_STYLE, "height": 6.1,
               "width": 0.7},
    gaya_garis={"layer": LAYER_SLACK}, arah=(-26.65, 28.48),
    layer_insert=LAYER_SLACK)

# Penempatan kotak closure / tulisan slack
JARAK_AMAN = 1.0            # jarak bebas ke simbol, kabel, tulisan lain (m)
JARAK_JALAN = 1.5           # jarak bebas ke tepi jalan (m)
LEADER_MIN = 8.0            # garis penunjuk terpendek (m)
LEADER_MAX = 300.0          # terjauh yang dicari sebelum menyerah (m)
LEADER_STEP = 4.0
ARAH_STEP = 15.0            # derajat

EMPTY = apd.EMPTY_CELL


_BASICMAP = None


def basicmap(log=print):
    """Muat kml2basicmap.py: mesin jalan OSM dipakai ulang dari sana.

    File itu ada di folder lain ('SND KASAR/BASIC MAP'), jadi dicari, bukan
    ditulis mati -- sama seperti cara kml2dxf_full.py mencarinya."""
    global _BASICMAP
    if _BASICMAP is not None:
        return _BASICMAP
    try:                                  # di backend: paket 'engines'
        from engines import kml2basicmap as _bm
        _BASICMAP = _bm
        return _BASICMAP
    except ImportError:
        pass
    tries = [HERE / "kml2basicmap.py"]
    for base in [HERE, *list(HERE.parents)[:4]]:
        for pola in ("kml2basicmap.py", "*/kml2basicmap.py",
                     "*/*/kml2basicmap.py"):
            tries += sorted(base.glob(pola))
    for t in tries:
        if not t.is_file():
            continue
        spec = importlib.util.spec_from_file_location("kml2basicmap", t)
        m = importlib.util.module_from_spec(spec)
        sys.modules["kml2basicmap"] = m
        spec.loader.exec_module(m)
        _BASICMAP = m
        log(f"  mesin jalan : {t}")
        return m
    raise SystemExit(
        "kml2basicmap.py tidak ketemu, padahal itu yang menggambar jalan.\n"
        "Letakkan folder 'SND KASAR/BASIC MAP' seperti semula, atau jalankan "
        "dengan --no-roads kalau gambar SF-nya memang tanpa jalan.")


def gambar_jalan(msp, kml_path, out_path, lons, lats, tr, base, ensure_layer,
                 offline, road_half, road_text, stat, log):
    """Tepi jalan + nama jalan dari OpenStreetMap, seperti di basic map.

    Digambar PALING DULU supaya jadi alas: entitas yang masuk belakangan yang
    tampil di atas, jadi kabel dan simbol tidak tertutup garis jalan.

    Kembalikan daerah jalan (koridor + nama jalan) sebagai geometri shapely,
    dipakai supaya kotak closure dan tulisan slack tidak ditaruh di atasnya.
    None kalau tidak ada jalan."""
    bm = basicmap(log)
    pad = bm.BBOX_PAD_DEG
    els = bm.fetch_osm((min(lats) - pad, min(lons) - pad,
                        max(lats) + pad, max(lons) + pad),
                       kml_path.with_name(kml_path.stem + "_osm.json"),
                       offline, log)
    if not els:
        return None

    titik = [Point(*tr.transform(lon, lat)) for lon, lat in zip(lons, lats)]
    area = unary_union(titik).convex_hull.buffer(80.0)
    roads = bm.build_roads(els, tr.transform, area, log)
    if road_half is not None:
        for r in roads:
            r["half"] = road_half

    sidecar = out_path.with_name(out_path.stem + "_jalan.csv")
    bm.apply_name_sidecar(roads, sidecar, log)

    ensure_layer(LAYER_ROAD)
    n_edge, n_name = bm.draw_roads(msp, roads, LAYER_ROAD, LAYER_ROAD,
                                   road_text, log)
    stat[f"{LAYER_ROAD}  <- tepi jalan"] += n_edge
    stat[f"{LAYER_ROAD}  <- nama jalan"] += n_name

    to_ll = apd.Transformer.from_crs(tr.target_crs, "EPSG:4326",
                                     always_xy=True).transform
    bm.write_name_sidecar([r for r in roads if not r["virtual"]], sidecar,
                          to_ll, log)

    _, koridor = bm.road_edges(roads, log)
    bagian = [koridor] if koridor is not None else []
    for t in msp.query("MTEXT"):
        if t.dxf.layer != LAYER_ROAD:
            continue
        h = t.dxf.char_height
        cx, cy = t.dxf.insert.x, t.dxf.insert.y
        bagian.append(bm.text_rect(
            cx, cy, len(t.plain_text()) * bm.TEXT_WIDTH_FACTOR * h, h * 1.4,
            t.dxf.get("rotation", 0.0)))
    return unary_union(bagian) if bagian else None


def cable_layer_for(name: str, warn: list):
    """Layer kabel feeder dari nama kabelnya.

    Layer template hanya FO 24/36/48 CORE. Kabel HF/MF biasanya jauh lebih
    besar (96C, 144C, 288C ...); dulu kabel seperti itu DILEWATI sehingga
    rutenya hilang dari gambar. Sekarang digambar di layer 'FO <n> CORE'
    yang dibuat bila belum ada. (Tambahan versi web / KML to CAD.)
    """
    layer = apd.cable_layer_for(name)
    if layer:
        return layer
    m = re.search(r"\b(\d{2,3})\s*C(?:ORE)?\b", (name or "").upper())
    if m:
        layer = f"FO {int(m.group(1))} CORE"
        warn.append(f"kabel {int(m.group(1))} core tidak punya layer di template "
                    f"-> digambar di layer baru {layer!r}")
        return layer
    return None


def match_rule(leaf: str):
    key = apd.norm(leaf)
    if key in _RULES_EXACT:
        return _RULES_EXACT[key]
    for r in _RULES_SORTED:
        if apd.norm(r["folder"]) in key:
            return r
    return None


# --------------------------------------------------------------------------
# Nama kabel & closure
# --------------------------------------------------------------------------
def parse_cable(name: str):
    """'PBSM.047 -CABLE LINE A (FO 24C/2T) -AE- 914 m' -> ('A','FO 24C/2T',914).

    Kabel sub feeder sering ditulis 'CABLE SUBFEEDER (...)' tanpa huruf LINE;
    di gambar drafter tetap masuk baris LINE A, jadi None diperlakukan 'A'."""
    line, ctype, panjang = apd.parse_cable_name(name)
    return (line or "A"), ctype, panjang


def parse_closure(name: str):
    """'NEW JC 48C' -> (True, '48C'); 'EXT JC 144C' -> (False, '144C')."""
    up = (name or "").upper()
    baru = up.strip().startswith("NEW")
    m = re.search(r"(\d+)\s*C\b", up)
    return baru, (m.group(1) + "C" if m else None)


# --------------------------------------------------------------------------
# Simbol joint closure
# --------------------------------------------------------------------------
def ensure_jc_block(doc, lebar: float, log) -> str:
    """Simbol joint closure cadangan, dipakai kalau template tidak punya
    blok 'CLOSURE' (template lama).

    Bentuknya dua segitiga bertemu di ujung -- sama dengan LEGEND gambar SF.
    Warnanya BYLAYER, jadi ikut merah seperti layernya."""
    if JC_BLOCK in doc.blocks:
        return JC_BLOCK
    h = lebar / 2
    blk = doc.blocks.new(JC_BLOCK)
    atts = {"layer": "0", "color": apd.BYLAYER_COLOR}
    blk.add_solid([(-h, h), (-h, -h), (0.0, 0.0)], dxfattribs=atts)
    blk.add_solid([(h, h), (h, -h), (0.0, 0.0)], dxfattribs=atts)
    log(f"  blok '{CLOSURE_BLOCK}' tidak ada di template -> simbol "
        f"'{JC_BLOCK}' dibuatkan ({lebar:.1f} m, bentuk seperti di LEGEND)")
    return JC_BLOCK


# --------------------------------------------------------------------------
# Kotak info closure & tulisan slack
# --------------------------------------------------------------------------
def _gaya(e) -> dict:
    """Layer, warna, tebal dan jenis garis entitas template, untuk disalin.

    BYBLOCK diganti BYLAYER: di dalam blok artinya 'ikut INSERT-nya', padahal
    garis penunjuk sekarang berdiri sendiri di modelspace."""
    g = {"layer": e.dxf.layer}
    for k in ("color", "lineweight", "linetype"):
        if e.dxf.hasattr(k):
            g[k] = e.dxf.get(k)
    if g.get("color") == 0:
        g["color"] = apd.BYLAYER_COLOR
    if g.get("lineweight") == -2:
        g["lineweight"] = apd.BYLAYER_LW
    return g


def lebar_teks(doc, teks: str, style: str, tinggi: float,
               faktor: float = 1.0) -> float:
    """Lebar tulisan (m), diukur dari font TTF text style-nya."""
    try:
        from ezdxf.fonts import fonts
        font = doc.styles.get(style).dxf.font if style in doc.styles else ""
        return fonts.make_font(font or "arial.ttf", tinggi,
                               faktor).text_width(teks)
    except Exception:
        return len(teks) * 0.62 * tinggi * faktor


def layer_di_template(doc, nama: str):
    """Layer INSERT contoh blok `nama` di modelspace template -- itu layer
    pilihan drafter untuk blok tersebut."""
    for e in doc.modelspace().query("INSERT"):
        if e.dxf.name == nama:
            return e.dxf.layer
    return None


def baca_closure(doc) -> dict:
    """Ukuran dan gaya kotak info closure dari blok 'CLOSURE' template.

    Blok itu gabungan: bowtie + garis penunjuk + kotak (wipeout + garis tepi)
    + satu MTEXT 'Closure ID / Coordinate / Splice Configuration'. MTEXT-nya
    tulisan mati (kalau blok dipasang apa adanya, semua closure memuat
    koordinat yang sama) dan arah garisnya juga mati. Jadi yang diambil cuma
    ukuran dan gayanya: kotaknya dibuat ulang sebagai blok ber-ATRIBUT
    (buat_closure_info) dan garisnya digambar ulang ke tempat yang kosong.

    Dipanggil SEBELUM modelspace template dikosongkan."""
    g = dict(CLOSURE_DEFAULT)
    if CLOSURE_BLOCK not in doc.blocks:
        return g
    ents = list(doc.blocks.get(CLOSURE_BLOCK))
    pertama = lambda f: next((e for e in ents if f(e)), None)
    sym = pertama(lambda e: e.dxftype() == "INSERT")
    kotak = pertama(lambda e: e.dxftype() == "LWPOLYLINE" and e.closed)
    garis = pertama(lambda e: e.dxftype() == "LWPOLYLINE" and not e.closed)
    mt = pertama(lambda e: e.dxftype() == "MTEXT")
    g["wipeout"] = pertama(lambda e: e.dxftype() == "WIPEOUT") is not None

    if garis is not None:
        g["gaya_garis"] = _gaya(garis)
    if mt is not None:
        g["tinggi"] = mt.dxf.char_height
        g["style"] = mt.dxf.style
        g["layer_teks"] = mt.dxf.layer
        g["jarak_baris"] = mt.dxf.get("line_spacing_factor", 1.0)
        # warna MTEXT sering ditimpa kode \C di dalam teksnya
        m = re.search(r"\\C(\d+);", mt.text)
        g["warna_teks"] = int(m.group(1)) if m else mt.dxf.get("color", 256)
    if kotak is not None:
        xs, ys = zip(*((p[0], p[1]) for p in kotak.get_points()))
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        g["box"] = (x1 - x0, y1 - y0)
        g["gaya_kotak"] = _gaya(kotak)
        if mt is not None:
            g["pad"] = (mt.dxf.insert[0] - x0, y1 - mt.dxf.insert[1])
        if sym is not None:
            # tengah simbol -> sudut kotak terdekat = jarak & arah garis
            # penunjuk gaya drafter; posisi ini yang dicoba paling dulu
            sx, sy = sym.dxf.insert[0], sym.dxf.insert[1]
            cx, cy = min(((x0, y0), (x1, y0), (x0, y1), (x1, y1)),
                         key=lambda c: math.dist(c, (sx, sy)))
            g["arah"] = (cx - sx, cy - sy)
    g["layer_insert"] = (layer_di_template(doc, CLOSURE_BLOCK)
                         or g["gaya_kotak"]["layer"])
    return g


def baca_slack(doc) -> dict:
    """Gaya tulisan slack dari blok 'SLACK' template.

    Blok itu gabungan: 'FO A reserved' di atas garis bawah, '20m here' di
    bawahnya, satu polyline (garis bawah lalu miring ke coil) dan coil.
    Tulisannya selalu sama, jadi TANPA atribut. Yang diambil gaya dan jarak
    tegaknya saja: di template tulisannya miring 0,28 derajat dan tidak
    persis di tengah garis -- di sini dibuat tegak dan tepat di tengah.

    Dipanggil SEBELUM modelspace template dikosongkan."""
    g = dict(SLACK_DEFAULT)
    if SLACK_BLOCK not in doc.blocks:
        return g
    ents = list(doc.blocks.get(SLACK_BLOCK))
    coil = next((e for e in ents if e.dxftype() == "INSERT"), None)
    poly = next((e for e in ents if e.dxftype() == "LWPOLYLINE"), None)
    texts = [e for e in ents if e.dxftype() == "TEXT"]
    if poly is None or not texts:
        return g
    pts = [(p[0], p[1]) for p in poly.get_points()]
    ruas = [(a, b) for a, b in zip(pts, pts[1:]) if math.dist(a, b) > 1.0]
    if not ruas:
        return g
    # garis bawah = ruas yang paling mendatar
    a, b = sorted(min(ruas, key=lambda s: abs(s[1][1] - s[0][1])
                      / math.dist(*s)))
    my = (a[1] + b[1]) / 2

    def acuan(t):          # rata tengah/kanan: posisinya di align point
        return t.dxf.align_point if (t.dxf.halign or t.dxf.valign) \
            else t.dxf.insert

    texts.sort(key=lambda t: -acuan(t)[1])
    g["teks"] = [(t.dxf.text.strip(), acuan(t)[1] - my) for t in texts]
    t0 = texts[0]
    g["gaya_teks"] = {**_gaya(t0), "style": t0.dxf.style,
                      "height": t0.dxf.height,
                      "width": t0.dxf.get("width", 1.0)}
    g["garis"] = b[0] - a[0]
    g["gaya_garis"] = _gaya(poly)
    if coil is not None:
        c = (coil.dxf.insert[0], coil.dxf.insert[1])
        ujung = min((a, b), key=lambda u: math.dist(u, c))
        g["arah"] = (ujung[0] - c[0], ujung[1] - c[1])
    g["layer_insert"] = (layer_di_template(doc, SLACK_BLOCK)
                         or g["gaya_teks"]["layer"])
    return g


def _blok_baru(doc, nama: str):
    """Blok kosong `nama`. Kalau sudah ada (template bekas hasil), isinya
    dibuang dan diisi ulang -- INSERT yang ada tetap menunjuk ke sana."""
    if nama in doc.blocks:
        blk = doc.blocks.get(nama)
        blk.delete_all_entities()
        return blk
    return doc.blocks.new(nama)


def buat_closure_info(doc, g: dict, semua_isi: list) -> dict:
    """Blok kotak info closure ber-ATRIBUT, base point di tengah kotak.

    Label ('Closure ID :' dst.) TEXT biasa, isinya ATRIBUT CLOSURE_ID,
    KOORDINAT dan SPLICE: di AutoCAD klik dua kali kotaknya untuk mengubah
    isinya. Lebar kotak mengikuti template, dilebarkan kalau ada isi yang
    lebih panjang. Kembalikan dict(rect, attach) relatif base point."""
    h, style = g["tinggi"], g["style"]
    ukur = lambda s: lebar_teks(doc, s, style, h) if s else 0.0
    px, pt = g["pad"]
    pitch = h * 5 / 3 * g["jarak_baris"]          # jarak baris MTEXT AutoCAD

    lebar = 0.0
    for label, tag, _ in CLOSURE_LINES:
        isi = max((ukur(v.get(tag, "")) for v in semua_isi),
                  default=0.0) if tag else 0.0
        lebar = max(lebar, ukur(label) + isi)
    w = max(g["box"][0], lebar + 2 * px)
    h_kotak = max(g["box"][1],
                  pt + (len(CLOSURE_LINES) - 1) * pitch + 1.3 * h + px)
    x0, y0, x1, y1 = -w / 2, -h_kotak / 2, w / 2, h_kotak / 2
    sudut = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    blk = _blok_baru(doc, CLOSURE_INFO)
    if g["wipeout"]:
        blk.add_wipeout(sudut, dxfattribs={"layer": "0"})
    blk.add_lwpolyline(sudut, close=True, dxfattribs=g["gaya_kotak"])
    teks = {"layer": g["layer_teks"], "style": style, "height": h,
            "color": g["warna_teks"]}
    y = y1 - pt - h                              # garis dasar baris pertama
    for label, tag, prompt in CLOSURE_LINES:
        x = x0 + px
        if label:
            blk.add_text(label, dxfattribs={**teks, "insert": (x, y)})
            x += ukur(label)
        if tag:
            blk.add_attdef(tag, insert=(x, y), text="-",
                           dxfattribs={**teks, "prompt": prompt})
        y -= pitch
    return dict(rect=(x0, y0, x1, y1), attach=sudut)


def buat_slack_info(doc, g: dict) -> dict:
    """Blok tulisan slack tanpa atribut, base point di tengah garis bawah.

    Tulisan selalu tegak (rotasi 0) dan tepat di tengah garis bawah.
    Kembalikan dict(rect, attach) relatif base point; titik sambung garis
    penunjuk = kedua ujung garis bawah."""
    gt = g["gaya_teks"]
    panjang = g["garis"]
    blk = _blok_baru(doc, SLACK_INFO)
    blk.add_lwpolyline([(-panjang / 2, 0.0), (panjang / 2, 0.0)],
                       dxfattribs=g["gaya_garis"])
    lebar = panjang
    for s, dy in g["teks"]:
        t = blk.add_text(s, dxfattribs={**gt, "rotation": 0.0})
        t.set_placement((0.0, dy), align=TextEntityAlignment.CENTER)
        lebar = max(lebar, lebar_teks(doc, s, gt.get("style", TEXT_STYLE),
                                      gt["height"], gt.get("width", 1.0)))
    dys = [dy for _, dy in g["teks"]]
    rect = (-lebar / 2, min(dys) - 0.3 * gt["height"],
            lebar / 2, max(dys) + 1.1 * gt["height"])
    return dict(rect=rect, attach=[(-panjang / 2, 0.0), (panjang / 2, 0.0)])


def tepi_simbol(pusat, ukuran, tuju):
    """Titik di tepi kotak simbol ke arah `tuju`: garis penunjuk mulai dari
    sini, bukan dari tengah simbol."""
    x, y = pusat
    w, h = ukuran
    dx, dy = tuju[0] - x, tuju[1] - y
    t = min((w / 2) / abs(dx) if dx else 9e9,
            (h / 2) / abs(dy) if dy else 9e9, 0.9)
    return (x + dx * t, y + dy * t)


def urutan_jarak(awal: float) -> list:
    """Panjang garis penunjuk yang dicoba: mulai dari panjang di template,
    lalu bergantian sedikit lebih pendek / lebih panjang."""
    awal = min(max(awal, LEADER_MIN), LEADER_MAX)
    out, k = [awal], 1
    while True:
        lo, hi = awal - k * LEADER_STEP, awal + k * LEADER_STEP
        if lo < LEADER_MIN and hi > LEADER_MAX:
            return out
        if lo >= LEADER_MIN:
            out.append(lo)
        if hi <= LEADER_MAX:
            out.append(hi)
        k += 1


def tempatkan(nodes, simbol, teks_tiang, kabel, jalan, log) -> list:
    """Cari tempat kotak closure / tulisan slack.

    nodes      : list dict(nama, point, sym=(w,h), rect=(x0,y0,x1,y1) dan
                 attach=[(x,y), ..] relatif base point blok, arah=(dx,dy)
                 garis penunjuk di template)
    simbol     : kotak shapely semua simbol (tiang, closure, coil)
    teks_tiang : kotak shapely ID tiang
    kabel      : list LineString kabel
    jalan      : daerah jalan (koridor + nama jalan), atau None

    Syarat mutlak di semua tingkat:
      - kotak/tulisan TIDAK di atas jalan
      - tidak menimpa simbol, ID tiang, kotak lain, atau garis penunjuk lain
      - garis penunjuk tidak menembus kotak lain, garis lain, simbol lain
    Tingkat 1 juga: kotak tidak menimpa kabel dan garis tidak memotong ID
    tiang. Kotak closure ber-wipeout MENUTUPI apa pun di bawahnya, jadi ini
    dicari sampai jauh dulu sebelum dilonggarkan di tingkat 2.

    Urutan coba: panjang & arah seperti template dulu, lalu makin jauh dari
    itu -- hasilnya semirip mungkin dengan gambar drafter.
    Kembalikan list dict(base, leader, tier) sejajar dengan `nodes`;
    tier 0 = buntu, dipasang di posisi template apa adanya."""
    jalan_p = None
    if jalan is not None and not jalan.is_empty:
        from shapely.prepared import prep
        jalan_p = prep(jalan)
    kabel_p = None
    if kabel:
        from shapely.prepared import prep
        kabel_p = prep(unary_union(kabel))
    pohon_sym = STRtree(simbol) if simbol else None
    pohon_teks = STRtree(teks_tiang) if teks_tiang else None
    kena = lambda pohon, g: (pohon is not None
                             and len(pohon.query(g, predicate="intersects")) > 0)

    n = int(round(180 / ARAH_STEP))
    geser = [0.0] + [s * k * ARAH_STEP for k in range(1, n)
                     for s in (1, -1)] + [180.0]

    kotak_ada, garis_ada, hasil = [], [], []
    for nd in nodes:
        x, y = nd["point"]
        sw, sh = nd["sym"]
        # simbol di titik yang sama (closure/slack menggantung di tiang)
        # boleh dilewati garis penunjuknya sendiri
        sendiri = box(x - sw / 2, y - sh / 2, x + sw / 2, y + sh / 2)
        milik = (set(pohon_sym.query(sendiri, predicate="intersects").tolist())
                 if pohon_sym is not None else set())
        rx0, ry0, rx1, ry1 = nd["rect"]
        rcx, rcy = (rx0 + rx1) / 2, (ry0 + ry1) / 2
        a0 = math.atan2(nd["arah"][1], nd["arah"][0])

        def calon(panjang, a):
            ux, uy = math.cos(a), math.sin(a)
            ax, ay = x + panjang * ux, y + panjang * uy      # titik sambung
            # sudut kotak / ujung garis bawah yang paling menghadap simbol
            px, py = min(nd["attach"], key=lambda q: (q[0] - rcx) * ux
                         + (q[1] - rcy) * uy)
            bx, by = ax - px, ay - py                         # base point
            lead = LineString([tepi_simbol((x, y), (sw, sh), (ax, ay)),
                               (ax, ay)])
            return (bx, by), lead, (bx + rx0, by + ry0, bx + rx1, by + ry1)

        def lolos(r, lead, tier):
            if jalan_p is not None and jalan_p.intersects(box(
                    r[0] - JARAK_JALAN, r[1] - JARAK_JALAN,
                    r[2] + JARAK_JALAN, r[3] + JARAK_JALAN)):
                return False
            rb = box(r[0] - JARAK_AMAN, r[1] - JARAK_AMAN,
                     r[2] + JARAK_AMAN, r[3] + JARAK_AMAN)
            if kena(pohon_sym, rb) or kena(pohon_teks, rb):
                return False
            if any(rb.intersects(q) for q in kotak_ada + garis_ada):
                return False
            if any(lead.intersects(q) for q in kotak_ada + garis_ada):
                return False
            if pohon_sym is not None and any(
                    i not in milik
                    for i in pohon_sym.query(lead, predicate="intersects")):
                return False
            if tier == 1:
                if kabel_p is not None and kabel_p.intersects(rb):
                    return False
                if kena(pohon_teks, lead):
                    return False
            return True

        pilih, tier = None, 0
        for t in (1, 2):
            for panjang in urutan_jarak(math.hypot(*nd["arah"])):
                for g in geser:
                    base, lead, r = calon(panjang, a0 + math.radians(g))
                    if lolos(r, lead, t):
                        pilih, tier = (base, lead, r), t
                        break
                if pilih:
                    break
            if pilih:
                break
        if pilih is None:
            pilih = calon(math.hypot(*nd["arah"]), a0)
            log.append(f"!! {nd['nama']!r}: tidak ada tempat kosong dalam "
                       f"{LEADER_MAX:.0f} m -> dipasang di posisi template, "
                       f"PERIKSA MANUAL")
        base, lead, r = pilih
        kotak_ada.append(box(*r))
        garis_ada.append(lead)
        hasil.append(dict(base=base, leader=list(lead.coords), tier=tier))

    tiers = Counter(h["tier"] for h in hasil)
    log.append(f"kotak closure / tulisan slack: {tiers.get(1, 0)} di tempat "
               f"bebas jalan & kabel, {tiers.get(2, 0)} bebas jalan tapi "
               f"menimpa kabel, {tiers.get(0, 0)} buntu")
    lens = [LineString(h["leader"]).length for h in hasil]
    if lens:
        log.append(f"panjang garis penunjuk: {min(lens):.0f} - "
                   f"{max(lens):.0f} m")
    return hasil


# --------------------------------------------------------------------------
# Konversi
# --------------------------------------------------------------------------
def convert(kml_path: Path, template: Path, out_path: Path, epsg=None,
            keep_template=False, dry_run=False, fill_summary=True,
            reset_summary=True, homepass=None, hub=None, no_roads=False,
            offline=False, road_half=None, road_text=None, doc=None,
            save=True, log=print):
    kml_path = Path(kml_path)
    out_path = Path(out_path)

    kml = apd.Kml(apd.read_kml_bytes(kml_path))
    pms = kml.placemarks()
    if not pms:
        raise SystemExit("Tidak ada Placemark di file ini.")

    lons, lats = [], []
    for _, _, pm in pms:
        for c in pm.iter(kml.q("coordinates")):
            for lon, lat in apd.Kml.parse_coords(c.text):
                lons.append(lon)
                lats.append(lat)
    if not lons:
        raise SystemExit("Tidak ada koordinat yang terbaca.")
    code = epsg or apd.pick_epsg((min(lons) + max(lons)) / 2,
                                 (min(lats) + max(lats)) / 2)
    tr = apd.Transformer.from_crs("EPSG:4326", f"EPSG:{code}", always_xy=True)
    xy = lambda lon, lat: tr.transform(lon, lat)

    project = apd.clean_project_name(kml.doc_name() or kml_path.name)

    log(f"File      : {kml_path.name}")
    log(f"Proyek    : {project}")
    log(f"Placemark : {len(pms)}")
    log(f"Proyeksi  : EPSG:4326 -> EPSG:{code}"
        f"{' (auto)' if epsg is None else ' (manual)'}")

    # --- baca isi KMZ ------------------------------------------------------
    poles = Counter()
    plan, cables, closures, slacks = [], [], [], []
    skipped = Counter()
    warn, stat = [], Counter()

    for path, name, pm in pms:
        leaf = path[-1] if path else ""
        rule = match_rule(leaf)
        if rule is None:
            skipped["/".join(path[1:]) or "(root)"] += 1
            continue
        plan.append((rule, name, pm))
        if rule.get("pole"):
            poles[rule["pole"]] += sum(1 for _ in kml.points(pm))
        if rule.get("jc"):
            for lon, lat in kml.points(pm):
                baru, cap = parse_closure(name)
                closures.append(dict(name=name, lonlat=(lon, lat), baru=baru,
                                     cap=cap))
        if rule.get("slack"):
            for lon, lat in kml.points(pm):
                slacks.append(dict(name=name, lonlat=(lon, lat)))
        if rule.get("by_name") == "cable":
            for pts in kml.lines(pm):
                line, ctype, panjang = parse_cable(name)
                cables.append(dict(name=name, line=line, ctype=ctype,
                                   panjang=panjang, pts=pts))

    n_pole = sum(poles.values())
    log(f"Tiang     : {n_pole}"
        + (f"  ({poles['EXISTING_MR']} existing MR, "
           f"{n_pole - poles['EXISTING_MR'] - poles['EXISTING_PARTNER']} baru)"
           if n_pole else ""))
    for c in cables:
        log(f"Kabel     : LINE {c['line']} ({c['ctype']}) "
            f"{c['panjang'] if c['panjang'] is not None else '?'} m  <- {c['name']!r}")
    for c in closures:
        log(f"Closure   : {c['name']!r} -> {'BARU' if c['baru'] else 'EXISTING'}"
            f", kapasitas {c['cap'] or '?'}")
    if slacks:
        log(f"Slack     : {len(slacks)} titik")
    if poles.get("NEW_7_5") or poles.get("NEW_9_5"):
        warn.append(f"tiang 5 inci ({poles.get('NEW_7_5', 0)} x 7-5, "
                    f"{poles.get('NEW_9_5', 0)} x 9-5) tidak punya layer, blok, "
                    f"maupun baris summary sendiri -> digambar dan dihitung "
                    f"seperti tiang 4 inci")

    if not closures:
        warn.append("tidak ada JOINT CLOSURE di KMZ -> baris summary dan "
                    "koordinat kop dibiarkan")

    # 'warn' ikut dikembalikan (daftar yang sama, terus terisi sampai akhir)
    # supaya pemanggil backend bisa menampilkannya sebagai peringatan.
    laporan = dict(project=project, epsg=code, poles=dict(poles),
                   n_pole=n_pole, cables=cables, closures=closures,
                   slack=len(slacks), label_cable=n_pole, out=out_path,
                   warn=warn)

    if dry_run:
        log("\n=== DRY RUN - tidak ada file ditulis ===")
        _laporan(laporan, stat, skipped, warn, homepass, log)
        return laporan

    # --- siapkan dokumen ---------------------------------------------------
    if doc is None:
        if not Path(template).exists():
            raise SystemExit(f"Template tidak ditemukan: {template}")
        doc = ezdxf.readfile(str(template))
    msp = doc.modelspace()
    doc.header["$INSUNITS"] = 6

    # Gaya kotak closure & tulisan slack dibaca sebelum modelspace dikosongkan:
    # layer INSERT contoh CLOSURE/SLACK di modelspace template ikut dipakai.
    gaya = {"jc": baca_closure(doc), "slack": baca_slack(doc)}
    nama_info = {"jc": CLOSURE_INFO, "slack": SLACK_INFO}

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
        return {"layer": layer, "color": apd.BYLAYER_COLOR,
                "lineweight": apd.BYLAYER_LW}

    # Isi blok di template digambar jauh dari base point-nya sendiri; tanpa
    # dinormalkan, simbol muncul belasan kilometer dari titik yang benar.
    parts = {}
    for rule, *_ in plan:
        bn = rule.get("block")
        if bn and bn in blocks and bn not in parts:
            info = apd.symbol_parts(doc, bn)
            if info:
                parts[bn] = info
                apd.center_base_point(doc, info["block"])

    satuan = 4.0
    if "EXT MR" in parts:
        satuan = max(parts["EXT MR"]["size"][0], 1.0) * 1.4
    ensure_layer(LAYER_JC)
    ensure_layer(LAYER_SLACK)
    if closures and CLOSURE_BLOCK not in parts:
        ensure_jc_block(doc, satuan, log)
        info = apd.symbol_parts(doc, JC_BLOCK)
        if info:
            parts[CLOSURE_BLOCK] = info
    for g in gaya.values():
        for nm in (g["layer_insert"], g["gaya_garis"]["layer"],
                   g.get("layer_teks"), g.get("gaya_kotak", {}).get("layer"),
                   g.get("gaya_teks", {}).get("layer")):
            ensure_layer(nm)

    # --- jalan dulu, baru isinya -------------------------------------------
    jalan = None
    if not no_roads:
        jalan = gambar_jalan(msp, kml_path, out_path, lons, lats, tr, base,
                             ensure_layer, offline,
                             road_half, road_text or 2.21, stat, log)

    # --- gambar ------------------------------------------------------------
    catatan = []          # kotak closure / tulisan slack, dicarikan tempat
    simbol, teks_tiang, kabel = [], [], []     # rintangan untuk catatan
    for rule, name, pm in plan:
        layer = rule.get("layer")
        if rule.get("by_name") == "cable":
            layer = cable_layer_for(name, warn)
            if layer is None:
                warn.append(f"jenis core tidak dikenali, kabel dilewati: {name!r}")
                stat["!! kabel tak dikenali"] += 1
                continue
        ensure_layer(layer)

        if rule["geom"] == "line":
            for pts in kml.lines(pm):
                garis = [xy(*p) for p in pts]
                msp.add_lwpolyline(garis, format="xy", dxfattribs=base(layer))
                stat[f"{layer}  <- LWPOLYLINE"] += 1
                if len(garis) >= 2:
                    kabel.append(LineString(garis))
            continue

        blk = rule.get("block")
        info = parts.get(blk)
        for lon, lat in kml.points(pm):
            p = xy(lon, lat)
            if info:
                sc = info["scale"]
                msp.add_blockref(info["block"], p, dxfattribs={
                    **base(layer), "xscale": sc, "yscale": sc, "zscale": sc})
                stat[f"{layer}  <- blok '{info['block']}'"] += 1
            elif rule.get("slack"):
                warn.append(f"blok '{blk}' tidak ada di template -> slack "
                            f"digambar tanpa simbol coil")
            else:
                if blk:
                    warn.append(f"blok '{blk}' tidak ada di template "
                                f"-> digambar sebagai POINT")
                msp.add_point(p, dxfattribs=base(layer))
                stat[f"{layer}  <- POINT"] += 1

            sym = ((info["size"][0] * info["scale"],
                    info["size"][1] * info["scale"]) if info
                   else (1.0, 1.0) if rule.get("slack") else (4.0, 4.0))
            simbol.append(box(p[0] - sym[0] / 2, p[1] - sym[1] / 2,
                              p[0] + sym[0] / 2, p[1] + sym[1] / 2))

            if rule.get("text") and name:
                ensure_layer(POLE_TEXT_LAYER)
                t = msp.add_mtext(name, dxfattribs={
                    **base(POLE_TEXT_LAYER), "style": TEXT_STYLE,
                    "char_height": POLE_TEXT_HEIGHT})
                tx = p[0] + POLE_TEXT_OFFSET[0]
                ty = p[1] + POLE_TEXT_OFFSET[1]
                t.set_location((tx, ty),
                               attachment_point=dxfconst.MTEXT_BOTTOM_LEFT)
                stat[f"{POLE_TEXT_LAYER}  <- MTEXT"] += 1
                teks_tiang.append(box(
                    tx, ty, tx + lebar_teks(doc, name, TEXT_STYLE,
                                            POLE_TEXT_HEIGHT),
                    ty + POLE_TEXT_HEIGHT * 1.3))

            if rule.get("jc"):
                # Yang diisi script hanya koordinat; Closure ID dan splice
                # dibiarkan '-' untuk diisi drafter lewat edit atribut.
                catatan.append(dict(jenis="jc", nama=name, point=p, sym=sym,
                                    isi={"CLOSURE_ID": "-",
                                         "KOORDINAT": f"{lat:.6f}{DEG}, "
                                                      f"{lon:.6f}{DEG}",
                                         "SPLICE": "-"}))
            if rule.get("slack"):
                catatan.append(dict(jenis="slack", nama=name, point=p, sym=sym))

    # --- kotak closure & tulisan slack: di luar jalan -----------------------
    # Dipasang paling akhir supaya tampil di atas; wipeout kotak closure
    # menutupi apa pun di bawahnya, karena itu tempatnya dicari yang kosong.
    place_log = []
    if catatan:
        bentuk = {}
        isi_jc = [c["isi"] for c in catatan if c["jenis"] == "jc"]
        if isi_jc:
            bentuk["jc"] = buat_closure_info(doc, gaya["jc"], isi_jc)
        if any(c["jenis"] == "slack" for c in catatan):
            bentuk["slack"] = buat_slack_info(doc, gaya["slack"])
        for c in catatan:
            c.update(bentuk[c["jenis"]], arah=gaya[c["jenis"]]["arah"])
        # kotak closure paling besar -> dicarikan tempat duluan
        catatan.sort(key=lambda c: c["jenis"] != "jc")
        spots = tempatkan(catatan, simbol, teks_tiang, kabel, jalan, place_log)
        for c, spot in zip(catatan, spots):
            g = gaya[c["jenis"]]
            ref = msp.add_blockref(nama_info[c["jenis"]], spot["base"],
                                   dxfattribs={"layer": g["layer_insert"]})
            if c["jenis"] == "jc":
                ref.add_auto_attribs(c["isi"])
                for a in ref.attribs:          # ikut layer kotaknya
                    a.dxf.layer = g["layer_insert"]
            msp.add_lwpolyline(spot["leader"], format="xy",
                               dxfattribs=g["gaya_garis"])
            stat[f"{g['layer_insert']}  <- blok '{nama_info[c['jenis']]}'"
                 f" + garis"] += 1

    # --- layout & DESIGN SUMMARY -------------------------------------------
    summary_log = []
    apd.sync_layout_count(doc, 1, summary_log)          # SF selalu 1 lembar

    if fill_summary:
        for loname in sorted(n for n in doc.layout_names() if n != "Model"):
            lo = doc.layouts.get(loname)
            _isi_summary(lo, loname, project, poles, cables, closures,
                         n_pole, homepass, hub, reset_summary,
                         summary_log, warn)

    if save:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        doc.saveas(str(out_path))

    _laporan(laporan, stat, skipped, warn, homepass, log,
             place_log=place_log, summary_log=summary_log)
    if save:
        log(f"\nTersimpan: {out_path}")
    return laporan


def _isi_summary(lo, loname, project, poles, cables, closures, n_pole,
                 homepass, hub, reset_summary, summary_log, warn):
    """Isi kop dan tabel DESIGN SUMMARY di satu layout."""
    old = apd.current_project_name(lo)
    if old:
        n = apd.replace_project_name(lo, old, project)
        summary_log.append(f"[{loname}] nama proyek: {old!r} -> {project!r} "
                           f"({n} teks)")

    # koordinat acuan di kop: joint closure, kalau tidak ada tiang pertama
    ref = None
    if closures:
        ref = closures[0]["lonlat"]
    if ref and apd.set_coord_cell(lo, apd.fmt_coord(*ref)):
        summary_log.append(f"[{loname}] koordinat closure: "
                           f"{apd.fmt_coord(*ref).strip()}")
    elif ref:
        warn.append(f"[{loname}] sel koordinat tidak ketemu di kop")

    if hub:
        for s in _isi_hub(lo, hub):
            summary_log.append(f"[{loname}] {s}")
    else:
        for s in apd.blank_hub_cells(lo):
            summary_log.append(f"[{loname}] {s}")

    tbl = apd.SummaryTable(lo)
    terisi = []

    for c in sorted(cables, key=lambda c: c["line"]):
        lbl = f"- LINE {c['line']}" + (f" ({c['ctype']})" if c["ctype"] else "")
        nilai = int(round(c["panjang"])) if c["panjang"] is not None else EMPTY
        if tbl.set_row(lambda t, L=c["line"]:
                       t.strip().upper().startswith(f"- LINE {L}"), nilai,
                       relabel=lbl):
            terisi.append(f"{lbl} = {nilai}")

    jc_baru = sum(1 for c in closures if c["baru"])
    cap = next((c["cap"] for c in closures if c["cap"]), None)

    # Baris yang nol ditulis titik-titik, bukan angka 0 -- mengikuti gambar
    # drafter: yang tidak dipakai dibiarkan kosong.
    isi = lambda n: n if n else EMPTY

    baris = [
        ("TOTAL POLE EXISTING MR",
         lambda t: t.strip().upper().startswith("TOTAL POLE EXISTING MR"),
         isi(poles["EXISTING_MR"]), None),
        ('TOTAL NEW 7M POLE 2.5"',
         lambda t: '2.5"' in t and "7M POLE" in t.upper(),
         isi(poles["NEW_7_25"]), None),
        ('TOTAL NEW 7M POLE 3"',
         lambda t: '3"' in t and "7M POLE" in t.upper(),
         isi(poles["NEW_7_3"]), None),
        ('TOTAL NEW 7M POLE 4"',
         lambda t: '4"' in t and "7M POLE" in t.upper(),
         isi(poles["NEW_7_4"] + poles["NEW_7_5"]), None),
        ("TOTAL NEW 9M POLE",
         lambda t: t.strip().upper().startswith("TOTAL NEW 9M POLE"),
         isi(poles["NEW_9"] + poles["NEW_9_5"]), None),
        ("TOTAL LABEL CABLE",
         lambda t: t.strip().upper().startswith("TOTAL LABEL CABLE"),
         isi(n_pole), None),
    ]
    if homepass is not None:
        baris.append(("TOTAL HOMEPASS",
                      lambda t: t.strip().upper().startswith("TOTAL HOMEPASS"),
                      homepass, None))

    if closures:
        if set_jc_row(tbl, cap, jc_baru if jc_baru else EMPTY):
            terisi.append(f"TOTAL JOINT CLOSURE {cap or ''} = "
                          f"{jc_baru if jc_baru else EMPTY}")
        else:
            warn.append(f"[{loname}] baris 'TOTAL JOINT CLOSURE' tidak ketemu "
                        f"di summary")

    for judul, pred, nilai, relabel in baris:
        if tbl.set_row(pred, nilai, relabel=relabel):
            terisi.append(f"{relabel or judul} = {nilai}")
        else:
            warn.append(f"[{loname}] baris {judul!r} tidak ketemu di summary")

    for t in terisi:
        summary_log.append(f"[{loname}] {t}")

    if reset_summary:
        for c in tbl.reset_untouched():
            summary_log.append(f"[{loname}] dikosongkan: {c}")


def set_jc_row(tbl, cap, nilai) -> bool:
    """Isi baris 'TOTAL JOINT CLOSURE <kapasitas>'.

    Di template baris ini SATU teks gabungan:
        'TOTAL JOINT CLOSURE 48C : ....    units'
    jadi tidak bisa memakai relabel biasa (relabel menimpa seluruh teks,
    ikut membuang bagian ': .... units'). Yang diganti cukup dua potong:
    angka kapasitasnya, lalu nilai sesudah titik dua."""
    lab = tbl._label(lambda t: t.strip().upper().startswith("TOTAL JOINT CLOSURE"))
    if lab is None:
        return False
    tbl.touched.add(id(lab))
    teks = apd.cell_text(lab)
    if cap:
        teks = re.sub(r"(TOTAL\s+JOINT\s+CLOSURE\s*)\d*\s*C",
                      lambda m: m.group(1) + cap, teks, count=1, flags=re.I)

    vc = tbl.value_cell(lab)
    if vc is not None:                       # nilainya sel terpisah
        apd.set_cell(lab, teks)
        apd.set_cell(vc, str(nilai))
        tbl.touched.add(id(vc))
        return True

    apd.set_cell(lab, re.sub(r"(:\s*)([\d.,]+)",
                             lambda m: m.group(1) + str(nilai), teks, count=1))
    return True


def _isi_hub(lo, hub):
    """Isi 'Nama Rencana Hub' dan 'Nama Rencana OLT' di kop dengan nama STO."""
    done = []
    for s in apd.blank_hub_cells(lo, value=hub):
        done.append(s)
    return done


def _laporan(rep, stat, skipped, warn, homepass, log, place_log=None,
             summary_log=None):
    if stat:
        log("\n=== OBJEK DIGAMBAR (per layer DXF) ===")
        for k, v in sorted(stat.items()):
            log(f"  {k:<46} {v:>4}")
        log(f"  {'TOTAL':<46} {sum(stat.values()):>4}")

    log("\n=== HITUNGAN DESIGN SUMMARY ===")
    p = rep["poles"]
    for c in rep["cables"]:
        log(f"  LINE {c['line']} ({c['ctype']}) : "
            f"{c['panjang'] if c['panjang'] is not None else '?'} m")
    log(f"  Tiang existing MR {p.get('EXISTING_MR', 0)} | "
        f"7m2.5\" {p.get('NEW_7_25', 0)} | 7m3\" {p.get('NEW_7_3', 0)} | "
        f"7m4\" {p.get('NEW_7_4', 0)} | 9m {p.get('NEW_9', 0)}")
    if p.get("EXISTING_PARTNER"):
        log(f"  Tiang PARTNER {p['EXISTING_PARTNER']} "
            f"(digambar, tidak masuk baris MR)")
    for c in rep["closures"]:
        log(f"  Joint closure {c['cap'] or '?'} "
            f"({'baru, dihitung' if c['baru'] else 'existing, tidak dihitung'})")
    log(f"  Label cable {rep['label_cable']} (satu per tiang) | "
        f"slack {rep['slack']}")
    hp = homepass if homepass is not None else "tidak diisi (tidak ada di KMZ SF)"
    log(f"  Homepass    {hp}")

    if place_log:
        log("\n=== PENEMPATAN KETERANGAN ===")
        for s in place_log:
            log("  " + s)
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
            log("  - " + w)


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Konversi KML/KMZ sub feeder (SF) ke DXF AutoCAD.")
    ap.add_argument("input", type=Path, help="file .kml atau .kmz")
    ap.add_argument("-o", "--output", type=Path, help="file .dxf keluaran")
    ap.add_argument("-t", "--template", type=Path,
                    default=HERE / TEMPLATE_DEFAULT,
                    help="template DXF (default: %(default)s)")
    ap.add_argument("--epsg", type=int, help="paksa EPSG tujuan, mis. 32749")
    ap.add_argument("--homepass", type=int,
                    help="isi baris TOTAL HOMEPASS (tidak ada di KMZ SF)")
    ap.add_argument("--hub", help="isi Nama Rencana Hub / OLT di kop, mis. GEBANG")
    ap.add_argument("--no-roads", action="store_true",
                    help="jangan gambar jalan dari OpenStreetMap")
    ap.add_argument("--offline", action="store_true",
                    help="jangan query Overpass, pakai cache saja")
    ap.add_argument("--road-half", type=float,
                    help="setengah lebar jalan, meter (default per kelas OSM)")
    ap.add_argument("--road-text", type=float, default=2.21,
                    help="tinggi teks nama jalan (default %(default)s)")
    ap.add_argument("--keep-template", action="store_true",
                    help="jangan hapus geometri bawaan template")
    ap.add_argument("--no-summary", action="store_true",
                    help="jangan sentuh tabel DESIGN SUMMARY")
    ap.add_argument("--keep-old-summary", action="store_true",
                    help="biarkan angka proyek lama di baris yang tidak diisi")
    ap.add_argument("--dry-run", action="store_true",
                    help="hitung dan laporkan saja, tidak menulis file")
    a = ap.parse_args()

    if not a.input.exists():
        raise SystemExit(f"Input tidak ditemukan: {a.input}")
    out = a.output or a.input.with_name(a.input.stem + "_SF.dxf")
    convert(a.input, a.template, out, epsg=a.epsg,
            keep_template=a.keep_template, dry_run=a.dry_run,
            fill_summary=not a.no_summary,
            reset_summary=not a.keep_old_summary,
            homepass=a.homepass, hub=a.hub, no_roads=a.no_roads,
            offline=a.offline, road_half=a.road_half, road_text=a.road_text)


if __name__ == "__main__":
    main()
