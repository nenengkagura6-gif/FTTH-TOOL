"""
KML APD Auto-Drafter Engine
============================
Processes KML/KMZ files for FTTH planning:
- Auto-generate FAT positions from pole/boundary analysis
- Calculate cable descriptions (route, slack, toleransi)
- Generate sling wire connections
- HP coverage mapping to boundary polygons
- Pole numbering & classification (size, existing/new)
- Folder reordering and Google Earth style injection

Adapted from standalone desktop script for cloud/server use.
"""

import io
import os
import copy
import math
import zipfile
import traceback
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
# minidom & xml.etree bawaan Python rentan terhadap serangan ini.
import xml.etree.ElementTree as ET
from xml.etree.ElementTree import ParseError
from defusedxml.ElementTree import fromstring as safe_fromstring
from collections import defaultdict
from typing import Dict, Any, List, Tuple, Optional

from utils.commons import (
    repair_unbound_prefixes, load_kml_bytes, read_kmz_attachments, fdt_number,
)
from utils.report import ProcessReport

try:
    from shapely.geometry import Point, Polygon
except ImportError:
    raise ImportError(
        "shapely is required for KML APD engine. "
        "Install it with: pip install shapely>=2.0.0"
    )


# =====================================================================
# Helpers
# =====================================================================

KML_NS = "http://www.opengis.net/kml/2.2"
# Namespace ekstensi dipertahankan (bukan dibuang) supaya gx:Track,
# atom:author, dsb. tetap sah di hasil. Prefiksnya didaftarkan agar ditulis
# sebagai gx:/atom: dan bukan ns0:/ns1:.
for _prefix, _uri in (("gx", "http://www.google.com/kml/ext/2.2"),
                      ("atom", "http://www.w3.org/2005/Atom"),
                      ("xal", "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0")):
    ET.register_namespace(_prefix, _uri)

POLE_DEDUPE_M = 10.0


def _is_kml_ns(ns: str) -> bool:
    return ns == KML_NS or ns.startswith("http://earth.google.com/kml/")


def strip_namespace(root):
    """Buang namespace KML inti supaya elemen bisa diakses tanpa prefix.

    Hanya namespace KML itu sendiri yang dibuang; namespace ekstensi (gx,
    atom) dibiarkan. Dulu SEMUA namespace dibuang dan hasilnya ditulis
    tanpa xmlns sama sekali — gx:Track berubah jadi elemen tak dikenal, dan
    tool lain (BasicMap, QGIS) tidak mengenali berkasnya sebagai KML.
    Namespace default dipasang kembali oleh restore_namespace() sebelum
    ditulis.
    """
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        if el.tag.startswith("{"):
            ns, local = el.tag[1:].split("}", 1)
            if _is_kml_ns(ns):
                el.tag = local
        for key in list(el.attrib):
            if key.startswith("{"):
                ns, local = key[1:].split("}", 1)
                if _is_kml_ns(ns):
                    el.attrib[local] = el.attrib.pop(key)


def restore_namespace(root):
    """Pasang lagi xmlns KML di elemen akar sebelum ditulis."""
    root.set("xmlns", KML_NS)


def _fdt_num_of(text: str) -> Optional[int]:
    return fdt_number(text)


class FdtIndex:
    """Koordinat FDT, dicari dengan nomornya — bukan kecocokan teks persis.

    Nama placemark FDT di lapangan beragam ('FDT 01', 'FDT-01',
    'MR.ABC.FDT01'). Dulu nama folder LINE harus sama persis dengan nama
    placemark FDT; kalau tidak, satu tahap memakai FDT pertama sementara
    tahap lain tidak memakai FDT sama sekali — arah penomoran tiang jadi acak.
    """

    def __init__(self):
        self.by_name: Dict[str, Tuple[float, float]] = {}
        self.by_num: Dict[int, Tuple[float, float]] = {}
        self.fallbacks = set()

    def add(self, name: str, lat: float, lon: float) -> None:
        self.by_name[name.upper()] = (lat, lon)
        num = _fdt_num_of(name)
        if num is not None and num not in self.by_num:
            self.by_num[num] = (lat, lon)

    def __len__(self):
        return len(self.by_name)

    def values(self):
        return self.by_name.values()

    def resolve(self, line_name: str) -> Tuple[Optional[float], Optional[float]]:
        if not self.by_name:
            return None, None
        num = _fdt_num_of(line_name)
        if num is not None and num in self.by_num:
            return self.by_num[num]
        key = get_fdt_name_from_line(line_name).upper()
        if key in self.by_name:
            return self.by_name[key]
        if len(self.by_name) > 1:
            self.fallbacks.add(line_name)
        return next(iter(self.by_name.values()))


def _direct_name(el) -> str:
    nm = el.find("name")
    return (nm.text or "").strip() if nm is not None else ""


def find_line_container(doc):
    """Elemen yang langsung memuat folder LINE.

    Google Earth membungkus hasil 'Save Place As' dalam satu folder proyek,
    sehingga folder LINE tidak lagi anak langsung <Document>. Dulu hanya
    anak langsung Document yang dicari, dan berkas seperti itu 'sukses'
    tanpa satu pun yang diproses.
    """
    queue = [doc]
    while queue:
        node = queue.pop(0)
        subs = node.findall("Folder")
        if any(_direct_name(f).upper().startswith("LINE ") for f in subs):
            return node
        queue.extend(subs)
    return doc


def scope_folders(scopes):
    """(induk, folder) untuk setiap Folder anak langsung dari tiap scope."""
    seen = set()
    for parent in scopes:
        for f in parent.findall("Folder"):
            if id(f) not in seen:
                seen.add(id(f))
                yield parent, f


def parse_kml_tolerant(raw_kml):
    """Parse KML, dengan satu percobaan pemulihan untuk prefix yatim.

    Ekspor Google Earth Pro memuat <gx:CascadingStyle kml:id="..."> dan
    mendeklarasikan xmlns-nya di elemen akar. Berkas yang sudah pernah
    disunting, dipotong, atau dihasilkan ulang oleh perkakas lain sering
    kehilangan deklarasi itu — dan parser lalu menolak SELURUH dokumen
    dengan 'unbound prefix', padahal sisa isinya utuh.

    Pemulihan hanya dicoba untuk kesalahan itu. Kesalahan lain — XML yang
    benar-benar rusak — tetap dilempar apa adanya, karena menyembunyikannya
    hanya menunda kebingungan ke tahap berikutnya.
    """
    try:
        return safe_fromstring(raw_kml)
    except ParseError as e:
        if "unbound prefix" not in str(e).lower():
            raise

        teks = (
            raw_kml.decode("utf-8", errors="ignore")
            if isinstance(raw_kml, (bytes, bytearray))
            else raw_kml
        )
        diperbaiki = repair_unbound_prefixes(teks)
        if diperbaiki == teks:
            raise

        return safe_fromstring(diperbaiki)


def parse_coords(text):
    """Parse KML coordinate string into list of (lon, lat) tuples."""
    pts = []
    if not text:
        return pts
    for c in text.strip().split():
        try:
            lon, lat = map(float, c.split(",")[:2])
            pts.append((lon, lat))
        except Exception:
            continue
    return pts


def lonlat_to_xy(lon, lat, lat0=None):
    """Convert lon/lat to approximate metric x/y coordinates."""
    if lat0 is None:
        lat0 = lat
    x = lon * 111320.0 * math.cos(math.radians(lat0))
    y = lat * 110540.0
    return x, y


