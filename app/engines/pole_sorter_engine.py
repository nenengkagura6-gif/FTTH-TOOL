"""
Pole Auto-Sorter Engine
========================
Automatically renumber NEW POLE and EXISTING POLE placemarks in KML/KMZ files
based on their physical position along the fiber cable, starting from the FDT point.

Algorithm:
1. Parse KMZ → detect Line Groups (folders containing NEW POLE or EXISTING POLE)
2. For each Line Group, find cable LineStrings and FDT point
3. Build cable graph → DFS traversal from FDT (exhaust branches/sling wire first)
4. Project each pole to cable → get distance from FDT
5. Global renumber across all NEW POLE sub-folders (P001, P002...)
6. Same for EXISTING POLE (separate sequence, also P001, P002...)
7. Rebuild KMZ with updated pole names
"""

import io
import re
import zipfile
import math
from typing import Dict, List, Tuple, Optional, Any, Set
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

CABLE_KEYWORDS = [
    "cable", "kabel", "24", "48", "96", "144",
]

FDT_KEYWORDS = ["fdt"]

# Tolerance in degrees for snapping cable endpoints (~5-10m)
SNAP_TOL = 0.0001


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _name_of(elem) -> str:
    """Get the text content of the first <name> child."""
    for child in elem.childNodes:
        if getattr(child, "tagName", None) == "name":
            if child.firstChild:
                return child.firstChild.nodeValue.strip()
    return ""


def _contains_any(text: str, keywords: List[str]) -> bool:
    t = text.lower()
    return any(kw in t for kw in keywords)


def _is_new_pole_folder(name: str) -> bool:
    return _contains_any(name, NEW_POLE_KEYWORDS)


def _is_existing_pole_folder(name: str) -> bool:
    return _contains_any(name, EXISTING_POLE_KEYWORDS)


def _is_cable_folder_or_name(name: str) -> bool:
    return _contains_any(name, CABLE_KEYWORDS)


def _get_direct_child_folders(elem) -> List:
    """Return only direct child Folder elements."""
    folders = []
    for child in elem.childNodes:
        if getattr(child, "tagName", None) == "Folder":
            folders.append(child)
    return folders


def _get_all_folders_recursive(elem) -> List:
    """Recursively collect all Folder elements."""
    result = []
    for child in elem.childNodes:
        if getattr(child, "tagName", None) == "Folder":
            result.append(child)
            result.extend(_get_all_folders_recursive(child))
    return result


def _get_direct_placemarks(elem) -> List:
    """Return only direct child Placemark elements."""
    return [c for c in elem.childNodes if getattr(c, "tagName", None) == "Placemark"]


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


def _parse_coords(text: str) -> List[Tuple[float, float]]:
    """Parse KML coordinate string → list of (lat, lon)."""
    coords = []
    for token in text.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            try:
                lon, lat = float(parts[0]), float(parts[1])
                coords.append((lat, lon))
            except ValueError:
                pass
    return coords


def _get_point_coords(pm) -> Optional[Tuple[float, float]]:
    """Extract (lat, lon) from a Point placemark."""
    for pt in pm.getElementsByTagName("Point"):
        for co in pt.getElementsByTagName("coordinates"):
            if co.firstChild:
                coords = _parse_coords(co.firstChild.nodeValue)
                if coords:
                    return coords[0]
    return None


def _get_linestring_coords(pm) -> List[Tuple[float, float]]:
    """Extract coordinate list from a LineString placemark."""
    for ls in pm.getElementsByTagName("LineString"):
        for co in ls.getElementsByTagName("coordinates"):
            if co.firstChild:
                return _parse_coords(co.firstChild.nodeValue)
    return []


