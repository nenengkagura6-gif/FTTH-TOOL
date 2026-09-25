"""
Pole Auto-Sorter Engine
=======================
Menomori ulang placemark NEW POLE dan EXISTING POLE di KML/KMZ.

Urutan utama mengikuti JALUR KABEL DISTRIBUSI dari FDT: tiang yang berada
di dekat kabel (<= ROUTE_TOLERANCE_M) diurutkan menurut jaraknya sepanjang
kabel, mulai dari ujung yang paling dekat FDT. Tiang yang tidak berada di
jalur kabel — atau seluruh grup, kalau grupnya tidak punya kabel — diurutkan
menurut nomor lama di namanya, sambil menutup celah penomoran.
"""

import io
import re
import zipfile
from typing import Dict, List, Tuple, Optional, Any
from xml.dom import minidom
from defusedxml.minidom import parseString as safe_parse_string

from utils.commons import (
    load_kml_text, read_kmz_attachments, polyline_projection, haversine, fdt_number,
)
from utils.report import ProcessReport

ROUTE_TOLERANCE_M = 10.0

# Regex matching numbers at the end of the name. e.g. .P012 or .E123 or just 123
NUM_SUFFIX_RE = re.compile(r"(.*?[.\-_/\\]?[PpEe]?)(\d{1,4})$")

_NEW_POLE_RE = re.compile(r"\bNEW\s*POLE\b|\bTIANG\s*BARU\b|\bNEW\s*TIANG\b")
_EXISTING_RE = re.compile(r"\b(EXISTING|EKSISTING|EXT|EXST)\b")
_POLE_WORD_RE = re.compile(r"\b(POLE|TIANG)\b")
_CABLE_RE = re.compile(r"CABLE|KABEL|DISTRIBUTION")


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


def _is_new_pole_folder(name: str) -> bool:
    """Folder tiang baru. Pencocokan per KATA — 'np' dulu dicocokkan sebagai
    potongan teks sehingga 'INPUT' dan 'UNPLANNED' ikut dianggap tiang."""
    u = (name or "").strip().upper()
    return bool(_NEW_POLE_RE.search(u)) or u == "NP" or u.startswith("NP ")


def _is_existing_pole_folder(name: str) -> bool:
    """Folder tiang eksisting. Kata 'existing' saja tidak cukup — dulu folder
    'EXISTING CABLE' ikut diperlakukan sebagai tiang dan isinya dinomori P001."""
    u = (name or "").strip().upper()
    if _is_new_pole_folder(u) or not _EXISTING_RE.search(u):
        return False
    return bool(_POLE_WORD_RE.search(u)) or u in ("EXT", "EXISTING", "EKSISTING", "EXST") \
        or u.startswith("EXT ")


def _get_direct_child_folders(elem) -> List:
    """Return only direct child Folder or Document elements."""
    return [c for c in elem.childNodes if getattr(c, "tagName", None) in ("Folder", "Document")]


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


def _coords_of(pm, geom: str) -> List[Tuple[float, float]]:
    """Koordinat (lon, lat) dari geometri pertama bertipe `geom` di placemark."""
    for g in pm.getElementsByTagName(geom):
        for c in g.getElementsByTagName("coordinates"):
            text = "".join(n.nodeValue for n in c.childNodes if n.nodeType == n.TEXT_NODE)
            pts = []
            for tok in text.split():
                parts = tok.split(",")
                if len(parts) >= 2:
                    try:
                        pts.append((float(parts[0]), float(parts[1])))
                    except ValueError:
                        continue
            return pts
    return []


def _set_placemark_name(pm, new_name: str, doc: minidom.Document):
    """Set (or create) the <name> element of a Placemark."""
    name_nodes = [c for c in pm.childNodes if getattr(c, "tagName", None) == "name"]
    if name_nodes:
        node = name_nodes[0]
        while node.firstChild:
            node.removeChild(node.firstChild)
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


def _name_key(pole) -> tuple:
    num, _, name = pole
    return (num if num is not None else 999999, name)