def line_length_m(coords):
    """Calculate total length of a polyline in meters."""
    if not coords or len(coords) < 2:
        return 0.0
    lat0 = sum(lat for lon, lat in coords) / len(coords)
    total = 0.0
    prev = None
    for lon, lat in coords:
        x, y = lonlat_to_xy(lon, lat, lat0)
        if prev is not None:
            total += math.hypot(x - prev[0], y - prev[1])
        prev = (x, y)
    return total


def point_linestring_distance_m(point, coords):
    """Calculate minimum distance from a point to a polyline in meters."""
    if not coords:
        return float('inf')
    lat0 = point[1]
    px, py = lonlat_to_xy(point[0], point[1], lat0)
    min_d = float('inf')
    for i in range(len(coords) - 1):
        x1, y1 = lonlat_to_xy(coords[i][0], coords[i][1], lat0)
        x2, y2 = lonlat_to_xy(coords[i + 1][0], coords[i + 1][1], lat0)
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            d = math.hypot(px - x1, py - y1)
        else:
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
            cx, cy = x1 + t * dx, y1 + t * dy
            d = math.hypot(px - cx, py - cy)
        if d < min_d:
            min_d = d
    return min_d


def haversine(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance between two lat/lon points in meters."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_pole_line_projection(pole_coords, line_coords):
    """Project a pole point onto a polyline. Returns (dist_along, perp_distance)."""
    if not line_coords or len(line_coords) < 2:
        return None

    lat0 = pole_coords[1]
    px, py = lonlat_to_xy(pole_coords[0], pole_coords[1], lat0)

    min_perp_d = float('inf')
    best_dist_along = 0.0
    accum_length = 0.0

    xy_coords = []
    for lon, lat in line_coords:
        x, y = lonlat_to_xy(lon, lat, lat0)
        xy_coords.append((x, y))

    for i in range(len(xy_coords) - 1):
        x1, y1 = xy_coords[i]
        x2, y2 = xy_coords[i + 1]
        dx, dy = x2 - x1, y2 - y1
        seg_len = math.hypot(dx, dy)

        if seg_len == 0:
            d = math.hypot(px - x1, py - y1)
            dist_along = accum_length
        else:
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (seg_len * seg_len)))
            cx, cy = x1 + t * dx, y1 + t * dy
            d = math.hypot(px - cx, py - cy)
            dist_along = accum_length + t * seg_len

        if d < min_perp_d:
            min_perp_d = d
            best_dist_along = dist_along

        accum_length += seg_len

    return best_dist_along, min_perp_d


def find_or_create_folder(parent, name):
    """Find a child Folder by name, or create one."""
    for sub in parent.findall("Folder"):
        nm_el = sub.find("name")
        if nm_el is not None and (nm_el.text or "").strip().upper() == name.upper():
            return sub
    folder = ET.Element("Folder")
    nm = ET.Element("name")
    nm.text = name
    folder.append(nm)
    parent.append(folder)
    return folder


def determine_pole_style(pm):
    """Determine pole style URL based on placemark content."""
    pm_str = ET.tostring(pm).decode('utf-8').upper()
    if "9-4" in pm_str or "9M" in pm_str:
        return "#style_pole_9m_4inch"
    elif "7-4" in pm_str or "7M 4" in pm_str:
        return "#style_pole_7m_4inch"
    elif "7-3" in pm_str or "7M 3" in pm_str:
        return "#style_pole_7m_3inch"
    elif "2.5" in pm_str or "2_5" in pm_str or "7M 2.5" in pm_str:
        return "#style_pole_7m_2_5inch"
    elif "EXISTING" in pm_str or "EXST" in pm_str:
        return "#style_pole_existing"
    else:
        return "#style_pole_7m_3inch"


# =====================================================================
# Custom Styles Injection
# =====================================================================

def inject_custom_styles(doc):
    """Inject Google Earth custom styles for legend design."""
    ids_to_remove = {
        "style_pole_9m_4inch", "style_pole_7m_4inch", "style_pole_7m_3inch", "style_pole_7m_2_5inch",
        "style_pole_existing", "style_fat", "style_homepass", "style_homepass_not_cover",
        "style_slack_cable", "style_slack_existing", "style_sling_wire", "style_cable_24c",
        "style_cable_36c", "style_cable_48c", "style_fdt_96c", "style_fdt_72c", "style_fdt_48c"
    }
    for el in list(doc):
        if el.tag in ("Style", "StyleMap"):
            style_id = el.get("id")
            if style_id in ids_to_remove:
                doc.remove(el)

    styles_xml = """
    <Style id="style_pole_9m_4inch">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_4inch">
        <IconStyle><color>ff00ff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_3inch">
        <IconStyle><color>ffffff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_7m_2_5inch">
        <IconStyle><color>ffff00aa</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffff00aa</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_pole_existing">
        <IconStyle><color>ffffffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fat">
        <IconStyle><color>ff00ffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ffff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_homepass">
        <IconStyle><color>ff00ff00</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href></Icon></IconStyle>
        <LabelStyle><color>ff00ff00</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_homepass_not_cover">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_slack_cable">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.0</scale></LabelStyle>
    </Style>
    <Style id="style_slack_existing">
        <IconStyle><color>ffffffff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle>
        <LabelStyle><color>ffffffff</color><scale>0.0</scale></LabelStyle>
    </Style>
    <Style id="style_sling_wire">
        <LineStyle><color>ffffff00</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_24c">
        <LineStyle><color>ff00ff00</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_36c">
        <LineStyle><color>ffff00ff</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_cable_48c">
        <LineStyle><color>ffff00aa</color><width>3.0</width></LineStyle>
    </Style>
    <Style id="style_fdt_96c">
        <IconStyle><color>ff0000ff</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ff0000ff</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fdt_72c">
        <IconStyle><color>ff000055</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ff000055</color><scale>0.8</scale></LabelStyle>
    </Style>
    <Style id="style_fdt_48c">
        <IconStyle><color>ffff00aa</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/cross-hairs.png</href></Icon></IconStyle>
        <LabelStyle><color>ffff00aa</color><scale>0.8</scale></LabelStyle>
    </Style>
    """
    for el in ET.fromstring(f"<root>{styles_xml}</root>"):
        doc.insert(0, el)


# =====================================================================
# Per-LINE: BOUNDARY & HP COVER
# =====================================================================


def get_fdt_name_from_line(line_name):
    upper_name = line_name.upper()
    if "FDT" in upper_name:
        idx = upper_name.find("FDT")
        return line_name[idx:].strip()
    return "FDT" # Fallback

def process_boundaries_and_hp_in_line(line_folder):
    """Process boundary polygons within a LINE folder, naming them with letters."""
    nm = line_folder.find("name")
    line_name = (nm.text or "").strip() if nm is not None else "LINE"
    parts = line_name.split()
    if len(parts) >= 2 and parts[1]:
        letter = parts[1][0].upper()
    else:
        letter = (''.join(ch for ch in line_name if ch.isalpha()).upper()[:1]) or 'X'

    boundary_folder = None
    for sub in line_folder.findall("Folder"):
        sname = sub.find("name")
        if sname is not None and "BOUNDARY" in (sname.text or "").upper():
            boundary_folder = sub
            break

    polygons = []
    if boundary_folder is None:
        return polygons

    counter = 0
    for pm in list(boundary_folder.findall("Placemark")):
        coords_el = pm.find("Polygon/outerBoundaryIs/LinearRing/coordinates")
        if coords_el is None or not coords_el.text:
            continue
        coords = parse_coords(coords_el.text)
        if not coords:
            continue
        poly = Polygon([(lon, lat) for lon, lat in coords])
        counter += 1
        poly_name = f"{letter}{counter:02d}"
        nm_el = pm.find("name")
        if nm_el is None:
            nm_el = ET.Element("name")
            pm.insert(0, nm_el)
        nm_el.text = poly_name
        polygons.append((poly_name, poly, pm, letter))

    return polygons


