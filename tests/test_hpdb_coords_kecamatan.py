"""
Uji koordinat FDT & pengisian kecamatan pada engine APD HPDB.

Aturan penataan KML di proyek ini:
  * Titik FDT WAJIB berada di dalam folder yang namanya mengandung "FDT".
  * Nama Placemark-nya diabaikan — di lapangan dinamai bebas.
  * URUTAN yang menentukan nomornya: paling atas = FDT 01, lalu FDT 02, dst.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

failures = 0


def check(name, cond, detail=""):
    global failures
    if cond:
        print("  [OK]    %s %s" % (name, detail))
    else:
        print("  [GAGAL] %s %s" % (name, detail))
        failures += 1


from engines.apd_engine import APDEngine  # noqa: E402

PM = ('<Placemark><name>{n}</name><Point>'
      '<coordinates>{lo},{la},0</coordinates></Point></Placemark>')


def coords_of(body: str):
    doc = ('<?xml version="1.0"?>'
           '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
           + body + "</Document></kml>").encode("utf-8")
    eng = APDEngine()
    eng.load_kml(doc, "uji.kml", is_kmz=False)
    return eng.get_all_fdt_coords()


print("=== 1. Nomor FDT ditentukan URUTAN, bukan nama ===")

satu = coords_of(
    '<Folder><name>FDT</name>'
    + PM.format(n="KOTAK 48C", lo="108.455580", la="-6.702440") +
    '</Folder>'
)
check("1 placemark -> FDT 01 (nama diabaikan)",
      satu == {"FDT 01": ("-6.702440", "108.455580")}, "-> %s" % (satu,))

dua = coords_of(
    '<Folder><name>FDT</name>'
    + PM.format(n="CODINGAN-A", lo="108.100000", la="-6.100000")
    + PM.format(n="CODINGAN-B", lo="108.200000", la="-6.200000") +
    '</Folder>'
)
check("2 placemark -> FDT 01 & FDT 02", sorted(dua) == ["FDT 01", "FDT 02"],
      "-> %s" % (sorted(dua),))
check("yang paling ATAS jadi FDT 01",
      dua.get("FDT 01") == ("-6.100000", "108.100000"), "-> %s" % (dua.get("FDT 01"),))
check("berikutnya jadi FDT 02",
      dua.get("FDT 02") == ("-6.200000", "108.200000"), "-> %s" % (dua.get("FDT 02"),))

# Nama yang menyesatkan tidak boleh mengubah urutan
sesat = coords_of(
    '<Folder><name>FDT</name>'
    + PM.format(n="FDT 03", lo="108.100000", la="-6.100000")
    + PM.format(n="FDT 01", lo="108.200000", la="-6.200000") +
    '</Folder>'
)
check("nama 'FDT 03' di urutan pertama tetap jadi FDT 01",
      sesat.get("FDT 01") == ("-6.100000", "108.100000"), "-> %s" % (sesat,))

tiga = coords_of(
    '<Folder><name>FDT BERSAMA</name>'
    + PM.format(n="A", lo="108.100000", la="-6.100000")
    + PM.format(n="B", lo="108.200000", la="-6.200000")
    + PM.format(n="C", lo="108.300000", la="-6.300000") +
    '</Folder>'
)
check("3 placemark -> FDT 01..03", sorted(tiga) == ["FDT 01", "FDT 02", "FDT 03"],
      "-> %s" % (sorted(tiga),))

check("placemark di sub-folder ikut terbaca",
      coords_of('<Folder><name>FDT</name><Folder><name>TITIK</name>'
                + PM.format(n="X", lo="108.455580", la="-6.702440")
                + '</Folder></Folder>').get("FDT 01")
      == ("-6.702440", "108.455580"))


print()
print("=== 2. Di LUAR folder FDT harus diabaikan ===")

check("label kabel di folder KABEL diabaikan",
      coords_of('<Folder><name>KABEL DISTRIBUSI</name>'
                + PM.format(n="SLING FDT 01", lo="99.000000", la="-1.000000")
                + '</Folder>') == {})

check("placemark langsung di Document diabaikan",
      coords_of(PM.format(n="FDT 01", lo="99.000000", la="-1.000000")) == {})

campur = coords_of(
    '<Folder><name>KABEL</name>'
    + PM.format(n="SLING FDT 01", lo="99.000000", la="-1.000000") +
    '</Folder>'
    '<Folder><name>FDT</name>'
    + PM.format(n="apa saja", lo="108.455580", la="-6.702440") +
    '</Folder>'
)
check("label kabel tidak menggeser titik FDT asli",
      campur == {"FDT 01": ("-6.702440", "108.455580")}, "-> %s" % (campur,))


print()
print("=== 3. Kecamatan terisi saat Nominatim tidak memuatnya ===")


class FakeResp:
    status_code = 200

    def __init__(self, payload):
        self._p = payload

    def json(self):
        return self._p


class FakeSession:
    """Meniru respons Nominatim Indonesia: zoom 18 tanpa level kecamatan."""

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


import time as _t  # noqa: E402
_t.sleep = lambda *a, **k: None

eng = APDEngine()
eng.session = FakeSession()
res = eng.reverse_geocode(-6.702440, 108.455580)

check("desa terisi", res["desa"] == "AMBULU", "-> %r" % res["desa"])
check("kabupaten terisi (dipakai C3)", res["kabupaten"] == "CIREBON",
      "-> %r" % res["kabupaten"])
check("KECAMATAN terisi dari display_name", res["kecamatan"] == "LOSARI",
      "-> %r" % res["kecamatan"])

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
