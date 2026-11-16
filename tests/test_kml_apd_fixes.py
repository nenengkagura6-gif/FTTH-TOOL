"""Uji perbaikan dan antisipasi error pada mesin KML To APD (app/engines/kml_apd_engine.py).

Jalankan dari akar repo:
  python tests/test_kml_apd_fixes.py
"""
import io
import math
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "app"))

from engines.insert_coding_engine import process_insert_coding  # noqa: E402
from engines.kml_apd_engine import (  # noqa: E402
    _dist_to_polygon_m,
    process_kml_apd,
)
from shapely.geometry import MultiPolygon, Polygon  # noqa: E402

KML_NS = "{http://www.opengis.net/kml/2.2}"
failures = 0


def check(name, cond, detail=""):
    global failures
    print(("  [OK]    " if cond else "  [GAGAL] ") + f"{name} {detail}")
    if not cond:
        failures += 1


def kml_doc(*parts: str, extra_doc: str = "", xmlns: bool = True) -> bytes:
    ns_attr = ' xmlns="http://www.opengis.net/kml/2.2"' if xmlns else ""
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f"<kml{ns_attr}><Document><name>Cluster Uji</name>"
        f"{extra_doc}{''.join(parts)}</Document></kml>"
    ).encode("utf-8")


def pt(name, lon, lat, extra=""):
    return (
        f"<Placemark><name>{name}</name>{extra}"
        f"<Point><coordinates>{lon},{lat},0</coordinates></Point></Placemark>"
    )


def line(name, coords, extra=""):
    c = " ".join(f"{lo},{la},0" for lo, la in coords)
    return (
        f"<Placemark><name>{name}</name>{extra}"
        f"<LineString><coordinates>{c}</coordinates></LineString></Placemark>"
    )


def poly(name, coords, extra=""):
    c = " ".join(f"{lo},{la},0" for lo, la in coords)
    return (
        f"<Placemark><name>{name}</name>{extra}"
        f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{c}</coordinates>"
        f"</LinearRing></outerBoundaryIs></Polygon></Placemark>"
    )


def rect(name, lon1, lat1, lon2, lat2, extra=""):
    return poly(
        name,
        [(lon1, lat1), (lon2, lat1), (lon2, lat2), (lon1, lat2), (lon1, lat1)],
        extra=extra,
    )


def folder(name, *children):
    return f"<Folder><name>{name}</name>{''.join(children)}</Folder>"


def parse_output(res):
    assert res["status"] == "success", res
    raw = res["content"]
    if res["filename"].endswith(".kmz"):
        with zipfile.ZipFile(io.BytesIO(raw), "r") as z:
            raw = z.read("doc.kml")
    return ET.fromstring(raw.decode("utf-8"))


# =====================================================================
print("=== 1. Metadata ETL dibersihkan & schemaUrl tidak menipu klasifikasi ===")
schema_xml = (
    '<Schema name="POLE %2826%29" id="S_POLE">'
    '<SimpleField type="string" name="NAMA"/></Schema>'
)
ext_fake_existing = (
    '<ExtendedData><SchemaData schemaUrl="C:/Users/EXISTING_9-4_FILE.kmz#S_POLE">'
    '<SimpleData name="NAMA">NP</SimpleData></SchemaData></ExtendedData>'
)
ext_real_existing = (
    '<ExtendedData><SchemaData schemaUrl="#S_POLE">'
    '<SimpleData name="TYPE">EXISTING</SimpleData></SchemaData></ExtendedData>'
)
raw_meta = kml_doc(
    folder("FDT", pt("FDT", 108.5000, -6.6000, ext_fake_existing)),
    folder(
        "POLE",
        pt("P1", 108.5005, -6.6000, ext_fake_existing),
        pt("P2", 108.5010, -6.6000, ext_real_existing),
    ),
    folder("HP", pt("H1", 108.5005, -6.60005, ext_fake_existing)),
    folder(
        "LINE A",
        folder("BOUNDARY", rect("B1", 108.5003, -6.6002, 108.5012, -6.5998, ext_fake_existing)),
        folder("DISTRIBUTION CABLE", line("CABLE LINE A", [(108.5000, -6.6000), (108.5010, -6.6000)], ext_fake_existing)),
    ),
    extra_doc=schema_xml,
)
res = process_kml_apd(raw_meta, "meta.kmz", is_kmz=False)
root = parse_output(res)
check("proses sukses", res["status"] == "success")
check("ExtendedData = 0", len(root.findall(".//" + KML_NS + "ExtendedData")) == 0)
check("Schema = 0", len(root.findall(".//" + KML_NS + "Schema")) == 0)
check("SchemaData = 0", len(root.findall(".//" + KML_NS + "SchemaData")) == 0)

