"""
Pole Auto-Sorter Engine (Name-based sorting)
=============================================
Automatically renumber NEW POLE and EXISTING POLE placemarks in KML/KMZ files.
Sorts poles based on the existing numbering in their names, closing any gaps.
"""

import io
import re
import zipfile
from typing import Dict, List, Tuple, Optional, Any
from xml.dom import minidom


# ---------------------------------------------------------------------------
# Constants: keyword matchers
# ---------------------------------------------------------------------------

NEW_POLE_KEYWORDS = [
    "new pole", "np", "tiang baru", "new tiang",
]

EXISTING_POLE_KEYWORDS = [
    "existing pole", "ext pole", "eksisting pole",
    "pole eksisting", "eksisting", "existing",
]

# Regex matching numbers at the end of the name. e.g. .P012 or .E123 or just 123
NUM_SUFFIX_RE = re.compile(r"(.*?[.\-_/\\]?[PpEe]?)(\d{1,4})$")

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

def _contains_any(text: str, keywords: List[str]) -> bool:
    t = text.lower()
    return any(kw in t for kw in keywords)

def _is_new_pole_folder(name: str) -> bool:
    return _contains_any(name, NEW_POLE_KEYWORDS)

def _is_existing_pole_folder(name: str) -> bool:
    return _contains_any(name, EXISTING_POLE_KEYWORDS)

def _get_direct_child_folders(elem) -> List:
    """Return only direct child Folder or Document elements."""
    folders = []
    for child in elem.childNodes:
        if getattr(child, "tagName", None) in ("Folder", "Document"):
            folders.append(child)
    return folders

def _get_all_placemarks_recursive(elem) -> List:
    """Recursively collect all Placemark elements."""
    result = []
    for child in elem.childNodes:
        tag = getattr(child, "tagName", None)
        if tag == "Placemark":
            result.append(child)
        elif tag in ("Folder", "Document"):
            result.extend(_get_all_placemarks_recursive(child))
    return result

def _set_placemark_name(pm, new_name: str, doc: minidom.Document):
    """Set (or create) the <name> element of a Placemark."""
    name_nodes = [c for c in pm.childNodes if getattr(c, "tagName", None) == "name"]
    if name_nodes:
        node = name_nodes[0]
        if node.firstChild:
            # If it's a TextNode, just update
            if node.firstChild.nodeType == node.TEXT_NODE:
                node.firstChild.nodeValue = new_name
            else:
                # If it's CDATA or something else, replace the children
                while node.firstChild:
                    node.removeChild(node.firstChild)
                node.appendChild(doc.createTextNode(new_name))
        else:
            node.appendChild(doc.createTextNode(new_name))
    else:
        name_el = doc.createElement("name")
        name_el.appendChild(doc.createTextNode(new_name))
        pm.insertBefore(name_el, pm.firstChild)

# ---------------------------------------------------------------------------
# Core sorting logic
# ---------------------------------------------------------------------------

def _extract_number(name: str) -> Optional[int]:
    """Extract the trailing number from a pole name."""
    m = NUM_SUFFIX_RE.match(name.strip())
    if m:
        return int(m.group(2))
    # Fallback to finding any digits
    matches = re.findall(r"\d+", name)
    if matches:
        return int(matches[-1])
    return None

def _extract_prefix_and_pad(name: str) -> Tuple[str, int]:
    """Extract the prefix string and the zero-padding length."""
    m = NUM_SUFFIX_RE.match(name.strip())
    if m:
        return m.group(1), len(m.group(2))
    return "P", 3

def _sort_and_renumber_poles(
    pole_folders: List,
    doc: minidom.Document,
) -> Dict[str, Any]:
    """
    Sort poles by their existing number, renumber globally, and return report data.
    """
    poles = []
    for folder in pole_folders:
        for pm in _get_all_placemarks_recursive(folder):
            name = _name_of(pm)
            num = _extract_number(name)
            poles.append((num, pm, name))

    total_found = len(poles)

    if total_found == 0:
        return {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}

    # Sort: poles with a number first (sorted by num), then poles without a number (placed at end)
    # The secondary sort key is the original name to ensure stable sorting
    sorted_poles = sorted(
        poles, 
        key=lambda x: (x[0] if x[0] is not None else 999999, x[2])
    )

    unlinked_count = sum(1 for p in sorted_poles if p[0] is None)

    # Determine prefix and padding from the very first valid pole in the sorted list
    prefix, pad = "P", 3
    for p in sorted_poles:
        if p[2] and p[0] is not None:
            prefix, pad = _extract_prefix_and_pad(p[2])
            break
    # If no poles have numbers, use the first name as a fallback or a default
    if all(p[0] is None for p in sorted_poles) and sorted_poles[0][2]:
        # just use default P001 if we really can't extract anything
        pass 

    # Apply renaming sequentially
    for i, (_, pm, _) in enumerate(sorted_poles, start=1):
        new_name = f"{prefix}{str(i).zfill(pad)}"
        _set_placemark_name(pm, new_name, doc)

    return {
        "found": total_found,
        "sorted": total_found,
        "unlinked": unlinked_count,
        "warnings": []
    }

