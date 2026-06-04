"""
Utility functions for KML processing
"""
import math
import re
import zipfile
import io
from typing import Tuple, Optional, Dict, Any, List
from xml.dom import minidom
from lxml import etree


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates using Haversine formula."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_localname(elem) -> Optional[str]:
    """Safely get the local name of an XML element."""
    try:
        if hasattr(elem, 'tag'):
            if isinstance(elem.tag, str):
                if "}" in elem.tag:
                    return elem.tag.split("}", 1)[1]
                return elem.tag
    except Exception:
        pass
    return None


def clean_xml_prefixes(xml_text: str) -> str:
    """Remove namespace prefixes from XML content."""
    return re.sub(r"<(/?)([\w\-]+):", r"<\1", xml_text)


def parse_kml_content(content: bytes, is_kmz: bool = False) -> minidom.Document:
    """Parse KML content from bytes."""
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_name = [f for f in kmz.namelist() if f.endswith(".kml")][0]
            with kmz.open(kml_name) as kml_file:
                raw_text = kml_file.read().decode("utf-8", errors="ignore")
                cleaned_text = clean_xml_prefixes(raw_text)
                return minidom.parseString(cleaned_text)
    else:
        raw_text = content.decode("utf-8", errors="ignore")
        cleaned_text = clean_xml_prefixes(raw_text)
        return minidom.parseString(cleaned_text)


def parse_kml_lxml(content: bytes, is_kmz: bool = False) -> etree.ElementTree:
    """Parse KML content using lxml."""
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_name = [f for f in kmz.namelist() if f.endswith(".kml")][0]
            with kmz.open(kml_name) as kml_file:
                content = kml_file.read()
    
    return etree.parse(io.BytesIO(content), parser)


def get_folder_name(folder) -> str:
    """Extract name from a KML Folder element."""
    names = folder.getElementsByTagName("name")
    if names and names[0].firstChild:
        return names[0].firstChild.nodeValue.strip()
    return ""


def parse_coords(text: str) -> List[Tuple[float, float]]:
    """Parse coordinate string into list of (lat, lon) tuples."""
    coords = []
    for line in text.strip().split():
        parts = [p for p in line.split(",") if p]
        if len(parts) >= 2:
            try:
                lon, lat = map(float, parts[:2])
                coords.append((lat, lon))
            except ValueError:
                continue
    return coords


def clean_project_name(filename: str) -> str:
    """Clean project name from filename."""
    filename = re.sub(r"\.(kml|kmz)$", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"^[A-Z]{2,}\d+\s*", "", filename, flags=re.IGNORECASE)
    return filename.strip()


def find_all_folders(node) -> List:
    """Recursively find all Folder elements in a DOM node."""
    folders = []
    if hasattr(node, "tagName") and node.tagName == "Folder":
        folders.append(node)
    for child in getattr(node, "childNodes", []):
        if getattr(child, "nodeType", None) == getattr(child, "ELEMENT_NODE", 1):
            folders.extend(find_all_folders(child))
    return folders