folder_pms = {
    f.findtext(KML_NS + "name", ""): [p.findtext(KML_NS + "name", "") for p in f.findall(KML_NS + "Placemark")]
    for f in root.iter(KML_NS + "Folder")
}
check("P1 (schemaUrl berisi EXISTING_9-4) tetap NEW POLE", len(folder_pms.get("NEW POLE 7-2.5", [])) == 1, str(folder_pms))
check("P2 (SimpleData TYPE=EXISTING) masuk EXISTING POLE EMR 7-4", len(folder_pms.get("EXISTING POLE EMR 7-4", [])) == 1, str(folder_pms))

# =====================================================================
print("\n=== 2. Nama kabel, topologi (-AE-/-UG-), & toleransi 5% ===")
raw_cables = kml_doc(
    folder("FDT", pt("FDT", 108.5000, -6.6000)),
    folder(
        "POLE",
        pt("P1", 108.5005, -6.6000),
        pt("P2", 108.5005, -6.6010),
        pt("P3", 108.5005, -6.6020),
    ),
    folder(
        "LINE A",
        folder("BOUNDARY", rect("A1", 108.5003, -6.6002, 108.5007, -6.5998)),
        folder("DISTRIBUTION CABLE", line("CABLE LINE A", [(108.5000, -6.6000), (108.5005, -6.6000)])),
    ),
    folder(
        "LINE B",
        folder("BOUNDARY", rect("B1", 108.5003, -6.6012, 108.5007, -6.6008)),
        folder("DISTRIBUTION CABLE", line("SRG04.056 - CABLE LINE B (FO 24C/2T) -A- 999 m", [(108.5000, -6.6000), (108.5005, -6.6010)])),
    ),
    folder(
        "LINE C",
        folder("BOUNDARY", rect("C1", 108.5003, -6.6022, 108.5007, -6.6018)),
        folder("DISTRIBUTION CABLE", line("CABLE LINE C (FO 24C/2T) -UG- 10 m", [(108.5000, -6.6000), (108.5005, -6.6020)])),
    ),
)
res_c = process_kml_apd(raw_cables, "cables.kml", is_kmz=False)
root_c = parse_output(res_c)
cable_info = []
for f in root_c.iter(KML_NS + "Folder"):
    if f.findtext(KML_NS + "name", "") == "DISTRIBUTION CABLE":
        for pm in f.findall(KML_NS + "Placemark"):
            cable_info.append((pm.findtext(KML_NS + "name", ""), pm.findtext(KML_NS + "description", "")))

check("LINE A punya C/T + -AE- + panjang m", bool(re.match(r"^CABLE LINE A \(FO 24C/2T\) -AE- \d+ m$", cable_info[0][0])), cable_info[0][0])
check("LINE B typo -A- & panjang lama diperbaiki ke -AE-", bool(re.match(r"^SRG04\.056 - CABLE LINE B \(FO 24C/2T\) -AE- \d+ m$", cable_info[1][0])), cable_info[1][0])
check("LINE C -UG- dipertahankan", bool(re.match(r"^CABLE LINE C \(FO 24C/2T\) -UG- \d+ m$", cable_info[2][0])), cable_info[2][0])
m_desc = re.search(r"Total Route\s*:\s*(\d+)\s*m.*Total Slack\s*:\s*\d+\s*unit.*?@20 m\nToleransi\s*:\s*(\d+)\s*m\n\nTotal Length Cable\s*:\s*\d+\s*\+\s*(\d+)\s*\+\s*(\d+)\s*:\s*(\d+)\s*m", cable_info[0][1], re.S)
check("toleransi 5% ceil selaras dengan deskripsi & nama",
      m_desc is not None and int(m_desc.group(2)) == math.ceil((int(m_desc.group(1)) + int(m_desc.group(3))) * 0.05) and cable_info[0][0].endswith(f" {m_desc.group(5)} m"),
      cable_info[0][1])