# =====================================================================
# Move HP root
# =====================================================================

def _line_polygons(line_folder, polygons_by_line):
    line_name = _direct_name(line_folder)
    parts = line_name.split()
    letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper() if line_name else 'X'
    return polygons_by_line.get(get_fdt_name_from_line(line_name), {}).get(letter, [])


def move_root_hp_to_lines(scopes, line_folders, polygons_by_line):
    """Move HP placemarks from root HP folder into line-specific HP COVER folders.

    Mengembalikan jumlah HP yang tidak masuk boundary mana pun (HP UNCOVER).
    """
    root_hp_folder, hp_parent = None, None
    for parent, f in scope_folders(scopes):
        if _direct_name(f).upper() == "HP":
            root_hp_folder, hp_parent = f, parent
            break
    if root_hp_folder is None:
        return 0
    doc = hp_parent
    uncovered = 0

    to_remove = []
    for pm in list(root_hp_folder.findall("Placemark")):
        coords_el = pm.find("Point/coordinates")
        if coords_el is None or not coords_el.text:
            continue
        try:
            lon, lat = map(float, coords_el.text.strip().split(",")[:2])
        except Exception:
            continue
        pt = Point(lon, lat)
        placed = False

        for line_folder in line_folders:
            nm = line_folder.find("name")
            line_name = (nm.text or "").strip()
            parts = line_name.split()
            letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper() if line_name else 'X'
            fdt_name = get_fdt_name_from_line(line_name)
            
            polygons = []
            if fdt_name in polygons_by_line and letter in polygons_by_line[fdt_name]:
                polygons = polygons_by_line[fdt_name][letter]
            hp_folder = find_or_create_folder(line_folder, "HP COVER")
            for poly_name, poly, _, _ in polygons:
                if poly.distance(pt) < 2e-5:
                    subfolder = find_or_create_folder(hp_folder, poly_name)
                    # Set styleUrl to green homepass icon
                    for st in pm.findall("styleUrl"):
                        pm.remove(st)
                    st_el = ET.Element("styleUrl")
                    st_el.text = "#style_homepass"
                    pm.append(st_el)
                    subfolder.append(pm)
                    placed = True
                    break
            if placed:
                break

        if not placed and len(line_folders) > 0:
            # Masuk ke line yang boundary-nya paling dekat — dulu selalu ke
            # line pertama, meski HP-nya berada di area FDT lain.
            def jarak(lf):
                polys = _line_polygons(lf, polygons_by_line)
                return min((p[1].distance(pt) for p in polys), default=float("inf"))
            target_line = min(line_folders, key=jarak)
            hp_folder = find_or_create_folder(target_line, "HP UNCOVER")
            uncovered += 1
            for st in pm.findall("styleUrl"):
                pm.remove(st)
            st_el = ET.Element("styleUrl")
            st_el.text = "#style_homepass_not_cover"
            pm.append(st_el)
            hp_folder.append(pm)

        to_remove.append(pm)

    # Remove after iteration to avoid modifying during iteration
    for pm in to_remove:
        try:
            root_hp_folder.remove(pm)
        except ValueError:
            pass

    if len(list(root_hp_folder.findall("Placemark"))) == 0:
        try:
            doc.remove(root_hp_folder)
        except ValueError:
            pass
    return uncovered


# =====================================================================
# Update Boundary Descriptions
# =====================================================================

def update_boundary_descriptions(line_folders, polygons_by_line):
    """Update boundary polygon descriptions with HP count."""
    for line_folder in line_folders:
        line_name = _direct_name(line_folder)
        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (line_name or "")[0].upper()
        fdt_name = get_fdt_name_from_line(line_name)
        polygons = polygons_by_line.get(fdt_name, {}).get(letter, [])
        hp_folder = None
        for sub in line_folder.findall("Folder"):
            sname = sub.find("name")
            if sname is not None and "HP COVER" in (sname.text or "").upper():
                hp_folder = sub
                break
        if hp_folder is None:
            continue
        for poly_name, poly, pm, letter in polygons:
            subfolder = find_or_create_folder(hp_folder, poly_name)
            jumlah = len(subfolder.findall("Placemark"))
            desc_el = pm.find("description")
            if desc_el is None:
                desc_el = ET.Element("description")
                pm.append(desc_el)
            desc_el.text = f"{jumlah} HP"


# =====================================================================
# FAT / CABLE / SLINGWIRE per LINE
# =====================================================================

def _is_cable_folder(name: str) -> bool:
    u = (name or "").upper()
    return ("DISTRIBUTION" in u or "CABLE" in u or "KABEL" in u) and "SLING" not in u


