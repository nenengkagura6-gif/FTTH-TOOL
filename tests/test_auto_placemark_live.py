"""Jalankan Auto Placemark (auto tagging HP) end-to-end dengan boundary kecil."""
import sys
import traceback

sys.path.insert(0, r"D:\WEB APP\app")

# Polygon kecil di kawasan padat (Menteng, Jakarta Pusat) supaya OSM
# pasti punya bangunan & jalan, dan areanya cukup kecil agar cepat.
KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Boundary Uji</name>
    <Placemark>
      <name>BOUNDARY</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              106.8300,-6.1960,0
              106.8330,-6.1960,0
              106.8330,-6.1990,0
              106.8300,-6.1990,0
              106.8300,-6.1960,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""


def progress(msg):
    print("   [progress]", msg)


print("=== Auto Placemark / auto tagging HP ===")
print()

try:
    from engines.auto_placemark_engine import process_auto_placemark
except Exception:
    print("[GAGAL] tidak bisa mengimpor engine")
    traceback.print_exc()
    sys.exit(1)

try:
    result = process_auto_placemark(
        boundary_content=KML.encode("utf-8"),
        filename="boundary_uji.kml",
        is_kmz=False,
        progress_cb=progress,
    )
except Exception as exc:
    print()
    print("[EXCEPTION MENTAH]", type(exc).__name__, exc)
    traceback.print_exc()
    sys.exit(1)

print()
print("status  :", result.get("status"))
print("filename:", result.get("filename"))
if result.get("status") == "error":
    print("message :", result.get("message"))
    sys.exit(1)

content = result.get("content") or b""
print("ukuran  :", len(content), "byte")
head = content[:200].decode("utf-8", errors="ignore")
print("cuplikan:", head.replace("\n", " ")[:160])
print()
print("HASIL: LULUS" if len(content) > 0 else "HASIL: KOSONG")
