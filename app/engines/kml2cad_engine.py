"""
KML to CAD — bungkus tipis di atas tiga mesin desktop:

  kml2dxf.py       desain APD cluster: simbol FAT/FDT + kotak keterangan,
                   kabel, tiang per jenis, POLE ID, kop & DESIGN SUMMARY
  kml2dxf_full.py  desain APD cluster + basic map (kotak rumah, jalan OSM)
                   dalam SATU file DXF
  kml2sf.py        desain feeder (SF / HF / MF): rute kabel, tiang, joint
                   closure, slack hanger, kop & DESIGN SUMMARY

Pilihan pengguna:
  jenis     'cluster' | 'feeder'
  basicmap  True/False
            cluster + basicmap -> kml2dxf_full (basic map + desain APD)
            cluster tanpa      -> kml2dxf      (desain APD saja)
            feeder  + basicmap -> kml2sf dengan tepi & nama jalan OSM
            feeder  tanpa      -> kml2sf tanpa jalan
            (file feeder tidak punya titik rumah, jadi 'basic map' untuk
            feeder berarti jalannya saja)

Keluaran: ZIP berisi DXF, CSV daftar jalan (kalau jalan digambar), dan
laporan proses. Aturan gambarnya TIDAK ada di sini — yang diedit adalah
file mesinnya masing-masing.
"""
from __future__ import annotations

import io
import tempfile
import traceback
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

ENGINE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = ENGINE_DIR.parent / "templates" / "kml2cad_template.dxf"

JENIS = ("cluster", "feeder")


def _as_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or value == "":
        return default
    return str(value).strip().lower() in ("1", "true", "ya", "yes", "y", "on")


def process_kml2cad(
    kml_content: bytes,
    filename: str,
    jenis: str = "cluster",
    basicmap: bool = True,
    homepass: Optional[int] = None,
    hub: Optional[str] = None,
    roads_csv: Optional[bytes] = None,
    progress_cb: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """KML/KMZ desain FTTH -> DXF AutoCAD berdasarkan template drafter."""
    jenis = (jenis or "cluster").strip().lower()
    if jenis not in JENIS:
        return {"status": "error",
                "message": f"Jenis desain tidak dikenal: {jenis!r} (pilih cluster atau feeder)."}
    basicmap = _as_bool(basicmap)

    lines: List[str] = []

    def log(*args: Any, **_kw: Any) -> None:
        # Tanda tangan sama dengan print(): mesin memanggil log("  -", w).
        lines.append(" ".join(str(a) for a in args))

    def progress(msg: str) -> None:
        if progress_cb:
            progress_cb(msg)

    if not TEMPLATE_PATH.exists():
        return {"status": "error", "message": "Template DXF KML to CAD tidak ada di server."}

    try:
        stem = Path(filename).stem or "desain"
        suffix = {"cluster": "_FULL" if basicmap else "_APD", "feeder": "_FEEDER"}[jenis]

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            src = work / Path(filename).name
            src.write_bytes(kml_content)
            out = work / f"{stem}{suffix}.dxf"
            sidecar = out.with_name(out.stem + "_jalan.csv")
            if roads_csv:
                # Nama jalan yang diisi tangan dari proses sebelumnya.
                sidecar.write_bytes(roads_csv)

            report: Dict[str, Any] = {"warnings": [], "stats": {}}

            if jenis == "cluster" and basicmap:
                progress("Menyusun basic map & desain APD...")
                from engines import kml2dxf_full as full
                from engines.basicmap_engine import _review_notes
                res = full.process(src, out, TEMPLATE_PATH, log=log)
                rep_d, rep_b = res.get("design"), res.get("basic")
                if rep_d:
                    _cluster_stats(report, rep_d, with_basicmap=True)
                else:
                    report["warnings"].append("Desain APD gagal digambar — lihat laporan di dalam ZIP.")
                if rep_b:
                    report["stats"]["kotak_rumah"] = rep_b.get("rects")
                    report["stats"]["ruas_jalan"] = rep_b.get("roads")
                    report["warnings"].extend(_review_notes(rep_b))
                else:
                    report["warnings"].append(
                        "Basic map tidak ikut tergambar (mis. tidak ada folder HP) — "
                        "hasilnya desain APD saja.")

            elif jenis == "cluster":
                progress("Menggambar desain APD...")
                from engines import kml2dxf as design
                rep_d = design.convert(src, TEMPLATE_PATH, out, log=log)
                _cluster_stats(report, rep_d, with_basicmap=False)

            else:
                progress("Menggambar desain feeder (SF/HF/MF)...")
                from engines import kml2sf as feeder
                rep = feeder.convert(src, TEMPLATE_PATH, out, homepass=homepass,
                                     hub=hub or None, no_roads=not basicmap, log=log)
                cables = rep.get("cables") or []
                closures = rep.get("closures") or []
                if not (rep.get("n_pole") or cables or closures):
                    return {"status": "error", "message": (
                        "Tidak ada elemen feeder yang dikenali. KML to CAD (SF/HF/MF) "
                        "membaca folder CABLE, JOINT CLOSURE, SLACK HANGER, serta "
                        "EXISTING POLE / NEW POLE <ukuran>. File rencana kasar yang "
                        "hanya berisi poligon cluster dan garis ROUTE belum bisa "
                        "digambar.")}
                report["stats"].update({
                    "tiang": rep.get("n_pole"),
                    "kabel": len(cables),
                    "closure": len(closures),
                    "slack": rep.get("slack"),
                })
                report["warnings"].extend(sorted(set(rep.get("warn") or [])))

            if basicmap and any("semua server Overpass gagal" in l for l in lines):
                report["warnings"].insert(0, (
                    "Semua server OpenStreetMap gagal dihubungi — jalan TIDAK ikut "
                    "tergambar. Proses ulang beberapa menit lagi."))

            if not out.exists():
                raise RuntimeError("Mesin selesai tetapi file DXF tidak terbentuk.")

            progress("Membungkus hasil...")
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr(out.name, out.read_bytes())
                if sidecar.exists():
                    z.writestr(sidecar.name, sidecar.read_bytes())
                z.writestr(f"{stem}_laporan.txt", _build_log(lines, report))

        report["warnings"] = report["warnings"][:50]
        return {
            "status": "success",
            "filename": f"{stem}{suffix}_CAD.zip",
            "content": buf.getvalue(),
            "content_type": "application/zip",
            "report": report,
        }

    except SystemExit as exc:
        # Mesin memakai SystemExit untuk penolakan yang memang diduga
        # ("Tidak ada Placemark di file ini."). Itu pesan untuk pengguna.
        msg = str(exc).strip() or "File tidak bisa diproses."
        print(f"[kml2cad] ditolak mesin: {msg}")
        return {"status": "error", "message": msg}
    except Exception as exc:                                   # noqa: BLE001
        print(f"[kml2cad] GAGAL: {exc}")
        traceback.print_exc()
        return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}