def process_fat_cable_sling_for_line(line_folder, polygons, global_poles, fdt_count,
                                     doc, line_folders, fdt_lat, fdt_lon,
                                     tol_m_pole_line=5.0, report=None):
    """Process FAT placement, cable descriptions, and sling wire for a single LINE folder."""
    dist_lines = []
    cable_pms = []
    nm = line_folder.find("name")
    line_name = (nm.text or "").strip() if nm is not None else "LINE"
    for sub in line_folder.findall("Folder"):
        sname = sub.find("name")
        if sname is None:
            continue
        # HANYA folder kabel distribusi. Dulu setiap LineString di sub-folder
        # mana pun ikut diperlakukan sebagai kabel — termasuk SLING WIRE —
        # sehingga saat diproses ulang semua sling berganti nama jadi
        # "CABLE LINE ..." dan ikut mendapat slack.
        if not _is_cable_folder(sname.text):
            continue
        for pm in sub.findall("Placemark"):
            coords_el = pm.find("LineString/coordinates")
            if coords_el is None or not coords_el.text:
                continue
            coords = parse_coords(coords_el.text)
            if not coords:
                continue
            dist_lines.append(coords)
            cable_pms.append(pm)

    poles = []
    for pm_pole, parent, lon, lat, is_exist in global_poles:
        pt = Point(lon, lat)
        for poly_name, poly, poly_pm, letter in polygons:
            if poly.distance(pt) < 2e-5:
                poles.append({"pm": pm_pole, "lon": lon, "lat": lat, "poly": poly_name, "is_exist": is_exist})
                break

    fat_folder = find_or_create_folder(line_folder, "FAT")
    for pm in list(fat_folder.findall("Placemark")):
        fat_folder.remove(pm)
    fat_count = 0
    fat_points = []
    no_fat = []
    for poly_name, poly, poly_pm, letter in polygons:
        candidates = []
        for p in poles:
            if p["poly"] != poly_name:
                continue
            for dline in dist_lines:
                if point_linestring_distance_m((p["lon"], p["lat"]), dline) <= tol_m_pole_line:
                    candidates.append(p)
                    break
        if not candidates:
            no_fat.append(poly_name)
            continue
        cx, cy = poly.centroid.x, poly.centroid.y
        best, best_d = None, float('inf')
        for c in candidates:
            d = (c["lon"] - cx) ** 2 + (c["lat"] - cy) ** 2
            if d < best_d:
                best, best_d = c, d
        if best is not None:
            new_pm = ET.fromstring(ET.tostring(best["pm"]))
            nm_el = new_pm.find("name")
            if nm_el is None:
                nm_el = ET.Element("name")
                new_pm.insert(0, nm_el)
            nm_el.text = poly_name
            for st in new_pm.findall("styleUrl"):
                new_pm.remove(st)
            st_el = ET.Element("styleUrl")
            st_el.text = "#style_fat"
            new_pm.append(st_el)
            fat_folder.append(new_pm)
            fat_count += 1
            fat_points.append((best["lon"], best["lat"]))

    if report is not None and no_fat:
        report.warn(f"{line_name}: boundary tanpa FAT karena tidak ada tiang dalam "
                    f"{tol_m_pole_line:.0f} m dari kabel distribusi", no_fat)

    # CABLE processing
    n_poly = len(polygons)
    fo_text = "FO 24C/2T" if n_poly <= 10 else ("FO 36C/3T" if n_poly <= 15 else "FO 48C/4T")
    if report is not None and n_poly > 20:
        report.warn(f"{line_name}: {n_poly} boundary FAT melebihi kapasitas kabel 48C/4T")
    served = set()
    poles_list = poles[:]

    # Slack dibagi ke segmen kabel yang tepat. Dulu SETIAP segmen mendapat
    # slack seluruh FAT di line, ditambah slack SEMUA FDT di dokumen —
    # line dengan dua segmen kabel menghitung slack dua kali lipat.
    cable_geoms = []
    for pm in cable_pms:
        ls = pm.find("LineString")
        coords_el = ls.find("coordinates") if ls is not None else None
        pts = parse_coords(coords_el.text) if coords_el is not None and coords_el.text else []
        cable_geoms.append(pts if len(pts) >= 2 else None)
    valid_idx = [i for i, g in enumerate(cable_geoms) if g]
    fdt_slack = defaultdict(int)
    fat_slack = defaultdict(int)
    if valid_idx:
        if fdt_lat is not None:
            nearest = min(valid_idx, key=lambda i: point_linestring_distance_m((fdt_lon, fdt_lat), cable_geoms[i]))
        else:
            nearest = valid_idx[0]
        fdt_slack[nearest] = 1
        for fp in fat_points:
            j = min(valid_idx, key=lambda i: point_linestring_distance_m(fp, cable_geoms[i]))
            fat_slack[j] += 1

    for ci, pm in enumerate(cable_pms):
        pts = cable_geoms[ci]
        if not pts:
            continue

        total_route = int(round(line_length_m(pts)))

        for i, p in enumerate(poles_list):
            if point_linestring_distance_m((p["lon"], p["lat"]), pts) <= 10:
                served.add(i)

        n_fdt_slack, n_fat_slack = fdt_slack[ci], fat_slack[ci]
        total_slack_units = n_fdt_slack + n_fat_slack
        total_slack = total_slack_units * 20
        toleransi = int(round((total_route + total_slack) * 0.03))
        total_length = total_route + total_slack + toleransi

        nm_el = pm.find("name")
        if nm_el is None:
            nm_el = ET.Element("name")
            pm.insert(0, nm_el)

        orig_name = nm_el.text or ""
        suffix = ""
        if ")" in orig_name:
            suffix = orig_name.split(")", 1)[1]
        else:
            idx = orig_name.upper().find(line_name.upper())
            if idx != -1:
                suffix_part = orig_name[idx + len(line_name):]
                if "-" in suffix_part:
                    suffix = suffix_part[suffix_part.find("-"):]

        nm_el.text = f"CABLE {line_name} ({fo_text}){suffix}"

        if "24" in fo_text:
            cable_style = "#style_cable_24c"
        elif "36" in fo_text:
            cable_style = "#style_cable_36c"
        else:
            cable_style = "#style_cable_48c"

        for st in pm.findall("styleUrl"):
            pm.remove(st)
        st_el = ET.Element("styleUrl")
        st_el.text = cable_style
        pm.append(st_el)

        desc = pm.find("description")
        if desc is None:
            desc = ET.Element("description")
            pm.append(desc)
        desc.text = (
            f"Total Route : {total_route} m\n"
            f"Total Slack : {total_slack_units} unit ({n_fdt_slack} slack FDT & {n_fat_slack} slack FAT) @20 m\n"
            f"Toleransi : {toleransi} m\n\n"
            f"Total Length Cable  : {total_route} + {total_slack} + {toleransi}  : {total_length} m"
        )

    # SLING WIRE generation
    sling_folder = find_or_create_folder(line_folder, "SLING WIRE")
    # Sling hasil proses sebelumnya dibuang dulu supaya proses ulang tidak
    # menggandakannya. Sling yang digambar tangan (style lain) dibiarkan.
    for old in list(sling_folder.findall("Placemark")):
        st = old.find("styleUrl")
        if st is not None and (st.text or "").strip() == "#style_sling_wire":
            sling_folder.remove(old)
    connections = []

    if served:
        connected = set(served)
        unconnected = {i for i in range(len(poles_list)) if i not in served}

        while unconnected:
            best_p, best_q, best_d = None, None, float('inf')
            for p_idx in unconnected:
                p = poles_list[p_idx]
                for q_idx in connected:
                    q = poles_list[q_idx]
                    d = line_length_m([(p["lon"], p["lat"]), (q["lon"], q["lat"])])
                    if d < best_d:
                        best_d = d
                        best_p = p_idx
                        best_q = q_idx
            if best_p is not None and best_d <= 60.0:
                connections.append((best_p, best_q, best_d, poles_list[best_p], poles_list[best_q]))
                unconnected.remove(best_p)
                connected.add(best_p)
            else:
                break

    created = set()
    for p_idx, q_idx, best_d, p, q in connections:
        key = tuple(sorted((p_idx, q_idx)))
        if key in created:
            continue
        created.add(key)

        pm_ls = ET.Element("Placemark")
        nm_sw = ET.Element("name")
        nm_sw.text = f"{int(round(best_d))} m"
        pm_ls.append(nm_sw)

        st_el = ET.Element("styleUrl")
        st_el.text = "#style_sling_wire"
        pm_ls.append(st_el)

        ls = ET.Element("LineString")
        tess = ET.Element("tessellate")
        tess.text = "1"
        ls.append(tess)
        coords_sw = ET.Element("coordinates")
        coords_sw.text = f"{p['lon']},{p['lat']},0 {q['lon']},{q['lat']},0"
        ls.append(coords_sw)
        pm_ls.append(ls)

        sling_folder.append(pm_ls)

    return fat_count


# =====================================================================
# POLE Numbering (global)
# =====================================================================

def _renamed_pole(pm, name: str, style_url: str):
    """Salinan placemark tiang asli dengan nama & style baru.

    Dulu tiang dibuat ulang hanya dari nama + koordinat, sehingga
    description, ExtendedData, dan catatan survei lain ikut hilang.
    """
    new_pm = copy.deepcopy(pm)
    for tag in ("styleUrl", "Style", "StyleMap"):
        for el in new_pm.findall(tag):
            new_pm.remove(el)
    nm = new_pm.find("name")
    if nm is None:
        nm = ET.Element("name")
        new_pm.insert(0, nm)
    nm.text = name
    st_el = ET.Element("styleUrl")
    st_el.text = style_url
    new_pm.append(st_el)
    return new_pm