# =====================================================================
print("\n=== 3. Slack Hanger: SLACK.FDT / SLACK.FAT.*, Multi-FDT, tanpa tiang ===")
slack_names = [
    pm.findtext(KML_NS + "name", "")
    for f in root_c.iter(KML_NS + "Folder")
    if f.findtext(KML_NS + "name", "") == "SLACK HANGER"
    for pm in f.findall(KML_NS + "Placemark")
]
check("tidak ada slack bernama mentah 'FDT'", "FDT" not in slack_names, str(slack_names))
check("ada SLACK.FDT dan SLACK.FAT.A01..C01",
      {"SLACK.FDT", "SLACK.FAT.A01", "SLACK.FAT.B01", "SLACK.FAT.C01"}.issubset(set(slack_names)),
      str(slack_names))

# Multi-FDT layout (termasuk test tanpa folder POLE agar slack FDT tetap dibuat)
raw_multi = kml_doc(
    folder("FDT", pt("FDT 01", 108.5000, -6.6000), pt("FDT 02", 108.5100, -6.6000)),
    folder("LINE A FDT 01", folder("BOUNDARY", rect("A1", 108.5003, -6.6002, 108.5007, -6.5998))),
    folder("LINE A FDT 02", folder("BOUNDARY", rect("A1", 108.5103, -6.6002, 108.5107, -6.5998))),
)
res_m = process_kml_apd(raw_multi, "multi.kml", is_kmz=False)
root_m = parse_output(res_m)
slacks_m = [
    pm.findtext(KML_NS + "name", "")
    for f in root_m.iter(KML_NS + "Folder")
    if f.findtext(KML_NS + "name", "") == "SLACK HANGER"
    for pm in f.findall(KML_NS + "Placemark")
]
check("multi-FDT tanpa tiang tetap buat SLACK.FDT.01 & SLACK.FDT.02",
      slacks_m == ["SLACK.FDT.01", "SLACK.FDT.02"], str(slacks_m))

# =====================================================================
print("\n=== 4. Boundary berimpit & swap tiang jalan agar semua boundary dapat FAT ===")
# A01 berisi P1 & P2 di mana P2 lebih dekat ke centroid A01, sedangkan A02 berjarak ~6m dari P2.
# Pass 1 mengambil P2 untuk A01; Pass 2 harus menukar A01->P1 dan memberi P2 ke A02.
raw_swap = kml_doc(
    folder("FDT", pt("FDT", 108.5000, -6.6000)),
    folder(
        "POLE",
        pt("P1", 108.50012, -6.6000),
        pt("P2", 108.50028, -6.6000),
    ),
    folder(
        "LINE A",
        folder(
            "BOUNDARY",
            rect("A1", 108.50010, -6.6002, 108.50045, -6.5998),
            rect("A2", 108.500335, -6.6002, 108.50060, -6.5998),
        ),
        folder("DISTRIBUTION CABLE", line("CABLE LINE A", [(108.5000, -6.6000), (108.50035, -6.6000)])),
    ),
)
res_sw = process_kml_apd(raw_swap, "swap.kml", is_kmz=False)
root_sw = parse_output(res_sw)
fats_sw = [
    pm.findtext(KML_NS + "name", "")
    for f in root_sw.iter(KML_NS + "Folder")
    if f.findtext(KML_NS + "name", "") == "FAT"
    for pm in f.findall(KML_NS + "Placemark")
]
check("A01 & A02 keduanya mendapat FAT lewat swap", fats_sw == ["A01", "A02"], str(fats_sw))

