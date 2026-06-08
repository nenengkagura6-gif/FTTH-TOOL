import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.engines.insert_coding_engine import process_insert_coding
from xml.dom import minidom
import zipfile
import io

def create_mock_kml() -> bytes:
    # A simple mock KML layout with 2 FDTs
    kml_content = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Test Document</name>
    
    <!-- FDT 01 Group -->
    <Folder>
      <name>LINE A FDT 01</name>
      
      <Folder>
        <name>BOUNDARY</name>
        <Folder>
          <name>CLUSTER A</name>
          <description>to be ignored since name contains CLUSTER</description>
        </Folder>
        <Folder>
          <name>PERUMAHAN 1</name>
          <description>Old description</description>
        </Folder>
      </Folder>
      
      <Folder>
        <name>HP COVER</name>
        <Folder>
          <name>PERUMAHAN 1</name>
          <Placemark><name>HP 1</name></Placemark>
          <Placemark><name>HP 2</name></Placemark>
          <Placemark><name>HP 3</name></Placemark>
        </Folder>
      </Folder>

      <Folder>
        <name>FDT Folder</name>
        <Placemark>
          <name>FDT 01</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>FAT Folder</name>
        <Placemark>
          <name>FAT A02</name>
        </Placemark>
        <Placemark>
          <name>FAT A01</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>CABLE Folder</name>
        <Placemark>
          <name>12 Core Cable</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>NEW POLE 7-2.5</name>
        <Placemark>
          <name>MR.TEST.P02</name>
        </Placemark>
        <Placemark>
          <name>MR.TEST.P01</name>
        </Placemark>
      </Folder>
    </Folder>

    <!-- FDT 02 Group -->
    <Folder>
      <name>LINE B FDT 02</name>
      
      <Folder>
        <name>BOUNDARY</name>
        <Folder>
          <name>PERUMAHAN 2</name>
        </Folder>
      </Folder>
      
      <Folder>
        <name>HP COVER</name>
        <Folder>
          <name>PERUMAHAN 2</name>
          <Placemark><name>HP A</name></Placemark>
          <Placemark><name>HP B</name></Placemark>
        </Folder>
      </Folder>

      <Folder>
        <name>FDT Folder 2</name>
        <Placemark>
          <name>FDT 02</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>FAT Folder 2</name>
        <Placemark>
          <name>FAT B01</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>DISTRIBUTION CABLE</name>
        <Placemark>
          <name>24 Core Distribution</name>
        </Placemark>
      </Folder>

      <Folder>
        <name>NEW POLE 9-4</name>
        <Placemark>
          <name>MR.OTHER.P05</name>
        </Placemark>
        <Placemark>
          <name>MR.OTHER.P01</name>
        </Placemark>
      </Folder>
    </Folder>
  </Document>
</kml>
"""
    return kml_content.encode("utf-8")

def test_engine():
    kml_bytes = create_mock_kml()
    prefixes = {
        1: "PGKB.032",
        2: "PGKB.033"
    }
    
    print("Running process_insert_coding...")
    res = process_insert_coding(kml_bytes, "test_file.kml", prefixes, is_kmz=False)
    
    if res["status"] != "success":
        print(f"FAILED: {res.get('message')}")
        return

    # Extract KML from the generated KMZ
    kmz_bytes = res["content"]
    with zipfile.ZipFile(io.BytesIO(kmz_bytes), "r") as z:
        doc_kml = z.read("doc.kml").decode("utf-8")

    # Let's inspect the output elements
    doc = minidom.parseString(doc_kml)
    
    print("\n--- RESULTS VERIFICATION ---")
    
    # 1. Verify description updates
    folders = doc.getElementsByTagName("Folder")
    for f in folders:
        # Get name
        name_node = f.getElementsByTagName("name")
        if not name_node:
            continue
        name = name_node[0].firstChild.nodeValue
        
        # Check if parent is BOUNDARY
        parent = f.parentNode
        is_boundary = False
        if parent and parent.nodeName == "Folder":
            parent_name_nodes = [c for c in parent.childNodes if getattr(c, "tagName", None) == "name"]
            if parent_name_nodes:
                def get_text(node):
                    text = []
                    if node.nodeType in (node.TEXT_NODE, node.CDATA_SECTION_NODE):
                        text.append(node.nodeValue)
                    for c in getattr(node, "childNodes", []):
                        get_text(c)
                    return "".join(text).strip()
                parent_name = "".join(get_text(c) for c in parent_name_nodes).upper()
                if parent_name == "BOUNDARY":
                    is_boundary = True
                    
        if not is_boundary:
            continue
            
        # Check boundary description
        if name == "PERUMAHAN 1":
            desc_nodes = f.getElementsByTagName("description")
            desc = desc_nodes[0].firstChild.nodeValue if desc_nodes else ""
            print(f"Boundary 'PERUMAHAN 1' description (expected '3 HP'): {desc}")
            assert desc == "3 HP"
        elif name == "PERUMAHAN 2":
            desc_nodes = f.getElementsByTagName("description")
            desc = desc_nodes[0].firstChild.nodeValue if desc_nodes else ""
            print(f"Boundary 'PERUMAHAN 2' description (expected '2 HP'): {desc}")
            assert desc == "2 HP"

    # 2. Verify Placemark names
    placemarks = doc.getElementsByTagName("Placemark")
    for pm in placemarks:
        pm_name = pm.getElementsByTagName("name")[0].firstChild.nodeValue
        print(f"Placemark Name: {pm_name}")

if __name__ == "__main__":
    test_engine()