class Route:
    """Rangkaian kabel distribusi satu grup, berurutan mulai dari FDT."""

    def __init__(self, lines: List[List[Tuple[float, float]]], fdt: Optional[Tuple[float, float]]):
        self.lines = self._orient_and_chain(lines, fdt)

    @staticmethod
    def _orient_and_chain(lines, fdt):
        lines = [l for l in lines if len(l) >= 2]
        if not lines:
            return []
        if fdt is None:
            return lines

        def d(p):
            return haversine(p[1], p[0], fdt[1], fdt[0])

        oriented = [l if d(l[0]) <= d(l[-1]) else list(reversed(l)) for l in lines]
        # Rangkai: mulai dari kabel yang ujungnya paling dekat FDT, lalu
        # sambung ke kabel yang awalnya paling dekat dengan ujung sebelumnya.
        remaining = sorted(oriented, key=lambda l: d(l[0]))
        chain = [remaining.pop(0)]
        while remaining:
            tail = chain[-1][-1]
            nxt = min(remaining, key=lambda l: haversine(tail[1], tail[0], l[0][1], l[0][0]))
            remaining.remove(nxt)
            chain.append(nxt)
        return chain

    def key(self, point: Tuple[float, float]) -> Optional[Tuple[int, float]]:
        best = None
        for idx, line in enumerate(self.lines):
            proj = polyline_projection(point, line)
            if proj is None:
                continue
            along, perp = proj
            if perp <= ROUTE_TOLERANCE_M and (best is None or perp < best[2]):
                best = (idx, along, perp)
        return (best[0], best[1]) if best else None


def _order_poles(poles: List[tuple], route: Optional[Route]) -> Tuple[List[tuple], int]:
    """Urutkan tiang: yang di jalur kabel dulu (sepanjang kabel), sisanya per nomor.

    Mengembalikan (urutan, jumlah tiang yang tidak berada di jalur kabel).
    """
    if not route or not route.lines:
        return sorted(poles, key=_name_key), len(poles)
    routed, unrouted = [], []
    for p in poles:
        pt = _coords_of(p[1], "Point")
        k = route.key(pt[0]) if pt else None
        (routed if k is not None else unrouted).append((k, p))
    routed.sort(key=lambda kp: (kp[0][0], kp[0][1], _name_key(kp[1])))
    unrouted_sorted = sorted((p for _, p in unrouted), key=_name_key)
    return [p for _, p in routed] + unrouted_sorted, len(unrouted_sorted)


def _renumber(poles: List[tuple], doc: minidom.Document) -> None:
    if not poles:
        return
    # Prefix & lebar nomor diambil dari tiang bernomor terkecil (format lama).
    prefix, pad = "P", 3
    numbered = sorted((p for p in poles if p[0] is not None), key=_name_key)
    if numbered:
        prefix, pad = _extract_prefix_and_pad(numbered[0][2])
    for i, (_, pm, _) in enumerate(poles, start=1):
        _set_placemark_name(pm, f"{prefix}{str(i).zfill(pad)}", doc)


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

    def _scan(node):
        child_folders = _get_direct_child_folders(node)
        new_pole_subs = [f for f in child_folders if _is_new_pole_folder(_name_of(f))]
        existing_subs = [f for f in child_folders if _is_existing_pole_folder(_name_of(f))]

        if getattr(node, "tagName", None) in ("Folder", "Document") and (new_pole_subs or existing_subs):
            g = LineGroup(node, _name_of(node))
            g.new_pole_folders = new_pole_subs
            g.existing_pole_folders = existing_subs
            groups.append(g)
            return

        for child in child_folders:
            _scan(child)

    _scan(doc_element)
    return groups


def _extract_fdt_id(name: str) -> str:
    """Extract FDT identifier from group name (e.g., 'LINE A FDT 02' -> 'FDT 02')."""
    num = fdt_number(name)
    if num is not None:
        return f"FDT {num:02d}"
    return name.upper()


def _cable_lines(folder) -> List[List[Tuple[float, float]]]:
    lines = []
    for sub in folder.getElementsByTagName("Folder"):
        nm = _name_of(sub).upper()
        if _CABLE_RE.search(nm) and "SLING" not in nm:
            for pm in sub.getElementsByTagName("Placemark"):
                coords = _coords_of(pm, "LineString")
                if len(coords) >= 2:
                    lines.append(coords)
    return lines


def _fdt_points(doc_elem) -> List[Tuple[Optional[int], Tuple[float, float]]]:
    """Semua titik di folder bernama FDT: [(nomor FDT atau None, (lon, lat))]."""
    out = []
    for folder in doc_elem.getElementsByTagName("Folder"):
        fname = _name_of(folder)
        if not re.search(r"\bFDT\b", fname, re.IGNORECASE):
            continue
        for pm in _get_all_placemarks_recursive(folder):
            pt = _coords_of(pm, "Point")
            if pt:
                out.append((fdt_number(_name_of(pm)) or fdt_number(fname), pt[0]))
    return out


# ---------------------------------------------------------------------------
# Main Engine Class
# ---------------------------------------------------------------------------

