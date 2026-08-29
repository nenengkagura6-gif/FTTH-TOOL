"""Uji perbaikan kategori Rendah: validate-kml ketat + dukungan KMZ."""
import io
import os
import sys
import zipfile

sys.path.insert(0, r"D:\WEB APP\app")
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)
failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print("  [OK]   %s %s" % (name, detail))
    else:
        print("  [GAGAL] %s %s" % (name, detail))
        failures += 1


GOOD_KML = b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cluster A</name>
<Folder><name>POLE</name>
<Placemark><name>POLE-001</name><Point><coordinates>106.800000,-6.200000,0</coordinates></Point></Placemark>
<Placemark><name>POLE-002</name><Point><coordinates>106.800001,-6.200001,0</coordinates></Point></Placemark>
</Folder></Document></kml>"""

print("=== 1. /validate-kml sekarang benar-benar memvalidasi ===")

r = client.post("/validate-kml", files={"kml_file": ("ok.kml", GOOD_KML, "application/xml")})
check("KML benar -> valid", r.json().get("valid") is True, "-> %s" % r.json())

# XML rusak: sebelumnya recover=True membuatnya tetap "valid"
broken = b"<?xml version='1.0'?><kml><Document><name>rusak</Document>"
r = client.post("/validate-kml", files={"kml_file": ("broken.kml", broken, "application/xml")})
check("XML rusak -> tidak valid", r.json().get("valid") is False, "-> %s" % str(r.json())[:80])

# XML sah tapi bukan KML
notkml = b"<?xml version='1.0'?><catalog><book><title>bukan kml</title></book></catalog>"
r = client.post("/validate-kml", files={"kml_file": ("x.xml", notkml, "application/xml")})
check("XML non-KML -> tidak valid", r.json().get("valid") is False, "-> %s" % str(r.json())[:80])

# KML sah tapi kosong tanpa Placemark
empty = b"<?xml version='1.0'?><kml xmlns='http://www.opengis.net/kml/2.2'><Document/></kml>"
r = client.post("/validate-kml", files={"kml_file": ("empty.kml", empty, "application/xml")})
check("KML tanpa Placemark -> tidak valid", r.json().get("valid") is False, "-> %s" % str(r.json())[:80])

print()
print("=== 2. /check-duplicates menerima .kmz ===")

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("doc.kml", GOOD_KML)
kmz = buf.getvalue()

r = client.post(
    "/check-duplicates",
    files={"kml_files": ("data.kmz", kmz, "application/vnd.google-earth.kmz")},
    data={"max_distance": "5.0", "output_format": "json"},
)
check(".kmz diterima", r.status_code == 200, "-> %s" % r.status_code)
if r.status_code == 200:
    body = r.json()
    check("isi KMZ terbaca", "POLE" in str(body).upper() or body.get("status") == "success",
          "-> %s" % str(body)[:100])

# .kml biasa harus tetap jalan
r = client.post(
    "/check-duplicates",
    files={"kml_files": ("data.kml", GOOD_KML, "application/xml")},
    data={"max_distance": "5.0", "output_format": "json"},
)
check(".kml tetap jalan", r.status_code == 200, "-> %s" % r.status_code)

# Ekstensi lain tetap ditolak
r = client.post(
    "/check-duplicates",
    files={"kml_files": ("data.txt", GOOD_KML, "text/plain")},
    data={"max_distance": "5.0"},
)
check(".txt ditolak", r.status_code == 400, "-> %s" % r.status_code)

print()
print("=== 3. LoggerWriter punya batas & lock ===")
lw = sys.stdout
check("MAX_BYTES ada", hasattr(type(lw), "MAX_BYTES"),
      "-> %s MB" % (getattr(type(lw), "MAX_BYTES", 0) / 1024 / 1024))
check("lock ada", hasattr(lw, "_lock"))

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
