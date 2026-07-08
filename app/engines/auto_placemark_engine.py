# -*- coding: utf-8 -*-
"""
Auto Placemark Rumah Frontage Engine (Web Version)
===================================================
Adapted from V4.2 desktop script for web service usage.
- No tkinter / file dialogs
- No duckdb / Overture Maps (uses OSM/Overpass only)
- Single KML output (accepted placemarks only)
- Output filename follows input filename

Input  : boundary file bytes (KML/KMZ/GeoJSON/SHP)
Output : dict with status, filename, content (bytes), content_type
"""

from __future__ import annotations

import io
import math
import re
import time
import zipfile
import traceback
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Tuple, Optional

import geopandas as gpd
import pandas as pd
import requests
import simplekml

from shapely import wkt as shapely_wkt
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union, nearest_points


# ==========================================================
# SETTINGS
# ==========================================================
PLACEMARK_PREFIX = "HP"
DIGIT_NUMBER = 3
CENTER_METHOD = "representative"

OVERPASS_TIMEOUT_SECONDS = 180
OVERPASS_SLEEP_SECONDS = 1.0
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

MAX_TILE_SIZE_DEG = 0.02
MAX_TOTAL_TILES = 80
BBOX_MARGIN_DEG = 0.00015

MAX_DISTANCE_TO_ROAD_M = 25.0
ENABLE_BLOCKED_BY_BUILDING_FILTER = True
ENABLE_FIRST_ROW_BIN_FILTER = True
FRONTAGE_BIN_M = 6.0

ROAD_HIGHWAY_REGEX = (
    "residential|service|living_street|unclassified|tertiary|secondary|primary|"
    "path|footway|pedestrian|track|road|steps|cycleway"
)


# ==========================================================
# UTILITIES
# ==========================================================
def clean_name(text: str | None, default: str = "AREA") -> str:
    text = (text or "").strip()
    if not text:
        text = default
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^A-Za-z0-9_\- .]", "", text)
    return text.strip() or default


def make_placemark_name(number: int) -> str:
    return f"{PLACEMARK_PREFIX}-{number:0{DIGIT_NUMBER}d}"


# ==========================================================
# KML/KMZ READER
# ==========================================================
def _read_kml_text_from_bytes(content: bytes, is_kmz: bool) -> str:
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as z:
            kml_files = [n for n in z.namelist() if n.lower().endswith(".kml")]
            if not kml_files:
                raise ValueError("KMZ tidak berisi file .kml")
            main_kml = "doc.kml" if "doc.kml" in kml_files else kml_files[0]
            return z.read(main_kml).decode("utf-8", errors="ignore")
    return content.decode("utf-8", errors="ignore")


def _parse_coord_text(coord_text: str) -> List[Tuple[float, float]]:
    coords: List[Tuple[float, float]] = []
    for part in coord_text.replace("\n", " ").replace("\t", " ").split():
        vals = part.split(",")
        if len(vals) >= 2:
            try:
                lon = float(vals[0])
                lat = float(vals[1])
                coords.append((lon, lat))
            except ValueError:
                continue
    return coords


def _findall_any_ns(root: ET.Element, tag: str) -> List[ET.Element]:
    return [el for el in root.iter() if el.tag.endswith("}" + tag) or el.tag == tag]


def _first_child_text_any_ns(parent: ET.Element, tag: str) -> str | None:
    for el in parent.iter():
        if el.tag.endswith("}" + tag) or el.tag == tag:
            return el.text
    return None


