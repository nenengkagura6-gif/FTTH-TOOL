"""
BasicMap — bungkus tipis di atas kml2basicmap.py.

Mesin perhitungannya (kml2basicmap.py) aslinya adalah skrip desktop: ia bekerja
dengan file di disk, menulis DXF, CSV daftar jalan, dan cache OSM bersebelahan
dengan berkas masukan. Modul ini menjembatani itu dengan kontrak job backend:
bytes masuk, satu bundel bytes keluar, tanpa meninggalkan file di server.

Keluarannya ZIP berisi tiga berkas:
  * <nama>_BASICMAP.dxf        gambar AutoCAD-nya
  * <nama>_BASICMAP_jalan.csv  daftar ruas jalan; kolom 'nama_dipakai' diisi
                               tangan untuk jalan yang tidak ada di OSM, lalu
                               file KML-nya diproses ulang
  * <nama>_laporan.txt         catatan mesin: berapa kotak dipotong, rumah mana
                               yang perlu diperiksa, jalan mana yang belum
                               bernama

Aturan gambarnya TIDAK ada di sini. Kalau hasilnya perlu diubah, yang diedit
adalah kml2basicmap.py.
"""
from __future__ import annotations

import io
import tempfile
import traceback
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

ENGINE_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = ENGINE_DIR.parent / "templates" / "basicmap_template.dxf"

# Baris log mesin yang layak dijadikan kabar kemajuan. Mesin menulis ~30 baris
# per proses; meneruskan semuanya berarti ~30 update status ke Supabase untuk
# satu job. Yang di bawah ini saja yang benar-benar menandai babak baru.
_PROGRESS_MARKERS = (
    "minta jalan ke overpass",
    "jalan OSM",
    "dipakai",
    "kedalaman",
    "hasil",
    "template",
    "digambar",
)


def _is_milestone(line: str) -> bool:
    low = line.lower()
    return any(m.lower() in low for m in _PROGRESS_MARKERS)


def process_basicmap(
    kml_content: bytes,
    filename: str,
    is_kmz: bool = False,
    progress_cb: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """
    Bikin basic map dari KML/KMZ survei.

    Args:
        kml_content: isi file KML/KMZ mentah
        filename: nama file asli (dipakai untuk menamai hasil)
        is_kmz: True kalau KMZ — mesin mendeteksi sendiri dari isi berkas,
                argumen ini hanya untuk menyeragamkan tanda tangan engine
        progress_cb: callback(pesan) opsional untuk kabar kemajuan

    Returns:
        dict berisi status, filename, content (bytes), content_type
    """
    lines: List[str] = []

    def _log(msg: Any) -> None:
        text = str(msg)
        lines.append(text)
        if progress_cb and _is_milestone(text):
            trimmed = text.strip().lstrip("!").strip()
            if trimmed:
                progress_cb(trimmed[:120])

    try:
        # Impor ditunda sampai di sini: modulnya menarik pyproj + shapely +
        # ezdxf, dan tidak ada gunanya membayar itu saat proses start hanya
        # karena main.py di-import.
        from engines import kml2basicmap as engine

        if progress_cb:
            progress_cb("Membaca titik survei...")

        stem = Path(filename).stem or "basicmap"

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            src = work / Path(filename).name
            src.write_bytes(kml_content)
            out = work / f"{stem}_BASICMAP.dxf"

            report = engine.process(
                src,
                out,
                template=str(TEMPLATE_PATH) if TEMPLATE_PATH.exists() else None,
                log=_log,
            )

            if not out.exists():
                raise RuntimeError("Mesin selesai tetapi file DXF tidak terbentuk.")

            dxf_bytes = out.read_bytes()
            csv_path = out.with_name(out.stem + "_jalan.csv")
            csv_bytes = csv_path.read_bytes() if csv_path.exists() else None

        if progress_cb:
            progress_cb("Membungkus hasil...")

        report = report or {}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(out.name, dxf_bytes)
            if csv_bytes:
                z.writestr(csv_path.name, csv_bytes)
            z.writestr(f"{stem}_laporan.txt", _build_report(lines, report))

        return {
            "status": "success",
            "filename": f"{stem}_BASICMAP.zip",
            "content": buf.getvalue(),
            "content_type": "application/zip",
        }

    except SystemExit as exc:
        # kml2basicmap memakai SystemExit untuk penolakan yang sudah diduga
        # ("Tidak ada titik di folder HP / HOMEPASS di file ini."). Itu pesan
        # untuk pengguna, bukan crash.
        msg = str(exc).strip() or "File tidak bisa diproses."
        print(f"[basicmap] ditolak mesin: {msg}")
        return {"status": "error", "message": msg}
    except Exception as exc:                                   # noqa: BLE001
        print(f"[basicmap] GAGAL: {exc}")
        traceback.print_exc()
        return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}


def _build_report(lines: List[str], report: Dict[str, Any]) -> str:
    """Catatan mesin + daftar hal yang perlu diperiksa manusia."""
    parts = ["CATATAN PROSES BASIC MAP", "=" * 60, ""]
    parts.extend(lines)

    notes = _review_notes(report)
    if notes:
        parts += ["", "=" * 60, "PERLU DIPERIKSA", "=" * 60]
        parts += [f"- {n}" for n in notes]
    else:
        parts += ["", "=" * 60,
                  "Tidak ada yang perlu diperiksa tangan.", "=" * 60]
    return "\n".join(parts) + "\n"


def _review_notes(report: Dict[str, Any]) -> List[str]:
    """Hal yang mesin tidak bisa putuskan sendiri."""
    notes: List[str] = []
    roads = report.get("roads") or 0
    named = report.get("roads_named") or 0
    if roads and named < roads:
        notes.append(
            f"{roads - named} ruas jalan belum bernama di OpenStreetMap. Isi "
            "kolom 'nama_dipakai' di file _jalan.csv, lalu proses ulang KML "
            "yang sama supaya nama jalannya ikut tergambar."
        )
    if report.get("orphan"):
        notes.append(
            f"{report['orphan']} rumah tidak punya jalan terdekat — arah "
            "kotaknya ditebak dari deretan rumah di sekitarnya."
        )
    if report.get("hp_in_road"):
        notes.append(
            f"{report['hp_in_road']} titik HP jatuh di dalam badan jalan. "
            "Titik surveinya yang perlu digeser, bukan gambarnya."
        )
    bad_geom = report.get("hp_geom", report.get("outside", 0))
    if bad_geom:
        notes.append(f"{bad_geom} kotak tidak memuat titik HP-nya sendiri.")
    if report.get("overlap"):
        notes.append(
            f"{report['overlap']} pasang kotak masih tumpang tindih — perlu "
            "dirapikan tangan di AutoCAD."
        )
    if report.get("on_road"):
        notes.append(f"{report['on_road']} kotak masih menimpa badan jalan.")
    if report.get("narrow"):
        notes.append(
            f"{report['narrow']} kotak sangat sempit karena titik HP-nya "
            "hampir berimpit dengan tetangganya."
        )
    return notes