def _cluster_stats(report: Dict[str, Any], rep_d: Dict[str, Any], with_basicmap: bool) -> None:
    if not rep_d.get("n_fat") and not sum((rep_d.get("poles") or {}).values()):
        report["warnings"].insert(0, (
            "Tidak ada FAT maupun tiang yang dikenali. KML to CAD (Cluster) membaca "
            "KML hasil desain APD: folder FAT, BOUNDARY FAT, NEW POLE <ukuran>, "
            "EXISTING POLE ..., DISTRIBUTION CABLE, SLING WIRE. Jalankan KML To APD "
            "lebih dulu kalau file ini masih rancangan mentah."))
    poles = rep_d.get("poles") or {}
    report["stats"].update({
        "fdt": rep_d.get("n_fdt"),
        "fat": rep_d.get("n_fat"),
        "homepass": rep_d.get("homepass"),
        "tiang": sum(poles.values()),
    })
    if rep_d.get("skipped"):
        # Titik HP selalu terhitung 'dilewati' oleh mesin desain APD karena
        # rumah digambar oleh basic map, bukan oleh desain.
        hp_note = ("titik HP digambar oleh basic map" if with_basicmap
                   else "titik HP hanya digambar kalau opsi BasicMap aktif")
        report["warnings"].append(
            f"{rep_d['skipped']} placemark tidak masuk desain APD ({hp_note}; "
            "folder lain yang tidak dikenali dirinci di laporan dalam ZIP)")
    report["warnings"].extend(rep_d.get("warn") or [])


def _build_log(lines: List[str], report: Dict[str, Any]) -> str:
    parts = ["CATATAN PROSES KML TO CAD", "=" * 60, ""]
    parts.extend(lines)
    if report.get("warnings"):
        parts += ["", "=" * 60, "PERLU DIPERIKSA", "=" * 60]
        parts += [f"- {w}" for w in report["warnings"]]
    return "\n".join(parts) + "\n"