class PoleSorterEngine:
    def __init__(self):
        self.doc: Optional[minidom.Document] = None
        self.input_filename = ""
        self._is_kmz = False
        self._kmz_bytes: Optional[bytes] = None
        self.report = ProcessReport()

    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict:
        self.input_filename = filename
        self._is_kmz = is_kmz
        self._kmz_bytes = content

        raw = load_kml_text(content, is_kmz)
        # Hanya prefix 'kml:' yang dibuang. Dulu SEMUA prefix dibuang,
        # sehingga elemen gx:Track, gx:coord, dsb. berubah jadi elemen KML
        # tak dikenal di hasil.
        cleaned = re.sub(r"<(/?)kml:", r"<\1", raw)
        self.doc = safe_parse_string(cleaned.encode("utf-8"))
        return {"status": "success"}

    def _group_fdt(self, group_folder, fdt_id: str, fdts) -> Optional[Tuple[float, float]]:
        if not fdts:
            return None
        num = fdt_number(fdt_id)
        same = [p for n, p in fdts if n is not None and n == num]
        if len(same) == 1:
            return same[0]
        if len(fdts) == 1:
            return fdts[0][1]
        # Beberapa kandidat: pilih yang terdekat dengan ujung kabel grup.
        lines = _cable_lines(group_folder)
        if not lines:
            return None
        ends = [l[0] for l in lines] + [l[-1] for l in lines]
        cands = same or [p for _, p in fdts]
        return min(cands, key=lambda p: min(haversine(p[1], p[0], e[1], e[0]) for e in ends))

    def process(self) -> Dict:
        if not self.doc:
            return {"status": "error", "message": "KML belum di-load"}

        doc_elem = self.doc.documentElement
        line_groups = _detect_line_groups(doc_elem)

        if not line_groups:
            return {
                "status": "error",
                "message": "Tidak ditemukan folder NEW POLE atau EXISTING POLE. "
                           "Pastikan nama folder memuat: NEW POLE, NP, TIANG BARU, "
                           "EXISTING POLE, EXT, atau TIANG EKSISTING.",
            }

        fdts = _fdt_points(doc_elem)
        fdt_groups: Dict[str, List[LineGroup]] = {}
        for group in line_groups:
            fdt_groups.setdefault(_extract_fdt_id(group.name), []).append(group)

        report_groups: List[Dict] = []
        total_new = total_exist = unrouted_total = 0
        name_only_groups = []

        for fdt_id, groups in fdt_groups.items():
            groups = sorted(groups, key=lambda g: g.name.upper())
            ordered_new, ordered_exist = [], []
            methods = set()
            for g in groups:
                lines = _cable_lines(g.folder)
                route = Route(lines, self._group_fdt(g.folder, fdt_id, fdts)) if lines else None
                methods.add("cable_route" if route else "name_order")
                if not route:
                    name_only_groups.append(g.name or "(tanpa nama)")

                for folders, bucket in ((g.new_pole_folders, ordered_new),
                                        (g.existing_pole_folders, ordered_exist)):
                    poles = []
                    for folder in folders:
                        for pm in _get_all_placemarks_recursive(folder):
                            name = _name_of(pm)
                            poles.append((_extract_number(name), pm, name))
                    ordered, unrouted = _order_poles(poles, route)
                    if route:
                        unrouted_total += unrouted
                    bucket.extend(ordered)

            _renumber(ordered_new, self.doc)
            _renumber(ordered_exist, self.doc)
            total_new += len(ordered_new)
            total_exist += len(ordered_exist)

            report_groups.append({
                "group": " + ".join(g.name for g in groups),
                "sort_method": "cable_route" if methods == {"cable_route"} else
                               ("mixed" if len(methods) > 1 else "name_order"),
                "new_pole": {"found": len(ordered_new), "sorted": len(ordered_new)},
                "existing_pole": {"found": len(ordered_exist), "sorted": len(ordered_exist)},
            })

        self.report.stat("grup", len(report_groups))
        self.report.stat("new_pole", total_new)
        self.report.stat("existing_pole", total_exist)
        if name_only_groups:
            self.report.warn("Grup tanpa folder kabel distribusi — diurutkan menurut "
                             "nomor lama di nama", name_only_groups)
        if unrouted_total:
            self.report.warn(f"{unrouted_total} tiang berjarak > {ROUTE_TOLERANCE_M:.0f} m "
                             "dari kabel distribusi; ditaruh di akhir urutan grupnya")

        output_bytes = self._build_kmz()
        base = self.input_filename.rsplit(".", 1)[0]

        rep = self.report.to_dict()
        rep["groups"] = report_groups
        return {
            "status": "success",
            "filename": f"{base}_sorted.kmz",
            "content": output_bytes,
            "content_type": "application/vnd.google-earth.kmz",
            "report": rep,
        }

    def _build_kmz(self) -> bytes:
        kml_str = self.doc.toxml(encoding="utf-8")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as kmz_out:
            kmz_out.writestr("doc.kml", kml_str)
            for item, data in read_kmz_attachments(self._kmz_bytes or b"").items():
                if item.lower() != "doc.kml":
                    kmz_out.writestr(item, data)
        return buf.getvalue()


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
