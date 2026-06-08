"""
KML/KMZ Insert Coding Engine
=============================
Automatically renames FDT, FAT, CABLE, and NEW POLE elements and updates Boundary HP Cover counts.
Supports up to 3 FDT configuration prefixes.
"""

import io
import re
import zipfile
from collections import defaultdict
from typing import Dict, List, Tuple, Optional, Any
from xml.dom import minidom

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _name_of(elem) -> str:
    """Get the text content of the first <name> child."""
    for child in elem.childNodes:
        if getattr(child, "tagName", None) == "name":
            text = []
            def get_text(node):
                if node.nodeType in (node.TEXT_NODE, node.CDATA_SECTION_NODE):
                    text.append(node.nodeValue)
                for c in getattr(node, "childNodes", []):
                    get_text(c)
            get_text(child)
            return "".join(text).strip()
    return ""

def _set_placemark_name(pm, new_name: str, doc: minidom.Document):
    """Set (or create) the <name> element of a Placemark."""
    name_nodes = [c for c in pm.childNodes if getattr(c, "tagName", None) == "name"]
    if name_nodes:
        node = name_nodes[0]
        if node.firstChild:
            if node.firstChild.nodeType == node.TEXT_NODE:
                node.firstChild.nodeValue = new_name
            else:
                while node.firstChild:
                    node.removeChild(node.firstChild)
                node.appendChild(doc.createTextNode(new_name))
        else:
            node.appendChild(doc.createTextNode(new_name))
    else:
        name_el = doc.createElement("name")
        name_el.appendChild(doc.createTextNode(new_name))
        pm.insertBefore(name_el, pm.firstChild)

def _set_element_description(elem, desc_text: str, doc: minidom.Document):
    """Set (or create) the <description> element of a Folder/Placemark."""
    desc_nodes = [c for c in elem.childNodes if getattr(c, "tagName", None) == "description"]
    if desc_nodes:
        node = desc_nodes[0]
        if node.firstChild:
            if node.firstChild.nodeType == node.TEXT_NODE:
                node.firstChild.nodeValue = desc_text
            else:
                while node.firstChild:
                    node.removeChild(node.firstChild)
                node.appendChild(doc.createTextNode(desc_text))
        else:
            node.appendChild(doc.createTextNode(desc_text))
    else:
        desc_el = doc.createElement("description")
        desc_el.appendChild(doc.createTextNode(desc_text))
        elem.appendChild(desc_el)

def _get_fdt_number(node) -> int:
    """Walk up parent nodes to find FDT number (e.g. FDT 01 -> 1, FDT 2 -> 2). Default is 1."""
    curr = node
    while curr and curr.nodeName != "Document":
        if curr.nodeName == "Folder":
            name = _name_of(curr).upper()
            m = re.search(r"FDT\s*0*(\d+)", name)
            if m:
                return int(m.group(1))
        curr = curr.parentNode
    return 1

def _sort_placemarks(folder, pattern: str, prefix: str, root_letter: Optional[str], doc: minidom.Document):
    """Sort and rename FAT placemarks inside a folder sequentially."""
    placemarks = folder.getElementsByTagName("Placemark")
    numbered = []
    for pm in placemarks:
        name = _name_of(pm)
        match = re.search(pattern, name)
        num = int(match.group(1)) if match else None
        if num is not None:
            numbered.append((num, pm))
            
    numbered.sort(key=lambda x: x[0])
    
    for idx, (_, pm) in enumerate(numbered, 1):
        letter = root_letter if root_letter else "A"
        new_name = f"{prefix}.{letter}{str(idx).zfill(2)}"
        _set_placemark_name(pm, new_name, doc)

# ---------------------------------------------------------------------------
# Engine Class
# ---------------------------------------------------------------------------

