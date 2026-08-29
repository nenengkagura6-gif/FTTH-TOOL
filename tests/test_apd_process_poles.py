import xml.etree.ElementTree as ET
from app.engines.kml_apd_engine import process_poles

kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>FDT BERSAMA</name>
      <Placemark><name> KOTAK FDT 01</name><Point><coordinates>100.0,0.0,0</coordinates></Point></Placemark>
      <Placemark><name>ODP FDT 02 </name><Point><coordinates>100.1,0.0,0</coordinates></Point></Placemark>
    </Folder>
    <Folder>
      <name>LINE A FDT 01</name>
      <Folder>
        <name>DISTRIBUTION</name>
        <Placemark><LineString><coordinates>100.0,0.0,0 100.02,0.0,0</coordinates></LineString></Placemark>
      </Folder>
    </Folder>
    <Folder>
      <name>LINE B FDT 01</name>
      <Folder>
        <name>DISTRIBUTION</name>
        <Placemark><LineString><coordinates>100.04,0.0,0 100.06,0.0,0</coordinates></LineString></Placemark>
      </Folder>
    </Folder>
    <Folder>
      <name>LINE A FDT 02</name>
      <Folder>
        <name>DISTRIBUTION</name>
        <Placemark><LineString><coordinates>100.10,0.0,0 100.12,0.0,0</coordinates></LineString></Placemark>
      </Folder>
    </Folder>
    <Folder>
      <name>POLE</name>
      <!-- LINE A FDT 01 poles -->
      <Placemark><name>Pole 1</name><Point><coordinates>100.005,0.0,0</coordinates></Point></Placemark>
      <Placemark><name>Pole 2</name><Point><coordinates>100.015,0.0,0</coordinates></Point></Placemark>
      <!-- LINE B FDT 01 poles -->
      <Placemark><name>Pole 3</name><Point><coordinates>100.045,0.0,0</coordinates></Point></Placemark>
      <Placemark><name>Pole 4</name><Point><coordinates>100.055,0.0,0</coordinates></Point></Placemark>
      <!-- LINE A FDT 02 poles -->
      <Placemark><name>Pole 5</name><Point><coordinates>100.105,0.0,0</coordinates></Point></Placemark>
      <Placemark><name>Pole 6</name><Point><coordinates>100.115,0.0,0</coordinates></Point></Placemark>
    </Folder>
  </Document>
</kml>
"""

root = ET.fromstring(kml)
for el in root.iter():
    if '}' in el.tag:
        el.tag = el.tag.split('}', 1)[1]
doc = root.find('.//Document')

# Step 4 logic duplicated here to simulate the actual run
fdts = {}
fdt_count = 0
for pm in doc.findall(".//Placemark"):
    fdt_nm_el = pm.find("name")
    if fdt_nm_el is not None:
        pm_name = (fdt_nm_el.text or "").strip().upper()
        if "FDT" in pm_name:
            coords = pm.find(".//coordinates")
            if coords is not None and coords.text:
                try:
                    lon, lat, *_ = coords.text.strip().split(",")
                    fdts[pm_name] = (float(lat), float(lon))
                    fdt_count += 1
                except Exception:
                    pass

print("Detected FDTs:", fdts)

process_poles(doc, fdts)

for f in doc.findall('Folder'):
    if f.find('name').text == 'POLE':
        continue
    print('Folder:', f.find('name').text)
    for sub in f.findall('Folder'):
        print('  Sub:', sub.find('name').text)
        for pm in sub.findall('Placemark'):
            n = pm.find('name')
            print('    PM:', n.text if n is not None else 'None')
