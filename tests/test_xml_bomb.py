"""Bukti bahwa proteksi XML bomb bekerja.

Membandingkan parser lama (rentan) vs parser baru (defusedxml) memakai
payload 'billion laughs' klasik. Payload ini < 1 KB tapi mengembang jadi
miliaran karakter kalau entitasnya diproses.
"""
import sys

BOMB = b"""<?xml version="1.0"?>
<!DOCTYPE kml [
  <!ENTITY a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
  <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
  <!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
  <!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;">
  <!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">
]>
<kml><Document><name>&f;</name></Document></kml>"""

NORMAL = b"""<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>Cluster A</name>
    <Folder><name>FDT-01</name>
      <Placemark><name>POLE-001</name>
        <Point><coordinates>106.8,-6.2,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>"""

print("Ukuran payload bomb: %d byte" % len(BOMB))
print("Ekspansi kalau diproses: ~10^6 x 50 = puluhan juta karakter")
print()

failures = 0

# ---------------------------------------------------------------
print("=== 1. minidom BAWAAN (yang dipakai sebelum perbaikan) ===")
try:
    from xml.dom.minidom import parseString as vulnerable
    doc = vulnerable(BOMB)
    size = len(doc.getElementsByTagName("name")[0].firstChild.nodeValue)
    print("  [RENTAN] bomb diproses, string mengembang jadi %d karakter" % size)
except Exception as exc:
    print("  [?] ditolak juga: %s: %s" % (type(exc).__name__, exc))

# ---------------------------------------------------------------
print()
print("=== 2. defusedxml.minidom (setelah perbaikan) ===")
from defusedxml.minidom import parseString as safe_parse_string
try:
    safe_parse_string(BOMB)
    print("  [GAGAL] bomb TIDAK ditolak!")
    failures += 1
except Exception as exc:
    print("  [AMAN] ditolak: %s" % type(exc).__name__)

# ---------------------------------------------------------------
print()
print("=== 3. defusedxml.ElementTree (setelah perbaikan) ===")
from defusedxml.ElementTree import fromstring as safe_fromstring
try:
    safe_fromstring(BOMB)
    print("  [GAGAL] bomb TIDAK ditolak!")
    failures += 1
except Exception as exc:
    print("  [AMAN] ditolak: %s" % type(exc).__name__)

# ---------------------------------------------------------------
print()
print("=== 4. KML NORMAL tetap harus bisa diparse ===")
try:
    doc = safe_parse_string(NORMAL)
    nm = doc.getElementsByTagName("name")[0].firstChild.nodeValue
    print("  [OK] minidom  -> Document/name = %r" % nm)
except Exception as exc:
    print("  [GAGAL] minidom menolak KML normal: %s" % exc)
    failures += 1

try:
    root = safe_fromstring(NORMAL)
    n = len(list(root.iter()))
    print("  [OK] ElementTree -> %d elemen terbaca" % n)
except Exception as exc:
    print("  [GAGAL] ElementTree menolak KML normal: %s" % exc)
    failures += 1

print()
print("HASIL:", "SEMUA LULUS" if failures == 0 else "%d KEGAGALAN" % failures)
sys.exit(1 if failures else 0)
