"""
Uji konversi KML <-> DXF: ketepatan proyeksi UTM dan tidak ada titik ganda.

Melindungi dua hal:
  1. Matematika UTM (maju & balik) tetap cocok dengan pyproj
  2. convert_dxf_to_kml tidak menggandakan titik. convert_kml_to_dxf
     menulis TIGA entity per placemark (CIRCLE + POINT + TEXT); tanpa
     penggabungan, konversi balik mengeluarkan dua placemark per titik —
     satu bernama benar, satu lagi "Node-POINT" di koordinat yang sama.
"""
import re
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print("  [OK]    %s %s" % (name, detail))
    else:
        print("  [GAGAL] %s %s" % (name, detail))
        failures += 1


TITIK = [
    ("Cirebon", 108.455580, -6.702440),
    ("Jakarta", 106.827000, -6.175400),
    ("Surabaya", 112.752090, -7.257500),
    ("Bandung", 107.619100, -6.917400),
]
UTM_ZONE = 49  # rata-rata bujur titik di atas

KML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
    + "".join(
        f'<Placemark><name>{n}</name><Point>'
        f'<coordinates>{lo:.6f},{la:.6f},0</coordinates></Point></Placemark>'
        for n, lo, la in TITIK
    )
    + "</Document></kml>"
)

from engines.conversion_engine import (  # noqa: E402
    convert_kml_to_dxf,
    convert_dxf_to_kml,
    utm_to_latlon,
)


def jarak_meter(lon1, lat1, lon2, lat2):
    return (((lon2 - lon1) * 111320 * 0.993) ** 2 + ((lat2 - lat1) * 110540) ** 2) ** 0.5


print("=== 1. Bolak-balik KML -> DXF -> KML ===")

dxf_bytes = convert_kml_to_dxf(KML.encode("utf-8"), is_kmz=False)
check("DXF terbentuk", len(dxf_bytes) > 0, "-> %d byte" % len(dxf_bytes))

kml_back = convert_dxf_to_kml(dxf_bytes, utm_zone=UTM_ZONE, is_southern=True).decode(
    "utf-8", errors="ignore"
)

coords = re.findall(r"<coordinates>\s*(-?[\d.]+),(-?[\d.]+)", kml_back)
check("tidak ada titik ganda", len(coords) == len(TITIK),
      "-> %d titik (harus %d)" % (len(coords), len(TITIK)))

names = [n for n in re.findall(r"<name>([^<]+)</name>", kml_back)
         if n not in ("Converted DXF Drawing", "Default")]
check("tidak ada placemark 'Node-*' tanpa nama",
      not any(n.startswith("Node-") for n in names), "-> %s" % names)
check("semua nama asli terjaga",
      all(n in names for n, _, _ in TITIK), "-> %s" % names)

worst = 0.0
for (nama, lo, la), (blo, bla) in zip(TITIK, coords):
    d = jarak_meter(lo, la, float(blo), float(bla))
    worst = max(worst, d)
check("penyimpangan bolak-balik < 0,5 m", worst < 0.5, "-> terburuk %.4f m" % worst)


print()
print("=== 2. Ketepatan mutlak vs pyproj ===")
try:
    from pyproj import Transformer

    fwd = Transformer.from_crs("EPSG:4326", f"EPSG:{32700 + UTM_ZONE}", always_xy=True)
    worst_abs = 0.0
    for nama, lo, la in TITIK:
        e, n = fwd.transform(lo, la)
        got = utm_to_latlon(e, n, UTM_ZONE, True)
        glon, glat = (got[0], got[1]) if abs(got[0]) > 90 else (got[1], got[0])
        worst_abs = max(worst_abs, jarak_meter(lo, la, glon, glat))
    check("utm_to_latlon cocok pyproj < 1 m", worst_abs < 1.0,
          "-> terburuk %.4f m" % worst_abs)
except ImportError:
    print("  (pyproj tidak terpasang — pemeriksaan ini dilewati)")

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