def process_poles(scopes, fdts, tol_m=5.0, line_folders=None, container=None, report=None):
    """Process and renumber all poles based on distribution cable and sling wire routes.

    `scopes`: elemen yang anak-anaknya memuat folder POLE/NP/EXT dan FDT.
    `fdts`: FdtIndex (atau dict nama -> (lat, lon) untuk pemanggil lama).
    """
    if not isinstance(scopes, (list, tuple)):
        scopes = [scopes]
    if isinstance(fdts, dict):
        idx = FdtIndex()
        for k, (la, lo) in fdts.items():
            idx.add(k, la, lo)
        fdts = idx
    container = container if container is not None else scopes[0]

    poles = {}
    for _, f in scope_folders(scopes):
        fname = _direct_name(f).upper()
        if fname in ("POLE", "NP", "EXT"):
            for pm in f.findall("Placemark"):
                coords_el = pm.find("Point/coordinates")
                if coords_el is None or not coords_el.text:
                    continue
                try:
                    lon, lat, *_ = coords_el.text.strip().split(",")
                    pm_str = ET.tostring(pm).decode('utf-8').upper()
                    is_exist = (fname == "EXT") or ("EXISTING" in pm_str) or ("EXST" in pm_str)
                    poles[pm] = (float(lat), float(lon), is_exist)
                except Exception:
                    continue

    if not poles:
        print("[WARNING] Tidak ada POLE ditemukan")
        return

    def coords_key_pm(pm):
        lat, lon, _ = poles[pm]
        return (round(lat, 6), round(lon, 6))

    def map_line_to_poles(coords):
        candidates = []
        for pm, (plat, plon, _) in poles.items():
            proj = get_pole_line_projection((plon, plat), coords)
            if proj is not None:
                dist_along, perp_d = proj
                if perp_d <= tol_m:
                    candidates.append((pm, dist_along))
        candidates.sort(key=lambda x: x[1])
        return [pm for pm, _ in candidates]

    if line_folders is None:
        line_folders = [f for _, f in scope_folders(scopes)
                        if _direct_name(f).upper().startswith("LINE ")]
    line_folders = list(line_folders)

    def fdt_group_key(lf):
        name = _direct_name(lf)
        num = _fdt_num_of(name)
        return (num if num is not None else 0, get_fdt_name_from_line(name).upper())

    # Group line folders by FDT (sort stabil: urutan LINE di dalam FDT tetap)
    line_folders.sort(key=fdt_group_key)

    visited_coords = set()
    numbered = 0
    new_pole_counter = 1
    existing_pole_counter = 1
    last_fdt = None

    for line_folder in line_folders:
        nm_el = line_folder.find("name")
        line_name = (nm_el.text or "").strip().upper()

        distribution_coords_list = []
        sling_coords_list = []
        for sub in line_folder.findall("Folder"):
            sname = sub.find("name")
            if sname is None:
                continue
            stext = (sname.text or "").upper()
            if ("DISTRIBUTION" in stext or "CABLE" in stext or "KABEL" in stext) and "SLING" not in stext:
                for pm in sub.findall("Placemark"):
                    coords_el = pm.find("LineString/coordinates")
                    if coords_el is None or not coords_el.text:
                        continue
                    coords = parse_coords(coords_el.text)
                    if coords:
                        distribution_coords_list.append(coords)
            if "SLING" in stext:
                for pm in sub.findall("Placemark"):
                    coords_el = pm.find("LineString/coordinates")
                    if coords_el is None or not coords_el.text:
                        continue
                    coords = parse_coords(coords_el.text)
                    if coords:
                        sling_coords_list.append(coords)

        # Get FAT coordinates for this line
        fat_coords = []
        for sub in line_folder.findall("Folder"):
            sname = sub.find("name")
            if sname is not None and (sname.text or "").strip().upper() == "FAT":
                for pm in sub.findall("Placemark"):
                    pt = pm.find("Point/coordinates")
                    if pt is not None and pt.text:
                        try:
                            flon, flat, *_ = map(float, pt.text.strip().split(","))
                            fat_coords.append((flat, flon))
                        except Exception:
                            continue

        # Get bend points > 30 degrees for this line
        bend_points = set()
        for pts in distribution_coords_list:
            if len(pts) < 3:
                continue
            avg_lat = sum(lat for lon, lat in pts) / len(pts)
            xy_pts = [lonlat_to_xy(lon, lat, avg_lat) for lon, lat in pts]
            for i in range(1, len(pts) - 1):
                A = xy_pts[i - 1]
                B = xy_pts[i]
                C = xy_pts[i + 1]
                dx1, dy1 = B[0] - A[0], B[1] - A[1]
                dx2, dy2 = C[0] - B[0], C[1] - B[1]
                len1 = math.hypot(dx1, dy1)
                len2 = math.hypot(dx2, dy2)
                if len1 > 0 and len2 > 0:
                    dot = dx1 * dx2 + dy1 * dy2
                    cos_theta = dot / (len1 * len2)
                    cos_theta = max(-1.0, min(1.0, cos_theta))
                    theta = math.degrees(math.acos(cos_theta))
                    if theta > 30.0:
                        bend_points.add((round(pts[i][1], 6), round(pts[i][0], 6)))

        dist_mapped = [map_line_to_poles(coords) for coords in distribution_coords_list]
        sling_mapped = [map_line_to_poles(coords) for coords in sling_coords_list]

        fdt_lat, fdt_lon = fdts.resolve(line_name)

        resolved_fdt_name = fdt_group_key(line_folder)
        if resolved_fdt_name != last_fdt:
            new_pole_counter = 1
            existing_pole_counter = 1
            last_fdt = resolved_fdt_name
            
        # Normalize direction: distribution from FDT to end
        if fdt_lat is not None and dist_mapped:
            for i, seq in enumerate(dist_mapped):
                if len(seq) < 2:
                    continue
                d_start = haversine(poles[seq[0]][0], poles[seq[0]][1], fdt_lat, fdt_lon)
                d_end = haversine(poles[seq[-1]][0], poles[seq[-1]][1], fdt_lat, fdt_lon)
                if d_end < d_start:
                    dist_mapped[i] = list(reversed(seq))

            if len(dist_mapped) > 1:
                ordered = []
                used_seg = set()
                best_i = min(range(len(dist_mapped)),
                             key=lambda si: haversine(poles[dist_mapped[si][0]][0],
                                                       poles[dist_mapped[si][0]][1],
                                                       fdt_lat, fdt_lon) if dist_mapped[si] else float('inf'))
                ordered.append(dist_mapped[best_i])
                used_seg.add(best_i)

                while len(used_seg) < len(dist_mapped):
                    last_pm = ordered[-1][-1] if ordered[-1] else None
                    best_next, best_d = None, float('inf')
                    for j in range(len(dist_mapped)):
                        if j in used_seg or not dist_mapped[j]:
                            continue
                        if last_pm is not None:
                            d = haversine(poles[last_pm][0], poles[last_pm][1],
                                          poles[dist_mapped[j][0]][0], poles[dist_mapped[j][0]][1])
                            if d < best_d:
                                best_d, best_next = d, j
                    if best_next is not None:
                        ordered.append(dist_mapped[best_next])
                        used_seg.add(best_next)
                    else:
                        break
                dist_mapped = ordered

        sling_by_start = defaultdict(list)
        sling_used = set()
        for idx, seq in enumerate(sling_mapped):
            if seq:
                sling_by_start[seq[0]].append((idx, seq))
                if len(seq) > 1 and seq[-1] is not seq[0]:
                    sling_by_start[seq[-1]].append((idx, list(reversed(seq))))

        def process_sling_seq(idx_seq_tuple, order_list):
            idx, seq = idx_seq_tuple
            if idx in sling_used:
                return
            sling_used.add(idx)
            for pm in seq:
                k = coords_key_pm(pm)
                if k in visited_coords:
                    continue
                visited_coords.add(k)
                order_list.append(pm)
                if pm in sling_by_start:
                    for child in list(sling_by_start[pm]):
                        if child[0] not in sling_used:
                            process_sling_seq(child, order_list)

        order = []
        for dist_seq in dist_mapped:
            for pm in dist_seq:
                k = coords_key_pm(pm)
                if k not in visited_coords:
                    visited_coords.add(k)
                    order.append(pm)
                if pm in sling_by_start:
                    children = sorted(sling_by_start[pm], key=lambda x: x[0])
                    for child in children:
                        if child[0] not in sling_used:
                            process_sling_seq(child, order)

        if not order and sling_mapped:
            if fdt_lat is not None:
                best_idx = None
                best_d = float('inf')
                for idx, seq in enumerate(sling_mapped):
                    if not seq:
                        continue
                    pm = seq[0]
                    d = haversine(poles[pm][0], poles[pm][1], fdt_lat, fdt_lon)
                    if d < best_d:
                        best_d = d
                        best_idx = idx
                if best_idx is not None:
                    process_sling_seq((best_idx, sling_mapped[best_idx]), order)
            for idx, seq in enumerate(sling_mapped):
                if idx in sling_used:
                    continue
                if seq and coords_key_pm(seq[0]) in visited_coords:
                    process_sling_seq((idx, seq), order)

        if order:
            def is_loopback_pole(plat, plon):
                for pts in distribution_coords_list:
                    visits = 0
                    for lon, lat in pts:
                        if haversine(plat, plon, lat, lon) <= 2.0:
                            visits += 1
                    if visits > 1:
                        return True
                return False

            for pm in order:
                lat, lon, is_exist = poles[pm]
                if is_exist:
                    pole_name = f"EXT.MR.P{existing_pole_counter:03d}"
                    existing_pole_counter += 1
                else:
                    pole_name = f"MR.XXX.P{new_pole_counter:03d}"
                    new_pole_counter += 1

                pm_str = ET.tostring(pm).decode('utf-8').upper()
                owner = "PARTNER" if "PARTNER" in pm_str else "EMR"

                is_fdt = False
                for fdt_lat, fdt_lon in fdts.values():
                    if haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:
                        is_fdt = True
                        break

                is_fat = False
                for flat, flon in fat_coords:
                    if haversine(lat, lon, flat, flon) <= 1.0:
                        is_fat = True
                        break

                is_loopback = is_loopback_pole(lat, lon)

                is_sharp_bend = False
                for blat, blon in bend_points:
                    if haversine(lat, lon, blat, blon) <= 2.0:
                        is_sharp_bend = True
                        break

                if is_fdt:
                    size_str = "7-4"
                    style_url = "#style_pole_7m_4inch"
                elif is_fat or is_loopback or is_sharp_bend:
                    size_str = "7-3"
                    style_url = "#style_pole_7m_3inch"
                else:
                    if "9-4" in pm_str or "9M" in pm_str:
                        size_str = "9-4"
                        style_url = "#style_pole_9m_4inch"
                    elif "7-4" in pm_str or "7M 4" in pm_str:
                        size_str = "7-4"
                        style_url = "#style_pole_7m_4inch"
                    elif "7-3" in pm_str or "7M 3" in pm_str:
                        size_str = "7-3"
                        style_url = "#style_pole_7m_3inch"
                    elif "2.5" in pm_str or "2_5" in pm_str or "7M 2.5" in pm_str:
                        size_str = "7-2.5"
                        style_url = "#style_pole_7m_2_5inch"
                    else:
                        if is_exist:
                            size_str = "7-4"
                            style_url = "#style_pole_7m_4inch"
                        else:
                            size_str = "7-2.5"
                            style_url = "#style_pole_7m_2_5inch"

                if is_exist:
                    folder_name = f"EXISTING POLE {owner} {size_str}"
                    style_url = "#style_pole_existing"
                else:
                    folder_name = f"NEW POLE {size_str}"

                new_pm = _renamed_pole(pm, pole_name, style_url)
                numbered += 1

                target_folder = find_or_create_folder(line_folder, folder_name)
                target_folder.append(new_pm)

        # Clean up any existing SLACK HANGER folder in line_folder
        for sub in list(line_folder.findall("Folder")):
            sname = sub.find("name")
            if sname is not None and (sname.text or "").strip().upper() == "SLACK HANGER":
                line_folder.remove(sub)

        # Create new SLACK HANGER folder
        slack_folder = ET.Element("Folder")
        snm = ET.Element("name")
        snm.text = "SLACK HANGER"
        slack_folder.append(snm)
        has_slack = False

        # Copy FDT slack to the first line's SLACK HANGER
        if line_folder == line_folders[0] and fdt_lat is not None:
            fdt_pm = None
            for _, f in scope_folders(scopes):
                if _direct_name(f).upper().startswith("FDT"):
                    fdt_pm = f.find("Placemark")
                    if fdt_pm is not None:
                        break
            if fdt_pm is not None:
                fdt_slack = ET.fromstring(ET.tostring(fdt_pm))
                for st in fdt_slack.findall("styleUrl"):
                    fdt_slack.remove(st)
                st_el = ET.Element("styleUrl")
                st_el.text = "#style_slack_cable"
                fdt_slack.append(st_el)
                slack_folder.append(fdt_slack)
                has_slack = True

        # Copy FAT slacks for the current line
        fat_folder_ref = None
        for sub in line_folder.findall("Folder"):
            sname = sub.find("name")
            if sname is not None and (sname.text or "").strip().upper() == "FAT":
                fat_folder_ref = sub
                break
        if fat_folder_ref is not None:
            for pm in fat_folder_ref.findall("Placemark"):
                fat_slack = ET.fromstring(ET.tostring(pm))
                for st in fat_slack.findall("styleUrl"):
                    fat_slack.remove(st)
                st_el = ET.Element("styleUrl")
                st_el.text = "#style_slack_cable"
                fat_slack.append(st_el)
                slack_folder.append(fat_slack)
                has_slack = True

        if has_slack:
            line_folder.append(slack_folder)

    # Handle remaining poles (not assigned to any line)
    remaining = [pm for pm in poles.keys() if coords_key_pm(pm) not in visited_coords]
    if remaining:
        # Fallback to first FDT for unassigned poles if any
        fallback_lat, fallback_lon = None, None
        if fdts:
            fallback_lat, fallback_lon = list(fdts.values())[0]
        if fallback_lat is not None:
            remaining.sort(key=lambda pm: haversine(poles[pm][0], poles[pm][1], fallback_lat, fallback_lon))
        for pm in remaining:
            lat, lon, is_exist = poles[pm]
            if is_exist:
                pole_name = f"EXT.MR.P{existing_pole_counter:03d}"
                existing_pole_counter += 1
            else:
                pole_name = f"MR.XXX.P{new_pole_counter:03d}"
                new_pole_counter += 1

            pm_str = ET.tostring(pm).decode('utf-8').upper()

            if "9-4" in pm_str or "9M" in pm_str:
                size_str = "9-4"
                style_url = "#style_pole_9m_4inch"
            elif "7-4" in pm_str or "7M 4" in pm_str:
                size_str = "7-4"
                style_url = "#style_pole_7m_4inch"
            elif "7-3" in pm_str or "7M 3" in pm_str:
                size_str = "7-3"
                style_url = "#style_pole_7m_3inch"
            elif "2.5" in pm_str or "2_5" in pm_str or "7M 2.5" in pm_str:
                size_str = "7-2.5"
                style_url = "#style_pole_7m_2_5inch"
            else:
                if is_exist:
                    size_str = "7-4"
                    style_url = "#style_pole_7m_4inch"
                else:
                    size_str = "7-2.5"
                    style_url = "#style_pole_7m_2_5inch"

            if is_exist:
                owner = "PARTNER" if "PARTNER" in pm_str else "EMR"
                folder_name = f"EXISTING POLE {owner} {size_str} UNASSIGNED"
                style_url = "#style_pole_existing"
            else:
                folder_name = f"NEW POLE {size_str} UNASSIGNED"

            new_pm = _renamed_pole(pm, pole_name, style_url)

            un_folder = find_or_create_folder(container, folder_name)
            un_folder.append(new_pm)

    if report is not None:
        report.stat("tiang_dinomori", numbered + len(remaining))
        if remaining:
            report.warn(f"{len(remaining)} tiang tidak berada di jalur kabel/sling mana pun; "
                        "dimasukkan ke folder '... UNASSIGNED'")
    print("[SUCCESS] POLE numbering selesai.")


