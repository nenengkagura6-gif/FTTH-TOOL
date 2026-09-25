#!/usr/bin/env python3
"""
kml2dxf_full.py - Satu KML/KMZ -> SATU DXF berisi BASIC MAP + DESAIN APD.

Menggabungkan dua mesin yang sudah ada, tanpa menyalin aturannya:

  kml2dxf.py       desain APD : simbol FAT/FDT + kotak keterangan, kabel,
                   tiang per jenis, POLE ID, kop & DESIGN SUMMARY, jumlah
                   layout mengikuti jumlah FDT
  kml2basicmap.py  basic map  : kotak rumah, tepi jalan OSM, nama jalan,
                   nomor rumah di tengah kotak

Keduanya menggambar ke DOKUMEN YANG SAMA, jadi hasilnya satu file DXF:
basic map jadi alasnya, desain APD di atasnya. Tabel RULES, ukuran kotak,
dan semua aturan lain tetap tinggal di file aslinya masing-masing -- file
ini cuma mengatur urutan dan hal-hal yang harus disepakati bersama:

  * EPSG dipaksa SATU untuk kedua mesin, supaya gambarnya tidak melenceng
  * modelspace template dikosongkan SEKALI di sini, bukan dua kali
  * basic map digambar LEBIH DULU, desain menyusul, supaya di AutoCAD
    simbol FAT/FDT dan kabel berada DI ATAS kotak rumah -- urutan masuk ke
    file menentukan siapa menimpa siapa
  * tiang digambar oleh kml2dxf.py saja (per jenis: NP 7 2.5 / 7 3 / 7 4 /
    9 4 / EXT MR), bukan blok NP7 seragam milik basic map -- kalau tidak,
    tiap tiang akan tergambar dua kali
  * kop, DESIGN SUMMARY, dan jumlah layout diisi kml2dxf.py; kop VALIDASI
    milik basic map dimatikan
  * viewport layout diarahkan ke seluruh gambar (basic map + desain)
  * file disimpan SEKALI di akhir

Template yang dipakai TEMPLATE.dxf (milik kml2dxf.py), karena di dalamnya
sudah ada layer basic map ('Basic Map', 'Home Number', 'NEW POLE 7m')
sekaligus semua layer dan blok desain.

Contoh:
    python kml2dxf_full.py "CBN005724 - TANJUNG ANOM RW 07 DAN 08.kml"
    python kml2dxf_full.py "desain.kmz" -o hasil.dxf --depth 11.2
    python kml2dxf_full.py "desain.kmz" --dry-run
    python kml2dxf_full.py "desain.kmz" --no-basic      (desain saja)
    python kml2dxf_full.py "desain.kmz" --no-design     (basic map saja)
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import ezdxf
from ezdxf import bbox

HERE = Path(__file__).resolve().parent

TEMPLATE_DEFAULT = "TEMPLATE.dxf"
OUT_SUFFIX = "_FULL"


# --------------------------------------------------------------------------
# Muat kedua mesin
# --------------------------------------------------------------------------
def find_engine(fname: str, hint=None) -> Path:
    """Cari file mesin: folder ini dulu, lalu ke folder induk sampai 4 tingkat.

    kml2basicmap.py biasanya ada di '<...>/SND KASAR/BASIC MAP/', sedangkan
    file ini di '<...>/APD/TO DWG/FINAL/'. Dicari, bukan ditulis mati, supaya
    seluruh folder PYTHON tetap bisa dipindah atau di-copy ke komputer lain.
    """
    tries = []
    if hint:
        h = Path(hint)
        tries += [h, h / fname]
    tries.append(HERE / fname)
    for base in [HERE, *list(HERE.parents)[:4]]:
        for pattern in (fname, "*/" + fname, "*/*/" + fname):
            tries += sorted(base.glob(pattern))
    for t in tries:
        if t.is_file():
            return t.resolve()
    raise SystemExit(
        f"{fname} tidak ketemu.\n"
        f"Letakkan file itu di folder yang sama dengan kml2dxf_full.py, atau "
        f"sebutkan foldernya lewat --engines.")


def load_engine(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    # Mesin mengimpor modul tetangganya sendiri (mis. lewat folder skrip),
    # jadi foldernya dimasukkan ke sys.path.
    folder = str(path.parent)
    if folder not in sys.path:
        sys.path.insert(0, folder)
    spec.loader.exec_module(mod)
    return mod


_LOADED = {}


def engines(hint=None, log=print):
    """Muat kedua mesin sekali saja, lalu pakai ulang.

    GUI memanggil ini saat dibuka (untuk memastikan filenya ketemu) dan tiap
    kali tombol ditekan; tanpa penyimpanan ini, kedua modul dijalankan ulang
    setiap konversi."""
    key = str(hint or "")
    if key not in _LOADED and not hint:
        # Di backend kedua mesin sudah ada di paket 'engines'.
        try:
            from engines import kml2dxf as _d, kml2basicmap as _b
            _LOADED[key] = (_d, _b, Path(_d.__file__), Path(_b.__file__))
        except ImportError:
            pass
    if key not in _LOADED:
        d_path = find_engine("kml2dxf.py", hint)
        b_path = find_engine("kml2basicmap.py", hint)
        _LOADED[key] = (load_engine(d_path, "kml2dxf"),
                        load_engine(b_path, "kml2basicmap"),
                        d_path, b_path)
    design, basic, d_path, b_path = _LOADED[key]
    log(f"Mesin desain    : {d_path}")
    log(f"Mesin basic map : {b_path}")
    return design, basic


# --------------------------------------------------------------------------
# Hal-hal yang harus disepakati kedua mesin
# --------------------------------------------------------------------------
def common_epsg(design, src: Path) -> int:
    """Zona UTM dari TITIK TENGAH semua koordinat di file.

    Kedua mesin punya deteksi otomatis sendiri: kml2dxf.py memakai tengah
    semua koordinat, kml2basicmap.py memakai rata-rata titik HP saja. Nyaris
    selalu sama, tapi kalau lokasinya dekat batas zona bisa berbeda dan
    gambarnya akan melenceng ratusan kilometer. Jadi dihitung sekali di sini,
    lalu dipaksakan ke keduanya.
    """
    kml = design.Kml(design.read_kml_bytes(src))
    lons, lats = [], []
    for _, _, pm in kml.placemarks():
        for c in pm.iter(kml.q("coordinates")):
            for lon, lat in design.Kml.parse_coords(c.text):
                lons.append(lon)
                lats.append(lat)
    if not lons:
        raise SystemExit("Tidak ada koordinat yang terbaca di file ini.")
    return design.pick_epsg((min(lons) + max(lons)) / 2,
                            (min(lats) + max(lats)) / 2)


def aim_viewports(doc, basic, log) -> int:
    """Arahkan viewport tiap layout ke SELURUH gambar yang baru dibuat.

    Memakai fungsi milik kml2basicmap.py, tapi dengan batas gambar diukur
    dari modelspace -- jadi kotak keterangan FAT/FDT yang berada di luar
    barisan rumah tetap ikut terlihat.
    """
    msp = doc.modelspace()
    try:
        ext = bbox.extents(msp, fast=True)
    except Exception as exc:                                # pragma: no cover
        log(f"  !! batas gambar tidak bisa diukur ({exc}) -> viewport dibiarkan")
        return 0
    if not ext.has_data:
        return 0
    info = dict(cx=(ext.extmin.x + ext.extmax.x) / 2,
                cy=(ext.extmin.y + ext.extmax.y) / 2,
                w=max(ext.size.x, 1.0), h=max(ext.size.y, 1.0))
    n = 0
    for lay in doc.layouts:
        if lay.name.lower() == "model":
            continue
        n += basic.aim_viewports(lay, info)
    if n:
        log(f"  viewport   : {n} jendela diarahkan ke gambar "
            f"({info['w']:.0f} x {info['h']:.0f} m)")
    return n


# --------------------------------------------------------------------------
# Proses utama
# --------------------------------------------------------------------------
def process(src, out=None, template=None, *, epsg=None, dry_run=False,
            do_design=True, do_basic=True, keep_template=False,
            # --- desain APD (kml2dxf.py) ---
            fill_summary=True, reset_summary=True, auto_layouts=True,
            # --- basic map (kml2basicmap.py) ---
            depth=None, min_width=None, max_width=None, road_half=None,
            hp_text=None, road_text=None, offline=False, no_roads=False,
            uncover_basic=True, basic_poles=False, no_clip=False,
            # --- lain-lain ---
            aim_view=True, engines_hint=None, log=print):
    """Gambar desain APD dan basic map dari satu KML/KMZ ke satu file DXF."""
    design, basic = engines(engines_hint, log)

    src = Path(src)
    if not src.exists():
        raise SystemExit(f"File tidak ada: {src}")
    out = Path(out) if out else src.with_name(src.stem + OUT_SUFFIX + ".dxf")
    tpl = Path(template) if template else HERE / TEMPLATE_DEFAULT

    if not (do_design or do_basic):
        raise SystemExit("Tidak ada yang digambar: desain dan basic map "
                         "dua-duanya dimatikan.")

    if min_width is None:
        min_width = basic.DEFAULT_MIN_WIDTH
    if max_width is None:
        max_width = basic.DEFAULT_MAX_WIDTH
    if hp_text is None:
        hp_text = basic.TEXT_HEIGHT_HP
    if road_text is None:
        road_text = basic.TEXT_HEIGHT_ROAD

    if do_design and do_basic and basic_poles:
        log("!! basic_poles menyala bersama desain APD: tiap tiang akan "
            "tergambar dua kali (blok NP7 seragam + blok per jenis)")

    code = epsg or common_epsg(design, src)
    log(f"Proyeksi        : EPSG:4326 -> EPSG:{code}"
        f"{' (auto, dipakai kedua mesin)' if epsg is None else ' (manual)'}")
    log("")

    rep_d = rep_b = None
    fail_d = fail_b = None

    # ---------------------------------------------------------------- cek
    if dry_run:
        if do_basic:
            log("=" * 68)
            log("BASIC MAP (kml2basicmap.py)")
            log("=" * 68)
            try:
                rep_b = basic.process(
                    src, out, depth=depth, min_width=min_width,
                    max_width=max_width, template=None, epsg=code,
                    offline=offline, dry_run=True, road_half=road_half,
                    hp_text=hp_text, road_text=road_text,
                    uncover_basic=uncover_basic, no_roads=no_roads,
                    no_poles=not basic_poles, no_clip=no_clip, log=log)
            except SystemExit as exc:
                fail_b = str(exc)
                log(f"!! basic map dilewati: {exc}")
        if do_design:
            log("")
            log("=" * 68)
            log("DESAIN APD (kml2dxf.py)")
            log("=" * 68)
            try:
                rep_d = design.convert(src, tpl, out, code, True, True,
                                       fill_summary=fill_summary,
                                       reset_summary=reset_summary,
                                       auto_layouts=auto_layouts, log=log)
            except SystemExit as exc:
                fail_d = str(exc)
                log(f"!! desain dilewati: {exc}")
        summary(rep_d, rep_b, fail_d, fail_b, out, dry_run=True, log=log)
        return dict(design=rep_d, basic=rep_b, out=out, epsg=code,
                    dry_run=True)

    # ------------------------------------------------------------ template
    if tpl.exists():
        doc = ezdxf.readfile(str(tpl))
        log(f"Template        : {tpl.name}")
    elif do_design:
        raise SystemExit(
            f"Template tidak ada: {tpl}\n"
            f"Desain APD butuh blok FAT/FDT/tiang dari TEMPLATE.dxf.")
    else:
        doc = ezdxf.new("R2013", setup=True)
        log(f"!! template {tpl.name} tidak ada -> pakai DXF kosong")
    doc.header["$INSUNITS"] = 6                              # meter

    # Modelspace dikosongkan SEKALI di sini. Kalau dibiarkan tiap mesin
    # membersihkan sendiri, mesin kedua akan menghapus gambar mesin pertama.
    if not keep_template:
        msp = doc.modelspace()
        n = 0
        for e in list(msp):
            msp.delete_entity(e)
            n += 1
        log(f"Modelspace      : {n} objek bawaan template dihapus")
    log("")

    # ----------------------------------------------------------- basic map
    # Digambar duluan supaya jadi ALAS: entitas yang masuk belakangan yang
    # tampil di atas, jadi simbol desain tidak tertutup kotak rumah.
    if do_basic:
        log("=" * 68)
        log("BASIC MAP (kml2basicmap.py)")
        log("=" * 68)
        try:
            rep_b = basic.process(
                src, out, depth=depth, min_width=min_width,
                max_width=max_width, template=None, epsg=code,
                offline=offline, dry_run=False, road_half=road_half,
                hp_text=hp_text, road_text=road_text,
                uncover_basic=uncover_basic, no_roads=no_roads,
                no_poles=not basic_poles, no_clip=no_clip, doc=doc,
                save=False, fill_kop=False, log=log)
        except SystemExit as exc:
            fail_b = str(exc)
            log(f"!! basic map dilewati: {exc}")

    # ---------------------------------------------------------- desain APD
    if do_design:
        log("")
        log("=" * 68)
        log("DESAIN APD (kml2dxf.py)")
        log("=" * 68)
        try:
            rep_d = design.convert(src, tpl, out, code, True, False,
                                   fill_summary=fill_summary,
                                   reset_summary=reset_summary,
                                   auto_layouts=auto_layouts,
                                   doc=doc, save=False, log=log)
        except SystemExit as exc:
            fail_d = str(exc)
            log(f"!! desain dilewati: {exc}")

    if rep_d is None and rep_b is None:
        raise SystemExit("Tidak ada yang berhasil digambar -- file tidak "
                         "ditulis.")

    # ------------------------------------------------------------- simpan
    log("")
    if aim_view:
        aim_viewports(doc, basic, log)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(str(out))

    summary(rep_d, rep_b, fail_d, fail_b, out, dry_run=False, log=log)
    return dict(design=rep_d, basic=rep_b, out=out, epsg=code, dry_run=False)


def summary(rep_d, rep_b, fail_d, fail_b, out, dry_run, log) -> None:
    log("")
    log("=" * 68)
    log("RINGKASAN GABUNGAN")
    log("=" * 68)
    if rep_d:
        p = rep_d["poles"]
        log(f"  desain APD   : {rep_d['n_fdt']} FDT, {rep_d['n_fat']} FAT, "
            f"{rep_d['homepass']} homepass")
        log(f"                 tiang existing MR {p.get('EXISTING_MR', 0)}, "
            f"partner {p.get('EXISTING_PARTNER', 0)}, "
            f"baru {p.get('NEW_7_25', 0) + p.get('NEW_7_3', 0) + p.get('NEW_7_4', 0) + p.get('NEW_9', 0)}")
        if not dry_run:
            log(f"                 {rep_d['drawn']} objek digambar")
    elif fail_d:
        log(f"  desain APD   : GAGAL - {fail_d}")
    if rep_b:
        log(f"  basic map    : {rep_b['rects']} kotak rumah dalam "
            f"{rep_b['rows']} deret, kedalaman {rep_b['depth']:.2f} m")
        log(f"                 {rep_b['roads']} ruas jalan OSM "
            f"({rep_b['roads_named']} bernama), "
            f"{rep_b['overlap']} kotak tumpang tindih")
        if rep_b.get("clipped") or rep_b.get("halved"):
            log(f"                 {rep_b.get('clipped', 0)} kotak dipotong "
                f"lepas dari badan jalan, {rep_b.get('halved', 0)} pasang "
                f"dibagi dua di garis tengah")
        if rep_b.get("hp_in_road"):
            log(f"                 {rep_b['hp_in_road']} titik HP jatuh di "
                f"badan jalan -- titik surveinya perlu digeser")
    elif fail_b:
        log(f"  basic map    : GAGAL - {fail_b}")
    if dry_run:
        log("")
        log("(mode cek -- tidak ada file yang ditulis)")
    else:
        log("")
        log(f"Selesai. Tersimpan di:\n{out}")


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Satu KML/KMZ jadi satu DXF: basic map + desain APD.")
    ap.add_argument("kml", type=Path, help="file .kml atau .kmz")
    ap.add_argument("-o", "--output", type=Path,
                    help=f"file DXF hasil (default: <nama>{OUT_SUFFIX}.dxf)")
    ap.add_argument("-t", "--template", type=Path,
                    default=HERE / TEMPLATE_DEFAULT,
                    help="template DXF (default: %(default)s)")
    ap.add_argument("--epsg", type=int,
                    help="paksa EPSG tujuan, mis. 32749 (default: UTM auto)")
    ap.add_argument("--engines", type=Path,
                    help="folder tempat kml2dxf.py / kml2basicmap.py berada")
    ap.add_argument("--dry-run", action="store_true",
                    help="hitung dan laporkan saja, tidak menulis file")
    ap.add_argument("--keep-template", action="store_true",
                    help="jangan hapus geometri bawaan template")

    g = ap.add_argument_group("bagian yang digambar")
    g.add_argument("--no-design", action="store_true",
                   help="jangan gambar desain APD (basic map saja)")
    g.add_argument("--no-basic", action="store_true",
                   help="jangan gambar basic map (desain APD saja)")
    g.add_argument("--basic-poles", action="store_true",
                   help="tiang digambar juga oleh basic map sebagai blok NP7 "
                        "seragam (default: hanya kml2dxf.py, per jenis tiang)")
    g.add_argument("--no-viewport", action="store_true",
                   help="jangan arahkan viewport layout ke gambar")

    g = ap.add_argument_group("desain APD (kml2dxf.py)")
    g.add_argument("--no-summary", action="store_true",
                   help="jangan sentuh tabel DESIGN SUMMARY")
    g.add_argument("--keep-old-summary", action="store_true",
                   help="biarkan angka proyek lama di baris yang tidak diisi")
    g.add_argument("--fixed-layouts", action="store_true",
                   help="jangan sesuaikan jumlah layout dengan jumlah FDT")

    g = ap.add_argument_group("basic map (kml2basicmap.py)")
    g.add_argument("--depth", type=float,
                   help="kedalaman kotak rumah, meter (default: auto)")
    g.add_argument("--min-width", type=float, help="lebar muka minimum, meter")
    g.add_argument("--max-width", type=float, help="lebar muka maksimum, meter")
    g.add_argument("--road-half", type=float,
                   help="setengah lebar jalan, meter (default per kelas OSM)")
    g.add_argument("--hp-text", type=float, help="tinggi teks nomor rumah")
    g.add_argument("--road-text", type=float, help="tinggi teks nama jalan")
    g.add_argument("--offline", action="store_true",
                   help="jangan query Overpass, pakai cache saja")
    g.add_argument("--no-roads", action="store_true",
                   help="sama sekali tidak menggambar jalan")
    g.add_argument("--no-clip", action="store_true",
                   help="jangan potong sisa kotak yang masih bertabrakan")
    g.add_argument("--number-layer", action="store_true",
                   help="nomor HP UNCOVER ikut di layer 'Home Number' "
                        "(default: layer 'Basic Map')")
    a = ap.parse_args()

    process(a.kml, a.output, a.template, epsg=a.epsg, dry_run=a.dry_run,
            do_design=not a.no_design, do_basic=not a.no_basic,
            keep_template=a.keep_template,
            fill_summary=not a.no_summary,
            reset_summary=not a.keep_old_summary,
            auto_layouts=not a.fixed_layouts,
            depth=a.depth, min_width=a.min_width, max_width=a.max_width,
            road_half=a.road_half, hp_text=a.hp_text, road_text=a.road_text,
            offline=a.offline, no_roads=a.no_roads, no_clip=a.no_clip,
            uncover_basic=not a.number_layer, basic_poles=a.basic_poles,
            aim_view=not a.no_viewport, engines_hint=a.engines)


if __name__ == "__main__":
    main()
