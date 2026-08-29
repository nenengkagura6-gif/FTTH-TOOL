"""Uji batas upload + zip bomb lewat FastAPI TestClient (tanpa perlu server)."""
import io
import os
import sys
import zipfile

sys.path.insert(0, r"D:\WEB APP\app")
os.environ.setdefault("MAX_UPLOAD_SIZE", str(2 * 1024 * 1024))  # 2 MB biar cepat

from fastapi.testclient import TestClient
import main

client = TestClient(main.app)
limit = main.MAX_UPLOAD_BYTES
print("Batas aktif: %.1f MB\n" % (limit / 1024 / 1024))

failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print("  [OK]   %s %s" % (name, detail))
    else:
        print("  [GAGAL] %s %s" % (name, detail))
        failures += 1


SMALL_KML = b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>x</name>
<Folder><name>F</name><Placemark><name>P</name>
<Point><coordinates>106.8,-6.2,0</coordinates></Point></Placemark></Folder>
</Document></kml>"""

# ---------------------------------------------------------------
print("=== 1. File melebihi batas ditolak 413 ===")
big = b"<kml>" + b"A" * (limit + 1024) + b"</kml>"
r = client.post("/validate-kml", files={"kml_file": ("big.kml", big, "application/xml")})
check("/validate-kml", r.status_code == 413, "-> %s %s" % (r.status_code, r.json()))

r = client.post("/api/v1/otdr/parse", files={"sor_file": ("big.sor", big, "application/octet-stream")})
check("/api/v1/otdr/parse", r.status_code == 413, "-> %s" % r.status_code)

r = client.post("/kml-to-excel", files={"kml_file": ("big.kml", big, "application/xml")})
check("/kml-to-excel", r.status_code == 413, "-> %s" % r.status_code)

# ---------------------------------------------------------------
print()
print("=== 2. File normal tetap diterima ===")
r = client.post("/validate-kml", files={"kml_file": ("ok.kml", SMALL_KML, "application/xml")})
check("/validate-kml", r.status_code == 200 and r.json().get("valid") is True,
      "-> %s %s" % (r.status_code, r.json()))

# ---------------------------------------------------------------
print()
print("=== 3. Terlalu banyak file ditolak ===")
files = [("kml_files", ("f%d.kml" % i, SMALL_KML, "application/xml"))
         for i in range(main.MAX_FILES_PER_REQUEST + 3)]
r = client.post("/check-duplicates", files=files, data={"max_distance": "1.0"})
check("/check-duplicates", r.status_code == 413, "-> %s" % r.status_code)

# ---------------------------------------------------------------
print()
print("=== 4. Zip bomb ditolak ===")
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    # 300 MB nol -> terkompres jadi beberapa ratus KB
    z.writestr("bomb.sor", b"\0" * (300 * 1024 * 1024))
bomb = buf.getvalue()
ratio = (300 * 1024 * 1024) / len(bomb)
print("  ZIP: %.1f KB terkompres -> 300 MB, rasio %.0fx" % (len(bomb) / 1024, ratio))
r = client.post("/api/v1/otdr/parse-batch",
                files={"files": ("bomb.zip", bomb, "application/zip")})
check("/api/v1/otdr/parse-batch", r.status_code in (400, 413),
      "-> %s %s" % (r.status_code, str(r.json())[:90]))

# ---------------------------------------------------------------
print()
print("=== 5. ZIP normal tetap diterima ===")
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("trace.sor", b"NOT-A-REAL-SOR" * 100)
ok_zip = buf.getvalue()
r = client.post("/api/v1/otdr/parse-batch",
                files={"files": ("ok.zip", ok_zip, "application/zip")})
check("/api/v1/otdr/parse-batch", r.status_code == 200, "-> %s" % r.status_code)

# ---------------------------------------------------------------
print()
print("=== 6. Endpoint queue job wajib autentikasi ===")
r = client.post("/api/v1/queue/job", json={
    "job_id": "00000000-0000-0000-0000-000000000000",
    "file_path": "korban-user-id/rahasia.kml",
    "original_filename": "rahasia.kml",
    "user_id": "korban-user-id",
    "tool_name": "kml_to_boq",
})
check("tanpa token -> 401", r.status_code == 401, "-> %s %s" % (r.status_code, r.json()))

r = client.post("/api/v1/queue/job",
                headers={"Authorization": "Bearer token-palsu"},
                json={
                    "job_id": "00000000-0000-0000-0000-000000000000",
                    "file_path": "korban-user-id/rahasia.kml",
                    "original_filename": "rahasia.kml",
                    "tool_name": "kml_to_boq",
                })
check("token palsu -> 401", r.status_code == 401, "-> %s" % r.status_code)

# ---------------------------------------------------------------
print()
print("=== 7. /debug-logs tertutup ===")
r = client.get("/debug-logs")
check("tanpa token -> 404", r.status_code == 404, "-> %s" % r.status_code)

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