def read_kml_kmz_boundaries(content: bytes, is_kmz: bool) -> gpd.GeoDataFrame:
    kml_text = _read_kml_text_from_bytes(content, is_kmz)
    root = ET.fromstring(kml_text.encode("utf-8"))

    placemarks = _findall_any_ns(root, "Placemark")
    rows: List[Dict[str, Any]] = []
    area_idx = 1

    for pm in placemarks:
        name = clean_name(_first_child_text_any_ns(pm, "name"), f"AREA_{area_idx:02d}")

        polygons: List[Polygon] = []
        for poly_el in _findall_any_ns(pm, "Polygon"):
            outer_coords_text = None
            in_outer = False
            for el in poly_el.iter():
                local = el.tag.split("}")[-1]
                if local == "outerBoundaryIs":
                    in_outer = True
                elif local == "innerBoundaryIs":
                    in_outer = False
                elif local == "coordinates" and in_outer:
                    outer_coords_text = el.text
                    break

            if not outer_coords_text:
                continue

            outer = _parse_coord_text(outer_coords_text)
            if len(outer) < 4:
                continue
            if outer[0] != outer[-1]:
                outer.append(outer[0])

            holes = []
            in_inner = False
            for el in poly_el.iter():
                local = el.tag.split("}")[-1]
                if local == "innerBoundaryIs":
                    in_inner = True
                elif local == "outerBoundaryIs":
                    in_inner = False
                elif local == "coordinates" and in_inner and el.text:
                    hole = _parse_coord_text(el.text)
                    if len(hole) >= 4:
                        if hole[0] != hole[-1]:
                            hole.append(hole[0])
                        holes.append(hole)

            try:
                poly = Polygon(outer, holes)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if not poly.is_empty:
                    if poly.geom_type == "Polygon":
                        polygons.append(poly)
                    elif poly.geom_type == "MultiPolygon":
                        polygons.extend(list(poly.geoms))
            except Exception:
                continue

        if polygons:
            geom = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)
            rows.append({"boundary_name": name, "geometry": geom})
            area_idx += 1

    if not rows:
        raise ValueError("Tidak ditemukan polygon boundary di KML/KMZ.")

    return gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")


# ==========================================================
# BOUNDARY READER (multi-format)
# ==========================================================
def read_boundary(content: bytes, filename: str) -> gpd.GeoDataFrame:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in ["kml", "kmz"]:
        is_kmz = ext == "kmz"
        gdf = read_kml_kmz_boundaries(content, is_kmz)
    elif ext in ["geojson", "json"]:
        gdf = gpd.read_file(io.BytesIO(content), driver="GeoJSON")
        if gdf.empty:
            raise ValueError("File boundary kosong.")
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        else:
            gdf = gdf.to_crs("EPSG:4326")

        name_col = None
        for c in ["name", "Name", "NAMA", "Nama", "boundary_name", "folder", "Layer"]:
            if c in gdf.columns:
                name_col = c
                break

        rows = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            if geom.geom_type not in ["Polygon", "MultiPolygon"]:
                continue
            name = clean_name(str(row[name_col]) if name_col else None, f"AREA_{len(rows)+1:02d}")
            rows.append({"boundary_name": name, "geometry": geom})

        if not rows:
            raise ValueError("Tidak ada geometry Polygon/MultiPolygon di file boundary.")
        gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    elif ext == "shp":
        # SHP needs to be in a zip with .dbf, .shx, etc.
        # Try reading directly from bytes via BytesIO
        gdf = gpd.read_file(io.BytesIO(content))
        if gdf.empty:
            raise ValueError("File shapefile kosong.")
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        else:
            gdf = gdf.to_crs("EPSG:4326")

        name_col = None
        for c in ["name", "Name", "NAMA", "Nama", "boundary_name"]:
            if c in gdf.columns:
                name_col = c
                break

        rows = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            if geom.geom_type not in ["Polygon", "MultiPolygon"]:
                continue
            name = clean_name(str(row[name_col]) if name_col else None, f"AREA_{len(rows)+1:02d}")
            rows.append({"boundary_name": name, "geometry": geom})

        if not rows:
            raise ValueError("Tidak ada geometry Polygon/MultiPolygon di file shapefile.")
        gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    else:
        raise ValueError(f"Format belum didukung: .{ext}")

    # Fix invalid geometries
    fixed_rows = []
    for _, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.geom_type in ["Polygon", "MultiPolygon"] and not geom.is_empty:
            fixed_rows.append({"boundary_name": clean_name(row["boundary_name"]), "geometry": geom})

    if not fixed_rows:
        raise ValueError("Boundary valid tidak ditemukan.")

    return gpd.GeoDataFrame(fixed_rows, geometry="geometry", crs="EPSG:4326")