# =====================================================================
# Folder Reordering
# =====================================================================

def reorder_line_folders(line_folder):
    """Reorder sub-folders within a LINE folder to match mandatory structure."""
    MANDATORY_FOLDERS = [
        "BOUNDARY FAT",
        "FAT",
        "HP COVER",
        "HP UNCOVER",
        "EXISTING POLE EMR 7-2.5",
        "EXISTING POLE EMR 7-3",
        "EXISTING POLE EMR 7-4",
        "EXISTING POLE EMR 9-4",
        "EXISTING POLE PARTNER 7-4",
        "EXISTING POLE PARTNER 9-4",
        "NEW POLE 7-2.5",
        "NEW POLE 7-3",
        "NEW POLE 7-4",
        "NEW POLE 9-4",
        "DISTRIBUTION CABLE",
        "SLACK HANGER",
        "SLING WIRE"
    ]

    collected = {name: [] for name in MANDATORY_FOLDERS}

    for sub in list(line_folder.findall("Folder")):
        sname_el = sub.find("name")
        if sname_el is None:
            continue
        sname = (sname_el.text or "").strip()
        sname_upper = sname.upper()

        target = None
        if sname in collected:
            target = sname
        elif "BOUNDARY" in sname_upper:
            target = "BOUNDARY FAT"
        elif sname_upper == "FAT":
            target = "FAT"
        elif "HP COVER" in sname_upper:
            target = "HP COVER"
        elif "HP UNCOVER" in sname_upper or "HP UN" in sname_upper:
            target = "HP UNCOVER"
        elif "SLACK" in sname_upper:
            target = "SLACK HANGER"
        elif "SLING" in sname_upper:
            target = "SLING WIRE"
        elif "DISTRIBUTION" in sname_upper or "CABLE" in sname_upper or "KABEL" in sname_upper:
            target = "DISTRIBUTION CABLE"
        elif "EXISTING POLE" in sname_upper or "EXST POLE" in sname_upper:
            if "PARTNER" in sname_upper:
                if "9-4" in sname_upper or "9M" in sname_upper:
                    target = "EXISTING POLE PARTNER 9-4"
                else:
                    target = "EXISTING POLE PARTNER 7-4"
            else:
                if "9-4" in sname_upper or "9M" in sname_upper:
                    target = "EXISTING POLE EMR 9-4"
                elif "7-4" in sname_upper or "7M 4" in sname_upper:
                    target = "EXISTING POLE EMR 7-4"
                elif "2.5" in sname_upper or "2_5" in sname_upper or "7M 2.5" in sname_upper:
                    target = "EXISTING POLE EMR 7-2.5"
                else:
                    target = "EXISTING POLE EMR 7-3"
        elif "NEW POLE" in sname_upper:
            if "9-4" in sname_upper or "9M" in sname_upper:
                target = "NEW POLE 9-4"
            elif "7-4" in sname_upper or "7M 4" in sname_upper:
                target = "NEW POLE 7-4"
            elif "2.5" in sname_upper or "2_5" in sname_upper or "7M 2.5" in sname_upper:
                target = "NEW POLE 7-2.5"
            else:
                target = "NEW POLE 7-3"

        if target:
            for child in list(sub):
                if child.tag != "name":
                    collected[target].append(child)
            line_folder.remove(sub)

    for name in MANDATORY_FOLDERS:
        f = ET.Element("Folder")
        nm = ET.Element("name")
        nm.text = name
        f.append(nm)
        for child in collected[name]:
            f.append(child)
        line_folder.append(f)