# ---------------------------------------------------------------------------
# Line Group detection
# ---------------------------------------------------------------------------

class LineGroup:
    def __init__(self, folder, name: str):
        self.folder = folder
        self.name = name
        self.new_pole_folders: List = []
        self.existing_pole_folders: List = []


def _detect_line_groups(doc_element) -> List[LineGroup]:
    groups: List[LineGroup] = []

    def _scan(node, depth=0):
        child_folders = _get_direct_child_folders(node)
        new_pole_subs = [f for f in child_folders if _is_new_pole_folder(_name_of(f))]
        existing_subs = [f for f in child_folders if _is_existing_pole_folder(_name_of(f))]

        if getattr(node, "tagName", None) in ("Folder", "Document") and (new_pole_subs or existing_subs):
            g = LineGroup(node, _name_of(node))
            g.new_pole_folders = new_pole_subs
            g.existing_pole_folders = existing_subs
            groups.append(g)
            return

        for child in node.childNodes:
            tag = getattr(child, "tagName", None)
            if tag in ("Folder", "Document"):
                _scan(child, depth + 1)

    _scan(doc_element)
    return groups

# ---------------------------------------------------------------------------
# Main Engine Class
# ---------------------------------------------------------------------------

def _extract_fdt_id(name: str) -> str:
    """Extract FDT identifier from group name (e.g., 'LINE A FDT 02' -> 'FDT 02')."""
    m = re.search(r'(FDT\s*[\w\d]+)', name, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return name.upper()

class PoleSorterEngine:
    def __init__(self):
        self.doc: Optional[minidom.Document] = None
        self.input_filename = ""
        self._is_kmz = False
        self._kmz_bytes: Optional[bytes] = None

    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict:
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

    def process(self) -> Dict:
        if not self.doc:
            return {"status": "error", "message": "KML belum di-load"}

        doc_elem = self.doc.documentElement
        line_groups = _detect_line_groups(doc_elem)

        if not line_groups:
            return {
                "status": "error",
                "message": "Tidak ditemukan folder NEW POLE atau EXISTING POLE. "
                           "Pastikan nama folder mengandung kata kunci: "
                           "new pole, np, tiang baru, existing pole, eksisting, dll.",
            }

        # Gabungkan LineGroup yang memiliki FDT yang sama
        fdt_groups = {}
        for group in line_groups:
            fdt_id = _extract_fdt_id(group.name)
            if fdt_id not in fdt_groups:
                fdt_groups[fdt_id] = {
                    "names": [],
                    "new_pole_folders": [],
                    "existing_pole_folders": []
                }
            fdt_groups[fdt_id]["names"].append(group.name)
            fdt_groups[fdt_id]["new_pole_folders"].extend(group.new_pole_folders)
            fdt_groups[fdt_id]["existing_pole_folders"].extend(group.existing_pole_folders)

        report_groups: List[Dict] = []

        for fdt_id, data in fdt_groups.items():
            
            # Sort NEW POLE
            new_pole_report: Dict[str, Any] = {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}
            if data["new_pole_folders"]:
                new_pole_report = _sort_and_renumber_poles(data["new_pole_folders"], self.doc)

            # Sort EXISTING POLE
            existing_report: Dict[str, Any] = {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}
            if data["existing_pole_folders"]:
                existing_report = _sort_and_renumber_poles(data["existing_pole_folders"], self.doc)

            report_groups.append({
                "group": " + ".join(data["names"]),
                "sort_method": "name_order",
                "new_pole": new_pole_report,
                "existing_pole": existing_report,
            })

        output_bytes = self._build_kmz()
        base = self.input_filename.rsplit(".", 1)[0]
        output_filename = f"{base}_sorted.kmz"

        return {
            "status": "success",
            "filename": output_filename,
            "content": output_bytes,
            "content_type": "application/vnd.google-earth.kmz",
            "report": {
                "total_groups": len(report_groups),
                "groups": report_groups,
            },
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


def process_pole_sorter(
    kml_content: bytes,
    filename: str,
    is_kmz: bool = False,
) -> Dict[str, Any]:
    engine = PoleSorterEngine()
    load_result = engine.load_kml(kml_content, filename, is_kmz)
    if load_result.get("status") == "error":
        return load_result
    return engine.process()
