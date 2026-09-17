"""
Utility functions for KML processing
"""
import math
import re
import zipfile
import io
from typing import Tuple, Optional, Dict, Any, List
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
# minidom & xml.etree bawaan Python rentan terhadap serangan ini.
from xml.dom import minidom
from defusedxml.minidom import parseString as safe_parse_string
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
    """Remove namespace prefixes from XML content.

    Catatan: regex ini hanya menyentuh TAG. Atribut berprefix seperti
    kml:id="..." tidak tersentuh, padahal atribut itu sendiri sudah cukup
    untuk memicu 'unbound prefix'. Karena itu ia dipakai BERSAMA
    repair_unbound_prefixes(), bukan sebagai gantinya.
    """
    return re.sub(r"<(/?)([\w\-]+):", r"<\1", xml_text)


# Prefix yang lazim muncul di berkas KML dunia nyata. Google Earth Pro
# menulis <gx:CascadingStyle kml:id="..."> dan mendeklarasikan xmlns-nya di
# elemen akar — tetapi berkas yang sudah pernah disunting tangan, dipotong,
# atau dihasilkan ulang oleh perkakas lain kerap kehilangan deklarasi itu
# sementara isinya tetap memakai prefiksnya.
WELL_KNOWN_KML_NS = {
    "gx": "http://www.google.com/kml/ext/2.2",
    "kml": "http://www.opengis.net/kml/2.2",
    "atom": "http://www.w3.org/2005/Atom",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xal": "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0",
}


def _find_root_tag_span(text: str) -> Optional[Tuple[int, int]]:
    """Posisi '<' dan '>' dari tag pembuka elemen akar.

    Melewati deklarasi XML, komentar, dan DOCTYPE. Pencarian '>' menghormati
    tanda kutip, supaya nilai atribut yang memuat '>' tidak memotong tag
    terlalu awal.
    """
    i, n = 0, len(text)
    while i < n:
        lt = text.find("<", i)
        if lt == -1:
            return None
        nxt = text[lt + 1:lt + 2]
        if nxt == "?":                      # <?xml ... ?>
            end = text.find("?>", lt)
            i = lt + 2 if end == -1 else end + 2
            continue
        if nxt == "!":                      # <!-- ... --> atau <!DOCTYPE ...>
            if text.startswith("<!--", lt):
                end = text.find("-->", lt)
                i = lt + 4 if end == -1 else end + 3
            else:
                end = text.find(">", lt)
                i = lt + 2 if end == -1 else end + 1
            continue
        j, quote = lt + 1, ""
        while j < n:
            ch = text[j]
            if quote:
                if ch == quote:
                    quote = ""
            elif ch in "\"'":
                quote = ch
            elif ch == ">":
                return lt, j
            j += 1
        return None
    return None


def repair_unbound_prefixes(xml_text: str) -> str:
    """Deklarasikan prefix namespace yang dipakai tapi tidak pernah diumumkan.

    Parser XML menolak SELURUH dokumen begitu menemukan satu prefix yang
    tidak dideklarasikan ('unbound prefix'), meskipun sisa berkasnya
    sempurna. Google Earth sendiri memaafkan hal ini, dan pengguna kami
    mengunggah berkas apa adanya dari lapangan — menolak seluruh pekerjaan
    karena satu deklarasi yang hilang bukan perilaku yang benar.

    Prefix yang dikenal dipetakan ke URI resminya sehingga isinya tetap
    bermakna. Prefix asing tetap dideklarasikan dengan URI penampung agar
    dokumennya bisa dibaca, bukan dibuang.

    Mengembalikan teks apa adanya kalau tidak ada yang perlu diperbaiki.
    """
    dipakai = set(re.findall(r"<\s*/?\s*([A-Za-z_][\w.\-]*):", xml_text))
    # Atribut berprefix — 'xmlns:' sengaja disaring keluar.
    dipakai |= {
        p for p in re.findall(r"\s([A-Za-z_][\w.\-]*):[\w.\-]+\s*=\s*[\"']", xml_text)
        if p != "xmlns"
    }

    dideklarasikan = set(re.findall(r"xmlns:([\w.\-]+)\s*=", xml_text))
    hilang = dipakai - dideklarasikan - {"xml", "xmlns"}
    if not hilang:
        return xml_text

    span = _find_root_tag_span(xml_text)
    if span is None:
        return xml_text
    _, gt = span

    # Tag kosong (<kml ... />) menaruh '/' tepat sebelum '>'.
    sisip = gt - 1 if gt > 0 and xml_text[gt - 1] == "/" else gt

    deklarasi = "".join(
        ' xmlns:{}="{}"'.format(p, WELL_KNOWN_KML_NS.get(p, "urn:x-unresolved:" + p))
        for p in sorted(hilang)
    )
    return xml_text[:sisip] + deklarasi + xml_text[sisip:]


def normalize_kml_text(raw_text: str) -> str:
    """Bersihkan prefix pada tag, lalu deklarasikan sisa prefix yang yatim.

    Urutannya disengaja: clean_xml_prefixes membuang prefix dari tag, dan
    repair_unbound_prefixes membereskan yang tidak terjangkau regex itu —
    terutama atribut seperti kml:id, yang sendirian sudah cukup membuat
    parser menolak seluruh berkas.
    """
    return repair_unbound_prefixes(clean_xml_prefixes(raw_text))


def parse_kml_content(content: bytes, is_kmz: bool = False) -> minidom.Document:
    """Parse KML content from bytes."""
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_name = [f for f in kmz.namelist() if f.endswith(".kml")][0]
            with kmz.open(kml_name) as kml_file:
                raw_text = kml_file.read().decode("utf-8", errors="ignore")
    else:
        raw_text = content.decode("utf-8", errors="ignore")

    return safe_parse_string(normalize_kml_text(raw_text))


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