# =====================================================================
# Main Processing Pipeline
# =====================================================================

def _process_kml_tree(tree, report: Optional[ProcessReport] = None):
    """
    Core processing pipeline operating on an ElementTree.
    Returns the modified tree.
    """
    report = report if report is not None else ProcessReport()
    root = tree.getroot()
    strip_namespace(root)
    doc = root.find("Document")
    if doc is None:
        raise ValueError("Tidak ada <Document> di dalam file KML")

    # Folder LINE boleh dibungkus folder proyek. Folder POLE/NP/EXT, HP, dan
    # FDT dicari di wadah itu DAN di Document.
    container = find_line_container(doc)
    scopes = [container] if container is doc else [container, doc]

    # Inject custom styles for Legend Design
    inject_custom_styles(doc)

    # Step 1: Process boundaries and HP coverage per LINE
    polygons_by_line = {}  # polygons_by_line[fdt_name][letter]
    line_folders = []
    for line_folder in container.findall("Folder"):
        line_name = _direct_name(line_folder)
        if not line_name.upper().startswith("LINE "):
            continue
        line_folders.append(line_folder)
        fdt_name = get_fdt_name_from_line(line_name)
        polygons_by_line.setdefault(fdt_name, {})

        polygons = process_boundaries_and_hp_in_line(line_folder)

        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper()

        if polygons:
            polygons_by_line[fdt_name][polygons[0][3]] = polygons
        else:
            polygons_by_line[fdt_name][letter] = []
            report.warn(f"{line_name}: tidak ada poligon di folder BOUNDARY — FAT tidak dibuat")

    if not line_folders:
        raise ValueError(
            "Tidak ditemukan folder bernama 'LINE A', 'LINE B', dst. KML-APD "
            "membutuhkan struktur: folder LINE (berisi BOUNDARY dan kabel "
            "DISTRIBUTION), folder POLE/NP/EXT, folder HP, dan folder FDT."
        )

    # Step 2: Move root HP placemarks into line folders
    uncovered = move_root_hp_to_lines(scopes, line_folders, polygons_by_line)
    update_boundary_descriptions(line_folders, polygons_by_line)
    if uncovered:
        report.warn(f"{uncovered} HP berada di luar semua boundary; dimasukkan ke HP UNCOVER")

    # Step 3: Collect global poles
    global_poles = []
    for _, f in scope_folders(scopes):
        fname = _direct_name(f).upper()
        if fname in ("POLE", "NP", "EXT"):
            for pm in f.findall("Placemark"):
                coords_el = pm.find("Point/coordinates")
                if coords_el is None or not coords_el.text:
                    continue
                try:
                    lon, lat = map(float, coords_el.text.strip().split(",")[:2])
                except Exception:
                    continue
                pm_str = ET.tostring(pm).decode('utf-8').upper()
                is_exist = (fname == "EXT") or ("EXISTING" in pm_str) or ("EXST" in pm_str)
                global_poles.append((pm, f, lon, lat, is_exist))

    # Deduplicate poles within POLE_DEDUPE_M (prioritize existing)
    poles_sorted = sorted(global_poles, key=lambda x: (not x[4]))
    kept_poles = []
    removed = []
    for p in poles_sorted:
        pm, folder, lon, lat, is_exist = p
        dup_of = None
        for kp in kept_poles:
            if haversine(lat, lon, kp[3], kp[2]) < POLE_DEDUPE_M:
                dup_of = kp
                break
        if dup_of is not None:
            try:
                folder.remove(pm)
            except Exception:
                pass
            removed.append(_direct_name(pm) or f"{lat:.6f},{lon:.6f}")
        else:
            kept_poles.append(p)
    global_poles = kept_poles
    if removed:
        report.warn(f"{len(removed)} tiang dihapus karena berjarak < {POLE_DEDUPE_M:.0f} m "
                    "dari tiang lain (tiang eksisting diutamakan)", removed)

    # Step 4: Get FDT info for cable/sling processing
    fdts = FdtIndex()
    for _, f in scope_folders(scopes):
        if not _direct_name(f).upper().startswith("FDT"):
            continue
        for pm in f.findall("Placemark"):
            fdt_name = _direct_name(pm) or _direct_name(f) or "FDT"
            coords = pm.find("Point/coordinates")
            if coords is not None and coords.text:
                try:
                    lon, lat, *_ = coords.text.strip().split(",")
                    fdts.add(fdt_name, float(lat), float(lon))
                except Exception:
                    pass
    if not len(fdts):
        report.warn("Titik FDT tidak ditemukan (folder berawalan 'FDT'); arah penomoran "
                    "tiang dan slack FDT tidak bisa ditentukan")

    # Step 5: Process FAT/Cable/Sling for each line
    for line_folder in line_folders:
        line_name = _direct_name(line_folder)
        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper()

        fdt_name = get_fdt_name_from_line(line_name)
        fdt_lat, fdt_lon = fdts.resolve(line_name)

        polygons = polygons_by_line.get(fdt_name, {}).get(letter, [])
        process_fat_cable_sling_for_line(
            line_folder, polygons, global_poles, len(fdts),
            doc=doc, line_folders=line_folders,
            fdt_lat=fdt_lat, fdt_lon=fdt_lon,
            tol_m_pole_line=5.0, report=report,
        )

    # Step 6: Process pole numbering
    process_poles(scopes, fdts, tol_m=5.0, line_folders=line_folders,
                  container=container, report=report)

    if fdts.fallbacks:
        report.warn("Nomor FDT di nama folder LINE tidak cocok dengan titik FDT mana pun; "
                    "memakai FDT pertama", sorted(fdts.fallbacks))

    # Step 7: Remove original root POLE/NP/EXT folders
    for parent, f in list(scope_folders(scopes)):
        if _direct_name(f).upper() in ("POLE", "NP", "EXT"):
            parent.remove(f)

    # Step 8: Reorder folders for each Line
    for line_folder in line_folders:
        reorder_line_folders(line_folder)

    # Step 8b: Sort HP COVER subfolders A-Z by name
    for line_folder in line_folders:
        for sub in line_folder.findall("Folder"):
            if "HP COVER" in _direct_name(sub).upper():
                child_folders = sub.findall("Folder")
                if not child_folders:
                    continue
                for cf in child_folders:
                    sub.remove(cf)
                child_folders.sort(key=lambda f: _direct_name(f).upper())
                for cf in child_folders:
                    sub.append(cf)

    # Count totals
    total_fat_count = 0
    total_hp_count = 0
    for line_folder in line_folders:
        for sub in line_folder.findall("Folder"):
            stext = _direct_name(sub).upper()
            if stext == "FAT":
                total_fat_count += len(sub.findall("Placemark"))
            elif "HP COVER" in stext:
                for hp_sub in sub.findall("Folder"):
                    total_hp_count += len(hp_sub.findall("Placemark"))

    report.stat("line", len(line_folders))
    report.stat("fat", total_fat_count)
    report.stat("hp_cover", total_hp_count)
    report.stat("hp_uncover", uncovered)
    report.stat("fdt", len(fdts))
    print(f"[KML-APD] Total FAT: {total_fat_count}, Total HP Cover: {total_hp_count}")
    print(f"[KML-APD] Total LINE folders: {len(line_folders)}")

    # Step 9: Apply FDT styles based on core capacity
    for _, f in scope_folders(scopes):
        if not _direct_name(f).upper().startswith("FDT"):
            continue
        for pm in f.findall("Placemark"):
            pm_name = _direct_name(pm).upper()
            for st in pm.findall("styleUrl"):
                pm.remove(st)
            for st in pm.findall("Style"):
                pm.remove(st)
            st_el = ET.Element("styleUrl")
            if "96" in pm_name:
                st_el.text = "#style_fdt_96c"
            elif "48" in pm_name:
                st_el.text = "#style_fdt_48c"
            else:
                st_el.text = "#style_fdt_72c"
            pm.append(st_el)

    restore_namespace(root)
    return tree