# =====================================================================
print("\n=== 5. Monotonisitas ukuran tiang & round-trip Idempotent + Insert Coding ===")
raw_rt = kml_doc(
    folder("FDT", pt("FDT 01", 108.5000, -6.6000)),
    folder(
        "POLE",
        pt("P_FDT_9M 9-4", 108.5000, -6.6000),     # dekat FDT tapi eksplisit 9-4 -> harus tetap 9-4!
        pt("P_EXIST EXISTING 7-4", 108.5005, -6.6000),  # dekat FAT -> harus tetap EXISTING 7-4!
        pt("P_NEW", 108.5010, -6.6000),            # di ujung kabel -> harus naik jadi NEW POLE 7-3!
    ),
    folder("HP", pt("H1", 108.5005, -6.60005), pt("H2", 108.5010, -6.60005)),
    folder(
        "LINE A",
        folder(
            "BOUNDARY",
            rect("B1", 108.5003, -6.6002, 108.5007, -6.5998),
            rect("B2", 108.5008, -6.6002, 108.5012, -6.5998),
        ),
        folder("DISTRIBUTION CABLE", line("CABLE LINE A", [(108.5000, -6.6000), (108.5010, -6.6000)])),
    ),
)
apd1 = process_kml_apd(raw_rt, "rt.kmz", is_kmz=True)
ic1 = process_insert_coding(apd1["content"], "rt_APD.kmz", {1: "TST.001"}, is_kmz=True)
apd2 = process_kml_apd(ic1["content"], "rt_coded.kmz", is_kmz=True)
root_rt2 = parse_output(apd2)
counts_rt2 = {
    f.findtext(KML_NS + "name", ""): len(f.findall(KML_NS + "Placemark"))
    for f in root_rt2.iter(KML_NS + "Folder")
}
check("9-4 dekat FDT tetap di NEW POLE 9-4 saat proses ulang", counts_rt2.get("NEW POLE 9-4") == 1, str(counts_rt2))
check("EXISTING 7-4 dekat FAT tetap di EXISTING POLE EMR 7-4", counts_rt2.get("EXISTING POLE EMR 7-4") == 1, str(counts_rt2))
check("tiang ujung kabel jadi NEW POLE 7-3", counts_rt2.get("NEW POLE 7-3") == 1, str(counts_rt2))
check("proses ulang tidak menghilangkan FAT", counts_rt2.get("FAT") == 2, str(counts_rt2))
check("HP COVER tetap utuh setelah proses ulang", apd2["report"]["stats"].get("hp_cover") == 2, str(apd2["report"]["stats"]))

# =====================================================================
print("\n=== 6. Resiliensi geometri (NaN, poligon rusak/MultiPolygon, BOUNDARY CLUSTER) ===")
bowtie = Polygon([(0, 0), (2, 2), (0, 2), (2, 0), (0, 0)]).buffer(0)
mpoly = MultiPolygon([
    Polygon([(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]),
    Polygon([(2, 0), (3, 0), (3, 1), (2, 1), (2, 0)]),
])
check("bowtie buffer(0) & MultiPolygon di _dist_to_polygon_m tidak crash",
      bowtie.is_valid and math.isfinite(_dist_to_polygon_m(3.0, 1.0, bowtie)) and math.isfinite(_dist_to_polygon_m(3.5, 0.5, mpoly)))

raw_edge = kml_doc(
    folder("FDT", pt("FDT", 108.5000, -6.6000)),
    folder("POLE", pt("P1", 108.5005, -6.6000), pt("P_NAN", "NaN", "NaN")),
    folder("HP", folder("SubHP", pt("H1", 108.5005, -6.60005))),
    folder(
        "LINE-A",
        folder("BOUNDARY CLUSTER", rect("CLUST", 108.4, -6.7, 108.6, -6.5)),
        folder(
            "BOUNDARY FAT",
            poly("DEGEN", [(108.5, -6.6), (108.501, -6.6)]),  # < 3 titik
            rect("OK", 108.5003, -6.6002, 108.5007, -6.5998),
        ),
        folder("DISTRIBUTION CABLE", line("CABLE", [(108.5000, -6.6000), (108.5005, -6.6000)])),
    ),
)
res_e = process_kml_apd(raw_edge, "edge.kml", is_kmz=False)
root_e = parse_output(res_e)
check("NaN, poligon < 3 titik, & BOUNDARY CLUSTER di LINE-A ditangani aman",
      res_e["status"] == "success" and res_e["report"]["stats"].get("fat") == 1 and res_e["report"]["stats"].get("hp_cover") == 1,
      str(res_e["report"]))

print("\nHASIL:", "SEMUA LULUS" if failures == 0 else f"{failures} KEGAGALAN")
sys.exit(1 if failures else 0)