def _haversine(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Distance in metres between two (lat, lon) points."""
    R = 6371000.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _dist_deg(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Euclidean distance in degrees (fast, for snapping only)."""
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def _project_point_to_segment(
    p: Tuple[float, float],
    a: Tuple[float, float],
    b: Tuple[float, float],
) -> Tuple[Tuple[float, float], float]:
    """
    Project point p onto segment a-b.
    Returns (nearest_point_on_segment, t) where t in [0,1].
    """
    ax, ay = a[1], a[0]
    bx, by = b[1], b[0]
    px, py = p[1], p[0]
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0:
        return a, 0.0
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    proj = (ay + t * dy, ax + t * dx)
    return proj, t


# ---------------------------------------------------------------------------
# Cable Graph  (DFS-based ordered traversal)
# ---------------------------------------------------------------------------

class CableSegment:
    """A single LineString from the cable folder."""
    def __init__(self, seg_id: int, coords: List[Tuple[float, float]]):
        self.seg_id = seg_id
        self.coords = coords
        self.start = coords[0]
        self.end = coords[-1]


class CableGraph:
    """
    Graph of cable segments connected by shared endpoints.
    DFS traversal exhausts branches before continuing main line.
    """

    def __init__(self, segments: List[CableSegment]):
        self.segments = segments
        # adjacency: endpoint → list of (segment, reversed?)
        self._adj: Dict[Tuple[float, float], List[Tuple[CableSegment, bool]]] = {}
        for seg in segments:
            self._add_endpoint(seg.start, seg, False)
            self._add_endpoint(seg.end, seg, True)

    def _snap(self, pt: Tuple[float, float]) -> Tuple[float, float]:
        """Snap point to nearest existing endpoint within SNAP_TOL."""
        best, best_d = pt, float("inf")
        for ep in self._adj:
            d = _dist_deg(pt, ep)
            if d < best_d:
                best_d = d
                best = ep
        if best_d < SNAP_TOL:
            return best
        return pt

    def _add_endpoint(self, pt: Tuple[float, float], seg: CableSegment, rev: bool):
        snapped = self._snap(pt)
        if snapped not in self._adj:
            self._adj[snapped] = []
        self._adj[snapped].append((seg, rev))

    def ordered_coords(self, fdt_point: Optional[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """
        Return all cable coordinates in DFS traversal order starting from FDT.
        Branches / sling wires are exhausted before continuing main line.
        """
        if not self.segments:
            return []

        # Find start segment (closest endpoint to FDT)
        start_seg, start_rev = self._find_start_segment(fdt_point)
        if start_seg is None:
            start_seg = self.segments[0]
            start_rev = False

        visited_segs: Set[int] = set()
        result: List[Tuple[float, float]] = []
        self._dfs(start_seg, start_rev, visited_segs, result)
        return result

    def _find_start_segment(
        self, fdt: Optional[Tuple[float, float]]
    ) -> Tuple[Optional[CableSegment], bool]:
        if fdt is None:
            return self.segments[0] if self.segments else None, False

        best_seg = None
        best_rev = False
        best_d = float("inf")

        for seg in self.segments:
            d_start = _dist_deg(fdt, seg.start)
            d_end = _dist_deg(fdt, seg.end)
            if d_start < best_d:
                best_d = d_start
                best_seg = seg
                best_rev = False
            if d_end < best_d:
                best_d = d_end
                best_seg = seg
                best_rev = True

        return best_seg, best_rev

    def _dfs(
        self,
        seg: CableSegment,
        reversed_: bool,
        visited: Set[int],
        result: List[Tuple[float, float]],
    ):
        if seg.seg_id in visited:
            return
        visited.add(seg.seg_id)

        coords = list(reversed(seg.coords)) if reversed_ else seg.coords
        # Avoid duplicate junction point
        if result and _dist_deg(result[-1], coords[0]) < SNAP_TOL:
            result.extend(coords[1:])
        else:
            result.extend(coords)

        # The "far" endpoint after traversal
        far_end = coords[-1]
        snapped_far = self._snap(far_end)

        # Find all unvisited neighbours at far_end
        neighbours = self._adj.get(snapped_far, [])
        for nbr_seg, nbr_rev in neighbours:
            if nbr_seg.seg_id not in visited:
                self._dfs(nbr_seg, nbr_rev, visited, result)


# ---------------------------------------------------------------------------
# Prefix extraction & renaming
# ---------------------------------------------------------------------------

_NUM_SUFFIX_RE = re.compile(r"^(.+[.\-_/\\]?[Pp]?)(\d{2,4})$")


def _extract_prefix(name: str) -> Tuple[str, int]:
    """
    Extract prefix and padding from a pole name.
    e.g. "MR.JBG01.P007" → ("MR.JBG01.P", 3)
    e.g. "P-012"          → ("P-", 3)
    Returns ("P", 3) as fallback.
    """
    m = _NUM_SUFFIX_RE.match(name.strip())
    if m:
        prefix = m.group(1)
        num_str = m.group(2)
        return prefix, len(num_str)
    return "P", 3


def _find_prefix_from_list(names: List[str]) -> Tuple[str, int]:
    """Find the most common prefix among a list of pole names."""
    from collections import Counter
    prefixes = []
    for n in names:
        if n:
            p, pad = _extract_prefix(n)
            prefixes.append((p, pad))
    if not prefixes:
        return "P", 3
    # Most common prefix
    counter = Counter(p for p, _ in prefixes)
    best_prefix = counter.most_common(1)[0][0]
    # Find padding for best prefix
    for p, pad in prefixes:
        if p == best_prefix:
            return best_prefix, pad
    return "P", 3


def _make_pole_name(prefix: str, pad: int, idx: int) -> str:
    """Build pole name: prefix + zero-padded number."""
    return f"{prefix}{str(idx).zfill(pad)}"


def _set_placemark_name(pm, new_name: str, doc: minidom.Document):
    """Set (or create) the <name> element of a Placemark."""
    name_nodes = [c for c in pm.childNodes if getattr(c, "tagName", None) == "name"]
    if name_nodes:
        node = name_nodes[0]
        if node.firstChild:
            node.firstChild.nodeValue = new_name
        else:
            node.appendChild(doc.createTextNode(new_name))
    else:
        name_el = doc.createElement("name")
        name_el.appendChild(doc.createTextNode(new_name))
        pm.insertBefore(name_el, pm.firstChild)


# ---------------------------------------------------------------------------
# FDT Detection
# ---------------------------------------------------------------------------

def _extract_fdt_code_from_pole_name(name: str) -> Optional[str]:
    """
    Try to extract the FDT identifier from a pole name.
    e.g. "MR.JBG01.1.P001" → "JBG01.1"
    e.g. "MR.JBG01.P001"   → "JBG01"
    """
    # Pattern: CODE.SUBCODE.P### or CODE.P###
    m = re.search(r"([A-Z0-9]+\.[A-Z0-9]+(?:\.[A-Z0-9]+)?)\.P\d+", name, re.IGNORECASE)
    if m:
        parts = m.group(1).split(".")
        # Return the portion after the first segment (project code)
        if len(parts) >= 2:
            return ".".join(parts[1:])
        return parts[0]
    return None


def _find_fdt_point(
    group_folder,
    all_placemarks_in_doc: List,
    fdt_code: Optional[str],
) -> Optional[Tuple[float, float]]:
    """
    Locate the FDT point coordinates.
    Strategy:
    1. Search all Point placemarks whose name contains fdt_code
    2. Fallback: search placemarks in any FDT-named folder
    3. Fallback: None (use name-order sorting)
    """
    if fdt_code:
        for pm in all_placemarks_in_doc:
            pm_name = _name_of(pm)
            if fdt_code.lower() in pm_name.lower():
                coords = _get_point_coords(pm)
                if coords:
                    return coords

    # Fallback: FDT folder
    for folder in _get_all_folders_recursive(group_folder):
        if _contains_any(_name_of(folder), FDT_KEYWORDS):
            for pm in _get_all_placemarks_recursive(folder):
                coords = _get_point_coords(pm)
                if coords:
                    return coords

    return None


# ---------------------------------------------------------------------------
# Cable geometry collection
# ---------------------------------------------------------------------------

def _collect_cable_coords(group_folder) -> List[CableSegment]:
    """Collect all cable LineString segments from the line group."""
    segments: List[CableSegment] = []
    seg_id = 0

    for folder in _get_all_folders_recursive(group_folder):
        folder_name = _name_of(folder)
        if _is_cable_folder_or_name(folder_name):
            for pm in _get_all_placemarks_recursive(folder):
                coords = _get_linestring_coords(pm)
                if len(coords) >= 2:
                    segments.append(CableSegment(seg_id, coords))
                    seg_id += 1

    # Also check direct LineString placemarks named with cable keywords
    for pm in _get_all_placemarks_recursive(group_folder):
        pm_name = _name_of(pm)
        if _is_cable_folder_or_name(pm_name):
            coords = _get_linestring_coords(pm)
            if len(coords) >= 2:
                if not any(s.coords == coords for s in segments):
                    segments.append(CableSegment(seg_id, coords))
                    seg_id += 1

    return segments


# ---------------------------------------------------------------------------
# Pole distance from cable
# ---------------------------------------------------------------------------

def _distance_along_cable(
    pole_coords: Tuple[float, float],
    cable_path: List[Tuple[float, float]],
) -> float:
    """
    Return the cumulative distance (metres) from the cable start to the
    point on the cable nearest to the pole.
    """
    if len(cable_path) < 2:
        return float("inf")

    best_cum = 0.0
    best_dist_to_cable = float("inf")
    cumulative = 0.0

    for i in range(len(cable_path) - 1):
        a, b = cable_path[i], cable_path[i + 1]
        _, t = _project_point_to_segment(pole_coords, a, b)
        seg_len = _haversine(a, b)

        # Nearest point on this segment
        proj_lat = a[0] + t * (b[0] - a[0])
        proj_lon = a[1] + t * (b[1] - a[1])
        proj = (proj_lat, proj_lon)
        d = _haversine(pole_coords, proj)

        if d < best_dist_to_cable:
            best_dist_to_cable = d
            best_cum = cumulative + t * seg_len

        cumulative += seg_len

    return best_cum


# ---------------------------------------------------------------------------
# Fallback: sort by existing name order
# ---------------------------------------------------------------------------

def _sort_by_name_fallback(placemarks: List) -> List:
    """Sort placemarks by their existing name (natural sort)."""
    def nat_key(pm):
        n = _name_of(pm)
        parts = re.split(r"(\d+)", n)
        return [int(p) if p.isdigit() else p.lower() for p in parts]

    return sorted(placemarks, key=nat_key)


# ---------------------------------------------------------------------------
# Line Group detection
# ---------------------------------------------------------------------------

class LineGroup:
    """Represents one folder group (e.g. 'Line A FDT 01')."""

    def __init__(self, folder, name: str):
        self.folder = folder
        self.name = name
        self.new_pole_folders: List = []       # sub-folders matching NEW POLE
        self.existing_pole_folders: List = []  # sub-folders matching EXISTING POLE


def _detect_line_groups(doc_element) -> List[LineGroup]:
    """
    Detect all Line Groups at every level.
    A group is a Folder that contains at least one NEW POLE or EXISTING POLE sub-folder.
    """
    groups: List[LineGroup] = []

    def _scan(folder, depth=0):
        child_folders = _get_direct_child_folders(folder)
        new_pole_subs = [f for f in child_folders if _is_new_pole_folder(_name_of(f))]
        existing_subs = [f for f in child_folders if _is_existing_pole_folder(_name_of(f))]

        if new_pole_subs or existing_subs:
            g = LineGroup(folder, _name_of(folder))
            g.new_pole_folders = new_pole_subs
            g.existing_pole_folders = existing_subs
            groups.append(g)
            # Don't recurse further into this group's children for group detection
            return

        for child in child_folders:
            _scan(child, depth + 1)

    _scan(doc_element)
    return groups


# ---------------------------------------------------------------------------
# Core sorting logic for one pole type
# ---------------------------------------------------------------------------

def _sort_and_renumber_poles(
    pole_folders: List,
    cable_path: List[Tuple[float, float]],
    has_cable: bool,
    doc: minidom.Document,
) -> Dict[str, Any]:
    """
    Sort all poles across multiple sub-folders by cable distance,
    renumber globally, apply names, and return report data.
    """
    # Collect all poles with their folder reference
    all_poles: List[Tuple[Any, str, Optional[Tuple[float, float]]]] = []
    for folder in pole_folders:
        for pm in _get_all_placemarks_recursive(folder):
            pm_name = _name_of(pm)
            coords = _get_point_coords(pm)
            all_poles.append((pm, pm_name, coords))

    total_found = len(all_poles)

    if total_found == 0:
        return {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}

    warnings: List[str] = []
    unlinked: List[Tuple[Any, str]] = []

    if has_cable and len(cable_path) >= 2:
        # Assign distance-from-FDT
        with_dist: List[Tuple[float, Any, str]] = []
        for pm, pm_name, coords in all_poles:
            if coords is None:
                unlinked.append((pm, pm_name))
                warnings.append(f"Pole '{pm_name}' tidak memiliki koordinat — dilewati")
                continue
            dist = _distance_along_cable(coords, cable_path)
            if dist == float("inf"):
                unlinked.append((pm, pm_name))
                warnings.append(f"Pole '{pm_name}' tidak terhubung ke cable — ditaruh di akhir")
            else:
                with_dist.append((dist, pm, pm_name))

        with_dist.sort(key=lambda x: x[0])
        sorted_poles = [(pm, pm_name) for _, pm, pm_name in with_dist]
    else:
        # Fallback: sort by name
        sorted_pms = _sort_by_name_fallback([pm for pm, _, _ in all_poles])
        pm_name_map = {id(pm): nm for pm, nm, _ in all_poles}
        sorted_poles = [(pm, pm_name_map.get(id(pm), "")) for pm in sorted_pms]
        unlinked = []

    # Append unlinked at the end
    sorted_poles.extend(unlinked)

    # Determine prefix from existing names
    existing_names = [nm for _, nm in sorted_poles if nm]
    prefix, pad = _find_prefix_from_list(existing_names)

    # Apply renaming
    for idx, (pm, old_name) in enumerate(sorted_poles, start=1):
        new_name = _make_pole_name(prefix, pad, idx)
        _set_placemark_name(pm, new_name, doc)

    sorted_count = len(sorted_poles) - len(unlinked)

    return {
        "found": total_found,
        "sorted": sorted_count,
        "unlinked": len(unlinked),
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Main Engine Class
# ---------------------------------------------------------------------------

class PoleSorterEngine:
    """Main engine for KML/KMZ Pole Auto-Sorter."""

    def __init__(self):
        self.doc: Optional[minidom.Document] = None
        self.input_filename = ""
        self._is_kmz = False
        self._kmz_bytes: Optional[bytes] = None  # store original KMZ for icons/styles

    # ── Load ────────────────────────────────────────────────────────────────

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

    # ── Process ─────────────────────────────────────────────────────────────

    def process(self) -> Dict:
        if not self.doc:
            return {"status": "error", "message": "KML belum di-load"}

        doc_elem = self.doc.documentElement
        all_placemarks = _get_all_placemarks_recursive(doc_elem)

        line_groups = _detect_line_groups(doc_elem)

        if not line_groups:
            return {
                "status": "error",
                "message": "Tidak ditemukan folder NEW POLE atau EXISTING POLE. "
                           "Pastikan nama folder mengandung kata kunci: "
                           "new pole, np, tiang baru, existing pole, eksisting, dll.",
            }

        report_groups: List[Dict] = []

        for group in line_groups:
            # ── Find FDT ──────────────────────────────────────────────────
            # Try to extract FDT code from pole names
            fdt_code = None
            for pf in group.new_pole_folders + group.existing_pole_folders:
                for pm in _get_all_placemarks_recursive(pf):
                    fdt_code = _extract_fdt_code_from_pole_name(_name_of(pm))
                    if fdt_code:
                        break
                if fdt_code:
                    break

            fdt_point = _find_fdt_point(group.folder, all_placemarks, fdt_code)

            # ── Build cable graph ──────────────────────────────────────────
            segments = _collect_cable_coords(group.folder)
            has_cable = len(segments) > 0

            if has_cable:
                cable_graph = CableGraph(segments)
                cable_path = cable_graph.ordered_coords(fdt_point)
            else:
                cable_path = []

            # ── Sort NEW POLE ──────────────────────────────────────────────
            new_pole_report: Dict[str, Any] = {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}
            if group.new_pole_folders:
                new_pole_report = _sort_and_renumber_poles(
                    group.new_pole_folders, cable_path, has_cable, self.doc
                )

            # ── Sort EXISTING POLE ─────────────────────────────────────────
            existing_report: Dict[str, Any] = {"found": 0, "sorted": 0, "unlinked": 0, "warnings": []}
            if group.existing_pole_folders:
                existing_report = _sort_and_renumber_poles(
                    group.existing_pole_folders, cable_path, has_cable, self.doc
                )

            report_groups.append({
                "group": group.name,
                "fdt_code_detected": fdt_code,
                "fdt_found": fdt_point is not None,
                "cable_segments": len(segments),
                "cable_path_points": len(cable_path),
                "sort_method": "cable" if (has_cable and fdt_point) else ("cable_no_fdt" if has_cable else "name_order"),
                "new_pole": new_pole_report,
                "existing_pole": existing_report,
            })

        # ── Build output KMZ ──────────────────────────────────────────────
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

    # ── Build KMZ ───────────────────────────────────────────────────────────

    def _build_kmz(self) -> bytes:
        """Serialize the modified DOM back to KMZ bytes."""
        kml_str = self.doc.toxml(encoding="utf-8")

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as kmz_out:
            # If original was KMZ, copy non-KML files (icons, styles, etc.)
            if self._is_kmz and self._kmz_bytes:
                with zipfile.ZipFile(io.BytesIO(self._kmz_bytes), "r") as kmz_in:
                    for item in kmz_in.namelist():
                        if not item.lower().endswith(".kml"):
                            kmz_out.writestr(item, kmz_in.read(item))
            # Write updated KML
            kmz_out.writestr("doc.kml", kml_str)

        buf.seek(0)
        return buf.read()


# ---------------------------------------------------------------------------
# Public API (matches pattern of other engines)
# ---------------------------------------------------------------------------

def process_pole_sorter(
    kml_content: bytes,
    filename: str,
    is_kmz: bool = False,
) -> Dict[str, Any]:
    """
    Sort and renumber poles in a KML/KMZ file.

    Returns:
        dict with keys: status, filename, content (bytes), content_type, report
    """
    engine = PoleSorterEngine()
    load_result = engine.load_kml(kml_content, filename, is_kmz)
    if load_result.get("status") == "error":
        return load_result
    return engine.process()