# =====================================================================
# Public API
# =====================================================================

def process_kml_apd(
    kml_content: bytes,
    filename: str,
    is_kmz: bool = False,
) -> Dict[str, Any]:
    """
    Process KML/KMZ file for FTTH APD auto-drafting.

    Returns:
        Dict with status, filename, content bytes, content_type and report
    """
    try:
        # Lampiran KMZ (ikon, gambar overlay) dikumpulkan lebih dulu agar
        # bisa dikemas ulang — dengan batas ukuran yang sama dengan pemuat.
        kmz_extra_files = read_kmz_attachments(kml_content)

        # Pemuat bersama menangani KMZ, encoding, entitas, dan prefix yatim.
        raw_kml = load_kml_bytes(kml_content, is_kmz)

        report = ProcessReport()
        tree = ET.ElementTree(parse_kml_tolerant(raw_kml))
        tree = _process_kml_tree(tree, report)

        output_buffer = io.BytesIO()
        tree.write(output_buffer, encoding="utf-8", xml_declaration=True)
        output_kml_bytes = output_buffer.getvalue()

        base = os.path.splitext(filename)[0]

        if is_kmz:
            kmz_buffer = io.BytesIO()
            with zipfile.ZipFile(kmz_buffer, "w", zipfile.ZIP_DEFLATED) as kmz_out:
                kmz_out.writestr("doc.kml", output_kml_bytes)
                for extra_name, extra_data in kmz_extra_files.items():
                    if extra_name.lower() != "doc.kml":
                        kmz_out.writestr(extra_name, extra_data)

            return {
                "status": "success",
                "filename": f"{base}_APD.kmz",
                "content": kmz_buffer.getvalue(),
                "content_type": "application/vnd.google-earth.kmz",
                "report": report.to_dict(),
            }
        return {
            "status": "success",
            "filename": f"{base}_APD.kml",
            "content": output_kml_bytes,
            "content_type": "application/vnd.google-earth.kml+xml",
            "report": report.to_dict(),
        }

    except ValueError as ve:
        return {"status": "error", "message": str(ve)}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": f"KML APD processing failed: {str(e)}"}