# ==========================================================
# GEOMETRY HELPERS
# ==========================================================
def estimate_local_utm_crs(geom: BaseGeometry) -> str:
    lon = geom.centroid.x
    lat = geom.centroid.y
    zone = int((lon + 180) // 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    return f"EPSG:{epsg}"


def get_point_from_building(geom: BaseGeometry) -> Point:
    if CENTER_METHOD.lower() == "centroid":
        return geom.centroid
    return geom.representative_point()


def make_tiles(bounds: Tuple[float, float, float, float]) -> List[Tuple[float, float, float, float]]:
    minx, miny, maxx, maxy = bounds
    west = minx - BBOX_MARGIN_DEG
    south = miny - BBOX_MARGIN_DEG
    east = maxx + BBOX_MARGIN_DEG
    north = maxy + BBOX_MARGIN_DEG

    width = max(east - west, 0.000001)
    height = max(north - south, 0.000001)

    nx = max(1, math.ceil(width / MAX_TILE_SIZE_DEG))
    ny = max(1, math.ceil(height / MAX_TILE_SIZE_DEG))

    if nx * ny > MAX_TOTAL_TILES:
        factor = math.sqrt((nx * ny) / MAX_TOTAL_TILES)
        nx = max(1, math.ceil(nx / factor))
        ny = max(1, math.ceil(ny / factor))

    tiles = []
    for iy in range(ny):
        y1 = south + height * iy / ny
        y2 = south + height * (iy + 1) / ny
        for ix in range(nx):
            x1 = west + width * ix / nx
            x2 = west + width * (ix + 1) / nx
            tiles.append((y1, x1, y2, x2))
    return tiles


# ==========================================================
# OVERPASS COMMON
# ==========================================================
def overpass_request(query: str) -> Dict[str, Any]:
    last_error = None
    headers = {"User-Agent": "ftth-tool-auto-placemark/1.0"}

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(
                endpoint,
                data={"data": query},
                headers=headers,
                timeout=OVERPASS_TIMEOUT_SECONDS + 40,
            )
            if resp.status_code == 200:
                return resp.json()
            last_error = f"{endpoint} -> HTTP {resp.status_code}: {resp.text[:250]}"
        except Exception as e:
            last_error = f"{endpoint} -> {type(e).__name__}: {e}"

    raise RuntimeError(f"Semua endpoint Overpass gagal. Error terakhir: {last_error}")


# ==========================================================
# BUILDINGS FROM OVERPASS
# ==========================================================
def build_overpass_building_query(south: float, west: float, north: float, east: float) -> str:
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];
(
  way["building"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  relation["building"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
);
out body geom;
"""


def polygon_from_way_geometry(geometry_list: List[Dict[str, float]]) -> BaseGeometry | None:
    coords = []
    for p in geometry_list or []:
        try:
            coords.append((float(p["lon"]), float(p["lat"])))
        except Exception:
            continue
    if len(coords) < 4:
        return None
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    try:
        poly = Polygon(coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.geom_type not in ["Polygon", "MultiPolygon"]:
            return None
        return poly
    except Exception:
        return None


def polygon_from_relation(element: Dict[str, Any]) -> BaseGeometry | None:
    polys = []
    for mem in element.get("members", []) or []:
        if mem.get("role") not in ["outer", ""]:
            continue
        geom = polygon_from_way_geometry(mem.get("geometry", []))
        if geom is None or geom.is_empty:
            continue
        if geom.geom_type == "Polygon":
            polys.append(geom)
        elif geom.geom_type == "MultiPolygon":
            polys.extend(list(geom.geoms))
    if not polys:
        return None
    try:
        return unary_union(polys)
    except Exception:
        return MultiPolygon(polys)


def element_to_building_record(element: Dict[str, Any]) -> Dict[str, Any] | None:
    etype = element.get("type", "")
    eid = element.get("id", "")
    tags = element.get("tags", {}) or {}

    geom = None
    if etype == "way":
        geom = polygon_from_way_geometry(element.get("geometry", []))
    elif etype == "relation":
        geom = polygon_from_relation(element)

    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty or geom.geom_type not in ["Polygon", "MultiPolygon"]:
        return None

    return {
        "source_id": f"osm/{etype}/{eid}",
        "source": "OSM",
        "building": tags.get("building", ""),
        "name": tags.get("name", ""),
        "geometry": geom,
    }


def download_buildings_osm(boundary_geom: BaseGeometry, progress_cb=None) -> gpd.GeoDataFrame:
    tiles = make_tiles(boundary_geom.bounds)
    records: Dict[str, Dict[str, Any]] = {}

    for i, (south, west, north, east) in enumerate(tiles, start=1):
        if progress_cb:
            progress_cb(f"Query OSM building tile {i}/{len(tiles)}")
        query = build_overpass_building_query(south, west, north, east)
        try:
            data = overpass_request(query)
        except Exception as e:
            print(f"  GAGAL tile building {i}: {e}")
            continue

        for el in data.get("elements", []) or []:
            rec = element_to_building_record(el)
            if rec is not None:
                records[rec["source_id"]] = rec

        if i < len(tiles):
            time.sleep(OVERPASS_SLEEP_SECONDS)

    if not records:
        return gpd.GeoDataFrame(
            columns=["source_id", "source", "building", "name", "geometry"],
            geometry="geometry", crs="EPSG:4326"
        )

    return gpd.GeoDataFrame(list(records.values()), geometry="geometry", crs="EPSG:4326")


# ==========================================================
# ROADS FROM OVERPASS
# ==========================================================
def build_overpass_road_query(south: float, west: float, north: float, east: float) -> str:
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];
(
  way["highway"~"{ROAD_HIGHWAY_REGEX}"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
);
out body geom;
"""


def line_from_way_geometry(geometry_list: List[Dict[str, float]]) -> BaseGeometry | None:
    coords = []
    for p in geometry_list or []:
        try:
            coords.append((float(p["lon"]), float(p["lat"])))
        except Exception:
            continue
    if len(coords) < 2:
        return None
    try:
        line = LineString(coords)
        return None if line.is_empty else line
    except Exception:
        return None


def element_to_road_record(element: Dict[str, Any]) -> Dict[str, Any] | None:
    etype = element.get("type", "")
    eid = element.get("id", "")
    tags = element.get("tags", {}) or {}
    if etype != "way":
        return None
    geom = line_from_way_geometry(element.get("geometry", []))
    if geom is None or geom.is_empty:
        return None
    return {
        "road_id": f"osm/way/{eid}",
        "highway": tags.get("highway", ""),
        "name": tags.get("name", ""),
        "service": tags.get("service", ""),
        "geometry": geom,
    }


def download_roads_osm(boundary_geom: BaseGeometry, progress_cb=None) -> gpd.GeoDataFrame:
    tiles = make_tiles(boundary_geom.bounds)
    records: Dict[str, Dict[str, Any]] = {}

    for i, (south, west, north, east) in enumerate(tiles, start=1):
        if progress_cb:
            progress_cb(f"Query OSM road/gang tile {i}/{len(tiles)}")
        query = build_overpass_road_query(south, west, north, east)
        try:
            data = overpass_request(query)
        except Exception as e:
            print(f"  GAGAL tile road {i}: {e}")
            continue

        for el in data.get("elements", []) or []:
            rec = element_to_road_record(el)
            if rec is not None:
                records[rec["road_id"]] = rec

        if i < len(tiles):
            time.sleep(OVERPASS_SLEEP_SECONDS)

    if not records:
        return gpd.GeoDataFrame(
            columns=["road_id", "highway", "name", "service", "geometry"],
            geometry="geometry", crs="EPSG:4326"
        )

    roads = gpd.GeoDataFrame(list(records.values()), geometry="geometry", crs="EPSG:4326")

    try:
        roads = roads[roads.geometry.intersects(boundary_geom.buffer(BBOX_MARGIN_DEG * 2))].copy()
    except Exception:
        pass

    return roads


# ==========================================================
# FRONTAGE FILTER
# ==========================================================
def nearest_road_info(point_m: Point, roads_m: gpd.GeoDataFrame) -> Optional[Dict[str, Any]]:
    if roads_m.empty:
        return None

    distances = roads_m.geometry.distance(point_m)
    if distances.empty:
        return None
    min_pos = int(distances.values.argmin())
    road_row = roads_m.iloc[min_pos]
    road_geom = road_row.geometry
    dist_m = float(distances.iloc[min_pos])
    try:
        foot = nearest_points(point_m, road_geom)[1]
    except Exception:
        return None

    proj = 0.0
    side = "N"
    try:
        if road_geom.geom_type == "LineString":
            proj = float(road_geom.project(foot))
            side = get_side_of_line(road_geom, foot, point_m)
        else:
            parts = list(road_geom.geoms)
            part_dist = [p.distance(point_m) for p in parts]
            part = parts[int(pd.Series(part_dist).idxmin())]
            foot = nearest_points(point_m, part)[1]
            proj = float(part.project(foot))
            side = get_side_of_line(part, foot, point_m)
    except Exception:
        pass

    return {
        "road_index": roads_m.index[min_pos],
        "road_id": str(road_row.get("road_id", "")),
        "road_name": str(road_row.get("name", "")),
        "road_highway": str(road_row.get("highway", "")),
        "distance_m": dist_m,
        "foot_point": foot,
        "projection_m": proj,
        "side": side,
    }


def get_side_of_line(line: LineString, foot: Point, point: Point) -> str:
    try:
        d = line.project(foot)
        eps = min(max(line.length * 0.001, 0.5), 2.0)
        p1 = line.interpolate(max(0, d - eps))
        p2 = line.interpolate(min(line.length, d + eps))
        vx = p2.x - p1.x
        vy = p2.y - p1.y
        wx = point.x - foot.x
        wy = point.y - foot.y
        cross = vx * wy - vy * wx
        return "L" if cross >= 0 else "R"
    except Exception:
        return "N"


def access_line_blocked_by_other_building(
    access_line: LineString,
    self_building_idx: int,
    buildings_m: gpd.GeoDataFrame,
) -> Tuple[bool, str]:
    if access_line.is_empty:
        return False, ""

    try:
        candidate_indices = list(buildings_m.sindex.query(access_line, predicate="intersects"))
    except Exception:
        candidate_indices = list(range(len(buildings_m)))

    for idx in candidate_indices:
        if idx == self_building_idx:
            continue
        geom = buildings_m.iloc[idx].geometry
        if geom is None or geom.is_empty:
            continue
        try:
            test_geom = geom.buffer(-0.05)
            if test_geom.is_empty:
                test_geom = geom
            inter = access_line.intersection(test_geom)
            if not inter.is_empty:
                if getattr(inter, "length", 0.0) > 0.20 or inter.geom_type in ["Point", "MultiPoint"]:
                    source_id = str(buildings_m.iloc[idx].get("source_id", ""))
                    return True, source_id
        except Exception:
            continue
    return False, ""


def prepare_candidate_points(
    boundary_name: str,
    boundary_geom: BaseGeometry,
    buildings: gpd.GeoDataFrame,
    roads: gpd.GeoDataFrame,
) -> List[Dict[str, Any]]:
    """Filter buildings and return list of accepted frontage points."""

    if buildings.empty or roads.empty:
        return []

    crs_m = estimate_local_utm_crs(boundary_geom)

    # Filter buildings whose center point is inside boundary
    temp_rows = []
    for original_idx, b in buildings.iterrows():
        geom = b.geometry
        if geom is None or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue

        point = get_point_from_building(geom)

        if not (boundary_geom.contains(point) or boundary_geom.touches(point)):
            if boundary_geom.intersects(geom):
                inter = boundary_geom.intersection(geom)
                if not inter.is_empty:
                    point = inter.representative_point()
                else:
                    continue
            else:
                continue

        if not (boundary_geom.contains(point) or boundary_geom.touches(point)):
            continue

        temp_rows.append({
            "orig_building_index": original_idx,
            "source_id": str(b.get("source_id", "")),
            "source": str(b.get("source", "")),
            "building": str(b.get("building", "")),
            "name": str(b.get("name", "")),
            "geometry": geom,
            "point_geom": point,
        })

    if not temp_rows:
        return []

    buildings_in = gpd.GeoDataFrame(temp_rows, geometry="geometry", crs="EPSG:4326")
    points_in = gpd.GeoDataFrame(temp_rows, geometry="point_geom", crs="EPSG:4326")

    buildings_m = buildings_in.to_crs(crs_m)
    points_m = points_in.to_crs(crs_m)
    roads_m = roads.to_crs(crs_m)

    accepted_stage: List[Dict[str, Any]] = []

    for i in range(len(buildings_m)):
        p4326 = points_in.geometry.iloc[i]
        p_m = points_m.geometry.iloc[i]

        road_info = nearest_road_info(p_m, roads_m)
        if road_info is None:
            continue

        if road_info["distance_m"] > MAX_DISTANCE_TO_ROAD_M:
            continue

        if ENABLE_BLOCKED_BY_BUILDING_FILTER:
            access_line = LineString([p_m, road_info["foot_point"]])
            blocked, _ = access_line_blocked_by_other_building(access_line, i, buildings_m)
            if blocked:
                continue

        bin_no = int(road_info["projection_m"] // FRONTAGE_BIN_M) if FRONTAGE_BIN_M > 0 else 0
        group_key = (road_info["road_id"], road_info["side"], bin_no)

        accepted_stage.append({
            "boundary": boundary_name,
            "point": p4326,
            "source_id": str(buildings_in.iloc[i].get("source_id", "")),
            "road_id": road_info["road_id"],
            "road_name": road_info["road_name"],
            "distance_to_road_m": road_info["distance_m"],
            "road_side": road_info["side"],
            "frontage_bin": bin_no,
            "frontage_key": group_key,
        })

    # First-row filter: per frontage bin, keep only nearest building
    if ENABLE_FIRST_ROW_BIN_FILTER:
        best_by_key: Dict[Tuple, int] = {}
        for idx, row in enumerate(accepted_stage):
            key = row["frontage_key"]
            if key not in best_by_key:
                best_by_key[key] = idx
            else:
                prev_idx = best_by_key[key]
                if row["distance_to_road_m"] < accepted_stage[prev_idx]["distance_to_road_m"]:
                    best_by_key[key] = idx

        keep_indices = set(best_by_key.values())
        accepted_stage = [row for idx, row in enumerate(accepted_stage) if idx in keep_indices]

    return accepted_stage


# ==========================================================
# KML EXPORT
# ==========================================================
def export_kml_accepted(rows: List[Dict[str, Any]]) -> bytes:
    kml = simplekml.Kml()
    root_folder = kml.newfolder(name="Auto Placemark Frontage")

    folders: Dict[str, Any] = {}
    for row in rows:
        bname = row["Boundary"]
        if bname not in folders:
            folders[bname] = root_folder.newfolder(name=bname)

        folders[bname].newpoint(
            name=row["Placemark"],
            coords=[(row["Longitude"], row["Latitude"])],
        )

    return kml.kml().encode("utf-8")


# ==========================================================
# MAIN ENGINE FUNCTION
# ==========================================================
def process_auto_placemark(
    boundary_content: bytes,
    filename: str,
    is_kmz: bool = False,
    progress_cb=None,
) -> Dict[str, Any]:
    """
    Main processing function.

    Args:
        boundary_content: raw bytes of the boundary file
        filename: original filename (used to detect format)
        is_kmz: True if KMZ
        progress_cb: optional callback(message: str) for progress updates

    Returns:
        dict with status, filename, content (bytes), content_type
    """
    try:
        if progress_cb:
            progress_cb("Membaca file boundary...")

        # Determine file extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "kmz":
            is_kmz = True

        boundaries = read_boundary(boundary_content, filename)
        print(f"[auto_placemark] Jumlah boundary terbaca: {len(boundaries)}")

        accepted_rows: List[Dict[str, Any]] = []
        global_no = 1

        for idx, brow in boundaries.iterrows():
            boundary_name = clean_name(str(brow["boundary_name"]), f"AREA_{idx+1:02d}")
            boundary_geom = brow.geometry
            if not boundary_geom.is_valid:
                boundary_geom = boundary_geom.buffer(0)

            if progress_cb:
                progress_cb(f"Mengunduh data bangunan OSM untuk {boundary_name}...")

            try:
                buildings = download_buildings_osm(boundary_geom, progress_cb)
            except Exception as e:
                print(f"[auto_placemark] GAGAL building untuk {boundary_name}: {e}")
                continue

            if progress_cb:
                progress_cb(f"Mengunduh data jalan/gang OSM untuk {boundary_name}...")

            try:
                roads = download_roads_osm(boundary_geom, progress_cb)
            except Exception as e:
                print(f"[auto_placemark] GAGAL roads untuk {boundary_name}: {e}")
                roads = gpd.GeoDataFrame(
                    columns=["road_id", "highway", "name", "service", "geometry"],
                    geometry="geometry", crs="EPSG:4326"
                )

            print(f"[auto_placemark] {boundary_name}: {len(buildings)} buildings, {len(roads)} roads")

            if progress_cb:
                progress_cb(f"Memfilter rumah frontage untuk {boundary_name}...")

            accepted_stage = prepare_candidate_points(boundary_name, boundary_geom, buildings, roads)

            # Sort: north to south, then west to east
            accepted_stage.sort(key=lambda r: (-r["point"].y, r["point"].x))

            for item in accepted_stage:
                placemark = make_placemark_name(global_no)
                accepted_rows.append({
                    "No": global_no,
                    "Boundary": item["boundary"],
                    "Placemark": placemark,
                    "Latitude": round(item["point"].y, 7),
                    "Longitude": round(item["point"].x, 7),
                })
                global_no += 1

        if not accepted_rows:
            return {
                "status": "error",
                "message": (
                    "Tidak ada placemark frontage yang berhasil dibuat. "
                    "Kemungkinan: (1) Data bangunan/jalan OSM di area boundary kosong. "
                    "(2) Boundary bukan koordinat WGS84. "
                    "(3) Filter terlalu ketat."
                ),
            }

        if progress_cb:
            progress_cb("Mengekspor KML...")

        kml_bytes = export_kml_accepted(accepted_rows)

        # Output filename follows input name
        base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
        output_filename = f"{base_name}_placemark.kml"

        print(f"[auto_placemark] Total accepted: {len(accepted_rows)}, output: {output_filename}")

        return {
            "status": "success",
            "filename": output_filename,
            "content": kml_bytes,
            "content_type": "application/vnd.google-earth.kml+xml",
            "report": {
                "total_accepted": len(accepted_rows),
                "boundaries_processed": len(boundaries),
            },
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "status": "error",
            "message": str(e),
        }