class InsertCodingEngine:
    def __init__(self):
        self.doc: Optional[minidom.Document] = None
        self.input_filename = ""
        self._is_kmz = False
        self._kmz_bytes: Optional[bytes] = None

    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict[str, Any]:
        self.input_filename = filename
        self._is_kmz = is_kmz

        if is_kmz:
            self._kmz_bytes = content
            with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
                kml_names = [f for f in kmz.namelist() if f.lower().endswith(".kml")]
                if not kml_names:
                    return {"status": "error", "message": "Tidak ada file KML di dalam KMZ"}
                with kmz.open(kml_names[0]) as kml_file:
                    raw = kml_file.read().decode("utf-8", errors="ignore")
        else:
            raw = content.decode("utf-8", errors="ignore")

        # Strip namespace prefixes for uniform DOM access
        cleaned = re.sub(r"<(/?)[\w\-]+:", r"<\1", raw)
        self.doc = minidom.parseString(cleaned.encode("utf-8"))
        return {"status": "success"}

    def process(self, prefixes: Dict[int, str]) -> Dict[str, Any]:
        if not self.doc:
            return {"status": "error", "message": "KML belum di-load"}

        doc = self.doc
        folders = doc.getElementsByTagName("Folder")
        new_pole_folders = defaultdict(lambda: defaultdict(list))
        line_folders = []

        # Step 1: Collect LINE [A-Z] folders
        for folder in folders:
            try:
                folder_name = _name_of(folder).upper()
                if re.match(r"LINE\s+[A-Z]", folder_name):
                    line_folders.append(folder)
            except Exception:
                continue

        # Step 2: Process BOUNDARY HP cover matching
        for line_folder in line_folders:
            try:
                line_name = _name_of(line_folder).upper()
            except Exception:
                line_name = ""

            match = re.search(r"LINE\s+([A-Z])", line_name)
            line_letter = match.group(1) if match else None
            if not line_letter:
                continue

            hp_cover_folder = None
            boundary_folder = None
            subfolders = line_folder.getElementsByTagName("Folder")
            for sub in subfolders:
                try:
                    sub_name = _name_of(sub).upper()
                except Exception:
                    sub_name = ""
                if "HP COVER" in sub_name:
                    hp_cover_folder = sub
                elif "BOUNDARY" in sub_name:
                    boundary_folder = sub

            if boundary_folder and hp_cover_folder:
                hp_subs = hp_cover_folder.getElementsByTagName("Folder")
                boundary_subs = boundary_folder.getElementsByTagName("Folder")

                for b_sub in boundary_subs:
                    try:
                        b_sub_name = _name_of(b_sub).upper()
                    except Exception:
                        b_sub_name = ""

                    if "CLUSTER" in b_sub_name:
                        continue

                    matching_hp = None
                    for h_sub in hp_subs:
                        try:
                            h_name = _name_of(h_sub).upper()
                        except Exception:
                            h_name = ""
                        if b_sub_name == h_name:
                            matching_hp = h_sub
                            break

                    total_hp = 0
                    if matching_hp:
                        total_hp = len(matching_hp.getElementsByTagName("Placemark"))

                    if total_hp > 0:
                        desc_text = f"{total_hp} HP"
                    else:
                        continue

                    _set_element_description(b_sub, desc_text, doc)

        # Step 3: Process FDT, FAT, CABLE, and NEW POLE
        for folder in folders:
            try:
                folder_name = _name_of(folder)
            except Exception:
                folder_name = ""
            
            placemarks = folder.getElementsByTagName("Placemark")

            if "BOUNDARY CLUSTER" in folder_name.upper():
                continue

            if "FDT" in folder_name.upper():
                for pm in placemarks:
                    try:
                        fdt_num = _get_fdt_number(pm)
                        prefix = prefixes.get(fdt_num) or prefixes.get(1) or "DEFAULT"
                        orig_name = _name_of(pm)
                        new_name = re.sub(r'\bFDT\b|FDT', prefix, orig_name, flags=re.IGNORECASE)
                        _set_placemark_name(pm, new_name, doc)
                    except Exception:
                        continue

            elif "FAT" in folder_name.upper():
                parent = folder.parentNode
                root_letter = None
                while parent and parent.nodeName != "Document":
                    if parent.nodeName == "Folder":
                        try:
                            parent_name = _name_of(parent).upper()
                        except Exception:
                            parent_name = ""
                        match = re.search(r"LINE\s+([A-Z])", parent_name)
                        if match:
                            root_letter = match.group(1)
                            break
                    parent = parent.parentNode
                
                fdt_num = _get_fdt_number(folder)
                prefix = prefixes.get(fdt_num) or prefixes.get(1) or "DEFAULT"
                _sort_placemarks(folder, r"[A-Z](\d+)", prefix=prefix, root_letter=root_letter, doc=doc)

            elif "CABLE" in folder_name.upper() or "DISTRIBUTION" in folder_name.upper():
                for pm in placemarks:
                    try:
                        fdt_num = _get_fdt_number(pm)
                        prefix = prefixes.get(fdt_num) or prefixes.get(1) or "DEFAULT"
                        orig_name = _name_of(pm)
                        if not orig_name.startswith(f"{prefix} - "):
                            new_name = f"{prefix} - {orig_name}"
                            _set_placemark_name(pm, new_name, doc)
                    except Exception:
                        continue

            elif "NEW POLE" in folder_name.upper():
                fdt_num = _get_fdt_number(folder)
                new_pole_folders[fdt_num][folder_name].append(folder)

        # Step 4: Renumber NEW POLE globally per FDT Group
        for fdt_num, folders_by_name in new_pole_folders.items():
            prefix = prefixes.get(fdt_num) or prefixes.get(1) or "DEFAULT"
            prefix_short = prefix.rsplit(".", 1)[0]
            
            all_poles = []
            for folder_group in folders_by_name.values():
                for folder in folder_group:
                    for pm in folder.getElementsByTagName("Placemark"):
                        name = _name_of(pm)
                        
                        # Extract existing number
                        m = re.search(r"\.P(\d+)$", name)
                        num = int(m.group(1)) if m else None
                        
                        if num is None:
                            # Fallbacks
                            m2 = re.search(r"(\d+)$", name)
                            if m2:
                                num = int(m2.group(1))
                            else:
                                digits = re.findall(r"\d+", name)
                                if digits:
                                    num = int(digits[-1])
                                    
                        all_poles.append((num, pm, name))
            
            # Sort poles: numbered first, then stable sort by original name
            all_poles.sort(key=lambda x: (x[0] if x[0] is not None else 999999, x[2]))
            
            for idx, (_, pm, _) in enumerate(all_poles, 1):
                try:
                    new_name = f"MR.{prefix_short}.P{str(idx).zfill(3)}"
                    _set_placemark_name(pm, new_name, doc)
                except Exception:
                    continue

        # Build KMZ/KML bytes
        output_bytes = self._build_kmz()
        base = self.input_filename.rsplit(".", 1)[0]
        output_filename = f"{base}_renamed.kmz"

        return {
            "status": "success",
            "filename": output_filename,
            "content": output_bytes,
            "content_type": "application/vnd.google-earth.kmz",
        }

    def _build_kmz(self) -> bytes:
        kml_str = self.doc.toxml(encoding="utf-8")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as kmz_out:
            if self._is_kmz and self._kmz_bytes:
                with zipfile.ZipFile(io.BytesIO(self._kmz_bytes), "r") as kmz_in:
                    for item in kmz_in.namelist():
                        if not item.lower().endswith(".kml"):
                            kmz_out.writestr(item, kmz_in.read(item))
            kmz_out.writestr("doc.kml", kml_str)
        buf.seek(0)
        return buf.read()


def process_insert_coding(
    kml_content: bytes,
    filename: str,
    prefixes: Dict[int, str],
    is_kmz: bool = False,
) -> Dict[str, Any]:
    engine = InsertCodingEngine()
    load_result = engine.load_kml(kml_content, filename, is_kmz)
    if load_result.get("status") == "error":
        return load_result
    return engine.process(prefixes)
