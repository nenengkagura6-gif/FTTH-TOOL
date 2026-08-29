"""Uji ulang koordinat FDT & fallback kecamatan dengan struktur KML nyata."""
import sys
sys.path.insert(0, r"D:\WEB APP\app")

failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print("  [OK]    %s %s" % (name, detail))
    else:
        print("  [GAGAL] %s %s" % (name, detail))
        failures += 1


from engines.apd_engine import APDEngine

print("=== Koordinat FDT: berbagai letak Placemark ===")

# Kasus nyata: titik FDT TIDAK berada di folder bernama "FDT"
KASUS = {
    "di folder 'FDT'": b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Folder><name>FDT</name>
    <Placemark><name>FDT 01</name><Point><coordinates>108.455580,-6.702440,0</coordinates></Point></Placemark>
  </Folder>
</Document></kml>""",

    "di folder lain (BOUNDARY)": b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Folder><name>BOUNDARY CLUSTER</name>
    <Placemark><name>KOTAK FDT 01</name><Point><coordinates>108.455580,-6.702440,0</coordinates></Point></Placemark>
  </Folder>
</Document></kml>""",

    "langsung di Document": b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>FDT</name><Point><coordinates>108.455580,-6.702440,0</coordinates></Point></Placemark>
</Document></kml>""",

    "bersarang dalam 3 folder": b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Folder><name>CLUSTER A</name><Folder><name>LINE A</name><Folder><name>PERANGKAT</name>
    <Placemark><name>ODP FDT 02</name><Point><coordinates>108.500000,-6.800000,0</coordinates></Point></Placemark>
  </Folder></Folder></Folder>
</Document></kml>""",
}

for label, kml in KASUS.items():
    eng = APDEngine()
    eng.load_kml(kml, "uji.kml", is_kmz=False)
    coords = eng.get_all_fdt_coords()
    check(label, len(coords) > 0, "-> %s" % coords)

print()
print("=== Format penulisan N6 sesuai template ===")
eng = APDEngine()
eng.load_kml(KASUS["di folder 'FDT'"], "uji.kml", is_kmz=False)
c = eng.get_all_fdt_coords()
lat, lon = c["FDT 01"]
n6 = f": {lat}\u00b0, {lon}\u00b0"
check("presisi 6 desimal", lat == "-6.702440" and lon == "108.455580", "-> %s, %s" % (lat, lon))
check("format cocok template", n6 == ": -6.702440\u00b0, 108.455580\u00b0", "-> %r" % n6)

print()
print("=== Fallback kecamatan dari display_name ===")


class FakeResp:
    status_code = 200

    def __init__(self, payload):
        self._p = payload

    def json(self):
        return self._p


class FakeSession:
    """Meniru Nominatim Indonesia: zoom 18 TIDAK memuat kecamatan."""

    def get(self, url, **k):
        return FakeResp({
            "display_name": "Ambulu, Losari, Cirebon, Jawa Barat, Jawa, 45192, Indonesia",
            "address": {
                "village": "Ambulu",
                "county": "Cirebon",
                "state": "Jawa Barat",
                "postcode": "45192",
                "road": "Jalan Raya Losari",
            },
        })


import time as _t
_t.sleep = lambda *a, **k: None

eng2 = APDEngine()
eng2.session = FakeSession()
res = eng2.reverse_geocode(-6.702440, 108.455580)

check("desa terisi", res["desa"] == "AMBULU", "-> %r" % res["desa"])
check("kabupaten terisi", res["kabupaten"] == "CIREBON", "-> %r" % res["kabupaten"])
check("KECAMATAN terisi dari display_name", res["kecamatan"] == "LOSARI", "-> %r" % res["kecamatan"])
check("kecamatan != desa", res["kecamatan"] != res["desa"])
check("kecamatan != kabupaten", res["kecamatan"] != res["kabupaten"])

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
