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
  * joint closure  -> INSERT blok 'JC' + keterangan, layer 'FIBER OPTIC CLOSURE'
  * slack hanger   -> keterangan 'FO A reserved 20m here', layer 'FIBER SPARE COIL'

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
from ezdxf.lldxf import const as dxfconst
from shapely.geometry import Point
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
JC_BLOCK = "JC"

RULES = [
    dict(folder="JOINT CLOSURE", geom="point", layer=LAYER_JC, block=JC_BLOCK,
         jc=True),

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
    dict(folder="SLACK HANGER", geom="point", layer=LAYER_SLACK, slack=True),
]

_RULES_SORTED = sorted(RULES, key=lambda r: -len(apd.norm(r["folder"])))
_RULES_EXACT = {apd.norm(r["folder"]): r for r in RULES}

POLE_TEXT_LAYER = "POLE ID"
POLE_TEXT_HEIGHT = 1.8
POLE_TEXT_OFFSET = (2.5, 2.5)
TEXT_STYLE = "Standard"

JC_TEXT_HEIGHT = 4.0
SLACK_TEXT_HEIGHT = 2.5
SLACK_NOTE = "FO A reserved\\P20m here"      # \P = ganti baris di MTEXT
LEADER_LANDING = 6.0

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
    tampil di atas, jadi kabel dan simbol tidak tertutup garis jalan."""
    bm = basicmap(log)
    pad = bm.BBOX_PAD_DEG
    els = bm.fetch_osm((min(lats) - pad, min(lons) - pad,
                        max(lats) + pad, max(lons) + pad),
                       kml_path.with_name(kml_path.stem + "_osm.json"),
                       offline, log)
    if not els:
        return 0, 0

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
    return n_edge, n_name


def cable_layer_for(name: str, warn: list):
    """Layer kabel feeder dari nama kabelnya.

    Layer template hanya FO 24/36/48 CORE. Kabel HF/MF biasanya jauh lebih
    besar (96C, 144C, 288C ...); dulu kabel seperti itu DILEWATI sehingga
    rutenya hilang dari gambar. Sekarang digambar di layer 'FO <n> CORE'
    yang dibuat bila belum ada.
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
    """Pastikan blok simbol joint closure ada.

    TEMPLATE.dxf punya LAYER 'FIBER OPTIC CLOSURE' tapi tidak punya bloknya
    (simbol itu hidup di file DWG drafter). Kalau belum ada, dibuatkan: dua
    segitiga bertemu di ujung -- bentuk yang sama dengan LEGEND gambar SF.
    Warnanya BYLAYER, jadi ikut merah seperti layernya."""
    if JC_BLOCK in doc.blocks:
        return JC_BLOCK
    h = lebar / 2
    blk = doc.blocks.new(JC_BLOCK)
    atts = {"layer": "0", "color": apd.BYLAYER_COLOR}
    blk.add_solid([(-h, h), (-h, -h), (0.0, 0.0)], dxfattribs=atts)
    blk.add_solid([(h, h), (h, -h), (0.0, 0.0)], dxfattribs=atts)
    log(f"  blok '{JC_BLOCK}' tidak ada di template -> dibuatkan "
        f"({lebar:.1f} m, bentuk seperti di LEGEND)")
    return JC_BLOCK


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
    ensure_jc_block(doc, satuan, log)
    if JC_BLOCK not in parts:
        info = apd.symbol_parts(doc, JC_BLOCK)
        if info:
            parts[JC_BLOCK] = info

    # --- jalan dulu, baru isinya -------------------------------------------
    if not no_roads:
        gambar_jalan(msp, kml_path, out_path, lons, lats, tr, base,
                     ensure_layer, offline,
                     road_half, road_text or 2.21, stat, log)

    # --- gambar ------------------------------------------------------------
    catatan = []          # keterangan yang perlu dicarikan tempat
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
                msp.add_lwpolyline([xy(*p) for p in pts], format="xy",
                                   dxfattribs=base(layer))
                stat[f"{layer}  <- LWPOLYLINE"] += 1
            continue

        blk = rule.get("block")
        info = parts.get(blk)
        for lon, lat in kml.points(pm):
            p = xy(lon, lat)
            if rule.get("slack"):
                # Di gambar drafter slack hanya berupa keterangan dengan
                # garis penunjuk; tidak ada simbol di titiknya.
                catatan.append(dict(point=p, sym=(1.0, 1.0), layer=LAYER_SLACK,
                                    text=SLACK_NOTE, tinggi=SLACK_TEXT_HEIGHT))
                continue
            if info:
                sc = info["scale"]
                msp.add_blockref(info["block"], p, dxfattribs={
                    **base(layer), "xscale": sc, "yscale": sc, "zscale": sc})
                stat[f"{layer}  <- blok '{info['block']}'"] += 1
            else:
                if blk:
                    warn.append(f"blok '{blk}' tidak ada di template "
                                f"-> digambar sebagai POINT")
                msp.add_point(p, dxfattribs=base(layer))
                stat[f"{layer}  <- POINT"] += 1

            sym = ((info["size"][0] * info["scale"],
                    info["size"][1] * info["scale"]) if info else (4.0, 4.0))

            if rule.get("text") and name:
                ensure_layer(POLE_TEXT_LAYER)
                t = msp.add_mtext(name, dxfattribs={
                    **base(POLE_TEXT_LAYER), "style": TEXT_STYLE,
                    "char_height": POLE_TEXT_HEIGHT})
                t.set_location((p[0] + POLE_TEXT_OFFSET[0],
                                p[1] + POLE_TEXT_OFFSET[1]),
                               attachment_point=dxfconst.MTEXT_BOTTOM_LEFT)
                stat[f"{POLE_TEXT_LAYER}  <- MTEXT"] += 1

            if rule.get("jc"):
                baru, cap = parse_closure(name)
                catatan.append(dict(point=p, sym=sym, layer=LAYER_JC,
                                    text=f"{'NEW' if baru else 'EXT'} "
                                         f"CLOSURE {cap or ''}".strip(),
                                    tinggi=JC_TEXT_HEIGHT))

    # --- keterangan: cari tempat yang tidak bertabrakan --------------------
    place_log = []
    if catatan:
        lebar = max(len(max(c["text"].split("\\P"), key=len)) * 0.62 * c["tinggi"]
                    for c in catatan)
        tinggi = max(c["tinggi"] * (c["text"].count("\\P") + 1) * 1.6
                     for c in catatan)
        spots = apd.place_labels(catatan, [], lebar, tinggi, place_log)
        for c, spot in zip(catatan, spots):
            cx, cy = spot["center"]
            t = msp.add_mtext(c["text"], dxfattribs={
                **base(c["layer"]), "style": TEXT_STYLE,
                "char_height": c["tinggi"], "attachment_point": 5})
            t.set_location((cx, cy), attachment_point=5)
            msp.add_lwpolyline(spot["leader"], format="xy",
                               dxfattribs=base(c["layer"]))
            stat[f"{c['layer']}  <- keterangan + garis"] += 1

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
