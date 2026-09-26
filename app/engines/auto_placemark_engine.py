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
import os
import re
import time
import zipfile
import traceback
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
# minidom & xml.etree bawaan Python rentan terhadap serangan ini.
import xml.etree.ElementTree as ET
from defusedxml.ElementTree import fromstring as safe_fromstring
from typing import Any, Dict, List, Tuple, Optional

from utils.commons import load_kml_bytes
from engines.building_sources import (
    BUILDING_SOURCE,
    GOB_MIN_CONFIDENCE,
    BuildingSourceUnavailable,
    empty_buildings,
    empty_roads,
    fetch_gob_buildings,
    fetch_overture_features,
    load_custom_buildings,
    merge_buildings,
)

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
# Penamaan hasil: NN-01, NN-02, ... Lebar minimal 2 digit; di atas 99 nomor
# tetap bertambah apa adanya (NN-100, NN-101, ...).
PLACEMARK_PREFIX = "NN"
DIGIT_NUMBER = 2
CENTER_METHOD = "representative"

OVERPASS_TIMEOUT_SECONDS = 180
OVERPASS_SLEEP_SECONDS = 1.0
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    # Instance lz4 berbagi basis data dengan overpass-api.de tapi antreannya
    # terpisah, jadi sering lolos ketika yang utama sedang penuh.
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

# Percobaan ulang Overpass: tiap putaran mencoba SEMUA endpoint,
# lalu menunggu sebelum putaran berikutnya.
OVERPASS_MAX_ATTEMPTS = 3
OVERPASS_RETRY_BASE_SECONDS = 5

MAX_TILE_SIZE_DEG = 0.02
MAX_TOTAL_TILES = 80
BBOX_MARGIN_DEG = 0.00015

MAX_DISTANCE_TO_ROAD_M = float(os.environ.get("AUTO_PLACEMARK_MAX_ROAD_M", "25"))
# Luas minimum footprint supaya pos ronda, kanopi, dan WC luar tidak ikut
# jadi HP. Dihitung dari geometri dalam UTM, bukan dari atribut sumber, agar
# berlaku sama untuk footprint OSM maupun hasil deteksi citra.
MIN_BUILDING_AREA_M2 = float(os.environ.get("AUTO_PLACEMARK_MIN_AREA_M2", "12"))
ENABLE_BLOCKED_BY_BUILDING_FILTER = True
ENABLE_FIRST_ROW_BIN_FILTER = True
# Jarak minimal antar rumah di sepanjang muka jalan yang sama. 6 m terlalu
# lebar untuk rumah deret di Indonesia (umumnya 4-5 m), sehingga rumah asli
# ikut terbuang. Rumah baris kedua sudah disaring oleh filter 'terhalang
# bangunan lain'.
MIN_FRONTAGE_SPACING_M = float(os.environ.get("AUTO_PLACEMARK_SPACING_M", "4"))

# Titik yang ditolak ikut di KML sebagai folder tak tercentang. Nyala secara
# bawaan: tanpa ini, satu-satunya cara tahu KENAPA sebuah rumah hilang adalah
# menebak dari angka agregat.
INCLUDE_REJECTED_IN_KML = os.environ.get(
    "AUTO_PLACEMARK_DEBUG_KML", "1").strip().lower() not in ("0", "false", "off")
MAX_REJECTED_IN_KML = int(os.environ.get("AUTO_PLACEMARK_MAX_REJECTED", "5000"))
# Laporan Excel (DITERIMA / DITOLAK / DIAGNOSTIK). Mati secara bawaan karena
# menyalakannya mengubah unduhan dari .kml menjadi .zip.
EXPORT_EXCEL_REPORT = os.environ.get(
    "AUTO_PLACEMARK_EXCEL", "0").strip().lower() not in ("0", "false", "off")

# Batas waktu total pengambilan data OSM per job. Tanpa batas, 80 tile x
# percobaan ulang bisa menahan worker selama berjam-jam.
MAX_FETCH_SECONDS = int(os.environ.get("AUTO_PLACEMARK_MAX_SECONDS", "900"))

# `trunk` ditambahkan: banyak jalan nasional/provinsi di Indonesia di-tag
# highway=trunk. Tanpa itu, rumah di pinggir jalan raya tidak menemukan
# jalan mana pun dalam radius 25 m lalu dibuang diam-diam. Regex Overpass
# tidak berjangkar, jadi `trunk` sekaligus mencakup `trunk_link` (begitu
# pula `primary` mencakup `primary_link`, dst).
ROAD_HIGHWAY_REGEX = (
    "residential|service|living_street|unclassified|tertiary|secondary|primary|"
    "trunk|path|footway|pedestrian|track|road|steps|cycleway"
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
    """Ambil teks KML dari berkas KML maupun KMZ.

    Dialihkan ke load_kml_bytes(): selain membongkar KMZ, ia juga membenahi
    encoding, '&' telanjang, entitas HTML, dan prefix namespace yang tidak
    dideklarasikan. Versi sebelumnya men-decode dengan errors="ignore" yang
    membuang byte non-UTF-8 diam-diam, sehingga nama berhuruf aksen rusak
    tanpa peringatan.
    """
    return load_kml_bytes(content, is_kmz).decode("utf-8")


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
    root = safe_fromstring(kml_text.encode("utf-8"))

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
            # unary_union, bukan MultiPolygon(): MultiPolygon menolak bagian
            # yang saling tumpang tindih, dan boundary hasil digitasi tangan
            # kerap begitu.
            geom = polygons[0] if len(polygons) == 1 else unary_union(polygons)
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
def indonesia_coord_warning(geom: BaseGeometry) -> str:
    """Deteksi dini boundary yang bukan lon/lat WGS84.

    Tanpa ini, boundary dalam UTM meter tetap diproses sampai selesai lalu
    berakhir nol placemark tanpa sebab yang jelas — bbox-nya sekadar tidak
    beririsan dengan data mana pun.
    """
    minx, miny, maxx, maxy = geom.bounds
    if not (90 <= minx <= 145 and 90 <= maxx <= 145
            and -15 <= miny <= 10 and -15 <= maxy <= 10):
        return (
            "Koordinat boundary tampaknya bukan lon/lat WGS84 Indonesia. "
            f"BBOX terbaca: lon {minx:.6f}..{maxx:.6f}, lat {miny:.6f}..{maxy:.6f}. "
            "Proyeksikan ulang ke EPSG:4326 (derajat desimal)."
        )
    return ""


def approx_area_km2(geom: BaseGeometry) -> float:
    try:
        return float(
            gpd.GeoSeries([geom], crs="EPSG:4326").to_crs("EPSG:6933").area.iloc[0] / 1_000_000
        )
    except Exception:
        return 0.0


def to_polygonal(geom: Optional[BaseGeometry]) -> Optional[BaseGeometry]:
    """Paksa jadi Polygon/MultiPolygon, termasuk menyelamatkan isi
    GeometryCollection yang kalau tidak begini akan dibuang utuh."""
    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        try:
            geom = geom.buffer(0)
        except Exception:
            return None
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms
                 if g.geom_type in ("Polygon", "MultiPolygon") and not g.is_empty]
        if not polys:
            return None
        return unary_union(polys)
    return None


def estimate_local_utm_crs(geom: BaseGeometry) -> str:
    lon = geom.centroid.x
    lat = geom.centroid.y
    zone = int((lon + 180) // 6) + 1
    epsg = 32600 + zone if lat >= 0 else 32700 + zone
    return f"EPSG:{epsg}"


def get_point_from_building(geom: BaseGeometry) -> Point:
    if CENTER_METHOD.lower() == "centroid":
        # Centroid bangunan berbentuk L atau U bisa jatuh di luar
        # bangunannya sendiri; kalau begitu pakai representative_point.
        c = geom.centroid
        if geom.contains(c):
            return c
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
    """
    Kirim query ke Overpass dengan percobaan ulang berjenjang.

    Versi sebelumnya mencoba tiap endpoint TEPAT SEKALI tanpa jeda. Overpass
    rutin membalas 429 (Too Many Requests) atau 504 untuk permintaan dari IP
    pusat data — persis kondisi Hugging Face Spaces — sementara dari koneksi
    rumah biasanya langsung lolos. Itu sebabnya tool ini jalan saat diuji
    lokal tapi gagal di produksi.

    Kode yang layak diulang (429/502/503/504) sekarang diberi jeda menaik,
    dan pesan errornya menjelaskan apa yang terjadi alih-alih sekadar gagal.
    """
    last_error = None
    headers = {
        # Overpass memblokir User-Agent generik. Sertakan kontak sesuai
        # etika pemakaian API mereka.
        "User-Agent": "ftth-tool-auto-placemark/1.1 (+https://ftthtools.my.id)",
        "Accept": "application/json",
    }
    retryable = {429, 502, 503, 504}
    saw_rate_limit = False

    for attempt in range(1, OVERPASS_MAX_ATTEMPTS + 1):
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

                if resp.status_code in retryable:
                    if resp.status_code == 429:
                        saw_rate_limit = True
                    last_error = f"{endpoint} -> HTTP {resp.status_code}"
                    continue

                # Kode lain (mis. 400 query salah) tidak akan membaik
                # dengan diulang.
                raise RuntimeError(
                    f"Overpass menolak query: HTTP {resp.status_code} — {resp.text[:200]}"
                )
            except requests.RequestException as e:
                last_error = f"{endpoint} -> {type(e).__name__}: {e}"

        if attempt < OVERPASS_MAX_ATTEMPTS:
            # Jeda menaik: 5 dtk, 15 dtk, 45 dtk
            time.sleep(OVERPASS_RETRY_BASE_SECONDS * (3 ** (attempt - 1)))

    hint = (
        "Server OpenStreetMap sedang membatasi permintaan (rate limit). "
        "Coba lagi beberapa menit lagi, atau perkecil area boundary."
        if saw_rate_limit else
        "Server OpenStreetMap sedang tidak dapat dihubungi. Coba lagi nanti."
    )
    raise RuntimeError(f"{hint} (detail: {last_error})")


# ==========================================================
# BUILDINGS FROM OVERPASS
# ==========================================================
def build_overpass_combined_query(south: float, west: float, north: float, east: float) -> str:
    """Bangunan + jalan dalam SATU permintaan per tile (dulu dua permintaan
    terpisah — jumlah request, dan risiko HTTP 429, jadi dua kali lipat)."""
    bbox = f"({south:.7f},{west:.7f},{north:.7f},{east:.7f})"
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT_SECONDS}];
(
  way["building"]{bbox};
  relation["building"]{bbox};
  way["highway"~"{ROAD_HIGHWAY_REGEX}"]{bbox};
);
out body geom;
"""


class FetchStats:
    def __init__(self):
        self.tiles = 0
        self.failed = 0
        self.skipped_timeout = 0
        self.started = time.monotonic()

    def out_of_time(self) -> bool:
        return time.monotonic() - self.started > MAX_FETCH_SECONDS


def download_osm_features(boundary_geom: BaseGeometry, progress_cb=None,
                          stats: Optional[FetchStats] = None
                          ) -> Tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """Unduh bangunan dan jalan untuk satu boundary; tile gagal dicatat di stats."""
    stats = stats or FetchStats()
    tiles = make_tiles(boundary_geom.bounds)
    buildings: Dict[str, Dict[str, Any]] = {}
    roads: Dict[str, Dict[str, Any]] = {}

    for i, (south, west, north, east) in enumerate(tiles, start=1):
        if stats.out_of_time():
            stats.skipped_timeout += len(tiles) - i + 1
            break
        stats.tiles += 1
        if progress_cb:
            progress_cb(f"Query OSM tile {i}/{len(tiles)}")
        try:
            data = overpass_request(build_overpass_combined_query(south, west, north, east))
        except Exception as e:
            print(f"  GAGAL tile {i}: {e}")
            stats.failed += 1
            continue

        for el in data.get("elements", []) or []:
            tags = el.get("tags", {}) or {}
            if "building" in tags:
                rec = element_to_building_record(el)
                if rec is not None:
                    buildings[rec["source_id"]] = rec
            elif "highway" in tags:
                rec = element_to_road_record(el)
                if rec is not None:
                    roads[rec["road_id"]] = rec

        if i < len(tiles):
            time.sleep(OVERPASS_SLEEP_SECONDS)

    b_gdf = (gpd.GeoDataFrame(list(buildings.values()), geometry="geometry", crs="EPSG:4326")
             if buildings else gpd.GeoDataFrame(
                 columns=["source_id", "source", "building", "name", "geometry"],
                 geometry="geometry", crs="EPSG:4326"))
    r_gdf = (gpd.GeoDataFrame(list(roads.values()), geometry="geometry", crs="EPSG:4326")
             if roads else gpd.GeoDataFrame(
                 columns=["road_id", "highway", "name", "service", "geometry"],
                 geometry="geometry", crs="EPSG:4326"))
    if not r_gdf.empty:
        try:
            r_gdf = r_gdf[r_gdf.geometry.intersects(boundary_geom.buffer(BBOX_MARGIN_DEG * 2))].copy()
        except Exception:
            pass
    return b_gdf, r_gdf


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

    geom = to_polygonal(geom)
    if geom is None:
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

    # Indeks spasial: dulu jarak ke SEMUA jalan dihitung untuk setiap
    # bangunan (O(bangunan x jalan)).
    try:
        idx = roads_m.sindex.nearest(point_m, return_all=False)
        min_pos = int(idx[1][0])
    except Exception:
        distances = roads_m.geometry.distance(point_m)
        if distances.empty:
            return None
        min_pos = int(distances.values.argmin())
    road_row = roads_m.iloc[min_pos]
    road_geom = road_row.geometry
    dist_m = float(road_geom.distance(point_m))
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
    geoms_m: Optional[List[BaseGeometry]] = None,
    source_ids: Optional[List[str]] = None,
) -> Tuple[bool, str]:
    """geoms_m/source_ids: kolom yang sudah dimaterialkan pemanggil, supaya
    tidak ada .iloc per kandidat di dalam loop panas ini."""
    if access_line.is_empty:
        return False, ""

    if geoms_m is None:
        geoms_m = list(buildings_m.geometry)
    if source_ids is None:
        source_ids = [str(x) for x in buildings_m.get("source_id", [""] * len(geoms_m))]

    try:
        candidate_indices = list(buildings_m.sindex.query(access_line, predicate="intersects"))
    except Exception:
        candidate_indices = list(range(len(geoms_m)))

    for idx in candidate_indices:
        if idx == self_building_idx:
            continue
        geom = geoms_m[idx]
        if geom is None or geom.is_empty:
            continue
        try:
            test_geom = geom.buffer(-0.05)
            if test_geom.is_empty:
                test_geom = geom
            inter = access_line.intersection(test_geom)
            if not inter.is_empty:
                if getattr(inter, "length", 0.0) > 0.20 or inter.geom_type in ["Point", "MultiPoint"]:
                    return True, source_ids[idx] if idx < len(source_ids) else ""
        except Exception:
            continue
    return False, ""


REJECT_STATUS_LABEL = {
    "TANPA_DATA_JALAN": "Tidak ada data jalan/gang sama sekali di boundary ini",
    "TERLALU_KECIL": "Luas footprint di bawah ambang minimum",
    "TANPA_AKSES_JALAN": "Tidak ditemukan jalan/gang terdekat",
    "TERLALU_JAUH_JALAN": "Jarak ke jalan melebihi batas",
    "TERHALANG_BANGUNAN": "Jalur ke jalan terhalang bangunan lain (rumah baris kedua)",
    "BERDEMPETAN": "Ada rumah lain yang lebih dekat jalan di muka jalan yang sama",
}


def make_reject_row(
    boundary_name: str,
    point: Optional[Point],
    source_id: str,
    source: str,
    status: str,
    note: str,
    road_info: Optional[Dict[str, Any]] = None,
    area_m2: Optional[float] = None,
) -> Dict[str, Any]:
    road_info = road_info or {}
    try:
        lat = round(point.y, 7)
        lon = round(point.x, 7)
    except Exception:
        lat, lon = "", ""
    return {
        "Boundary": boundary_name,
        "Latitude": lat,
        "Longitude": lon,
        "Source_ID": source_id,
        "Source": source,
        "Luas_m2": round(area_m2, 1) if area_m2 is not None else "",
        "Road_ID": str(road_info.get("road_id", "")),
        "Road_Name": str(road_info.get("road_name", "")),
        "Road_Type": str(road_info.get("road_highway", "")),
        "Jarak_Ke_Jalan_m": (round(float(road_info["distance_m"]), 2)
                             if "distance_m" in road_info else ""),
        "Status": status,
        "Alasan": note,
    }


def prepare_candidate_points(
    boundary_name: str,
    boundary_geom: BaseGeometry,
    buildings: gpd.GeoDataFrame,
    roads: gpd.GeoDataFrame,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    """Filter buildings -> (diterima, ditolak, diagnostik).

    Daftar 'ditolak' berisi titik + alasan per bangunan, bukan sekadar
    hitungan. Angka agregat memberi tahu BERAPA yang gugur; hanya titiknya
    yang memberi tahu DI MANA, dan itu yang menentukan apakah gang tertentu
    perlu dipetakan atau ambang filter yang perlu diubah.
    """
    diag = {
        "di_dalam_boundary": 0,
        "dibuang_kecil": 0,
        "dibuang_tanpa_jalan": 0,
        "dibuang_jauh": 0,
        "dibuang_terhalang": 0,
        "dibuang_rapat": 0,
    }
    rejected: List[Dict[str, Any]] = []

    if buildings.empty:
        return [], rejected, diag

    if roads.empty:
        # Tanpa jalan semua rumah gugur. Tetap catat titiknya supaya
        # terlihat di peta bahwa rumahnya ADA, yang hilang jalannya.
        for _, b in buildings.iterrows():
            geom = to_polygonal(b.geometry)
            if geom is None:
                continue
            p = get_point_from_building(geom)
            if boundary_geom.contains(p) or boundary_geom.touches(p):
                diag["dibuang_tanpa_jalan"] += 1
                rejected.append(make_reject_row(
                    boundary_name, p, str(b.get("source_id", "")),
                    str(b.get("source", "")), "TANPA_DATA_JALAN",
                    REJECT_STATUS_LABEL["TANPA_DATA_JALAN"]))
        diag["di_dalam_boundary"] = diag["dibuang_tanpa_jalan"]
        return [], rejected, diag

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

    diag["di_dalam_boundary"] = len(temp_rows)
    if not temp_rows:
        return [], rejected, diag

    buildings_in = gpd.GeoDataFrame(temp_rows, geometry="geometry", crs="EPSG:4326")
    points_in = gpd.GeoDataFrame(temp_rows, geometry="point_geom", crs="EPSG:4326")

    buildings_m = buildings_in.to_crs(crs_m)
    points_m = points_in.to_crs(crs_m)
    roads_m = roads.to_crs(crs_m)

    # Materialkan kolom sekali di depan. Sebelumnya tiap iterasi memanggil
    # .iloc[i] tiga kali, dan .iloc pada GeoDataFrame membangun Series baru
    # setiap panggilan — tiga ribu Series untuk seribu bangunan.
    pts_4326 = list(points_in.geometry)
    pts_m = list(points_m.geometry)
    geoms_m = list(buildings_m.geometry)
    areas_m2 = list(buildings_m.geometry.area)
    source_ids = [str(x) for x in buildings_in["source_id"]]
    sources = [str(x) for x in buildings_in["source"]]

    accepted_stage: List[Dict[str, Any]] = []

    for i in range(len(geoms_m)):
        p4326 = pts_4326[i]
        p_m = pts_m[i]

        src = source_ids[i]
        origin = sources[i]

        area = areas_m2[i]
        # Geometri rusak memberi luas NaN; perbandingan apa pun dengan NaN
        # bernilai False, jadi tanpa cek ini bangunan rusak justru lolos.
        if math.isnan(area):
            diag["dibuang_kecil"] += 1
            rejected.append(make_reject_row(
                boundary_name, p4326, src, origin, "TERLALU_KECIL",
                "Geometri bangunan rusak (luas tidak terhitung)"))
            continue
        if MIN_BUILDING_AREA_M2 > 0 and area < MIN_BUILDING_AREA_M2:
            diag["dibuang_kecil"] += 1
            rejected.append(make_reject_row(
                boundary_name, p4326, src, origin, "TERLALU_KECIL",
                f"Luas {area:.1f} m2 di bawah {MIN_BUILDING_AREA_M2:.0f} m2",
                area_m2=area))
            continue

        road_info = nearest_road_info(p_m, roads_m)
        if road_info is None:
            diag["dibuang_tanpa_jalan"] += 1
            rejected.append(make_reject_row(
                boundary_name, p4326, src, origin, "TANPA_AKSES_JALAN",
                REJECT_STATUS_LABEL["TANPA_AKSES_JALAN"], area_m2=areas_m2[i]))
            continue

        if road_info["distance_m"] > MAX_DISTANCE_TO_ROAD_M:
            diag["dibuang_jauh"] += 1
            rejected.append(make_reject_row(
                boundary_name, p4326, src, origin, "TERLALU_JAUH_JALAN",
                f"Jarak ke jalan {road_info['distance_m']:.1f} m melebihi "
                f"{MAX_DISTANCE_TO_ROAD_M:.0f} m",
                road_info, areas_m2[i]))
            continue

        if ENABLE_BLOCKED_BY_BUILDING_FILTER:
            access_line = LineString([p_m, road_info["foot_point"]])
            blocked, blocker = access_line_blocked_by_other_building(
                access_line, i, buildings_m, geoms_m, source_ids)
            if blocked:
                diag["dibuang_terhalang"] += 1
                rejected.append(make_reject_row(
                    boundary_name, p4326, src, origin, "TERHALANG_BANGUNAN",
                    f"Jalur ke jalan terhalang bangunan lain: {blocker}",
                    road_info, areas_m2[i]))
                continue

        group_key = (road_info["road_id"], road_info["side"])

        accepted_stage.append({
            "boundary": boundary_name,
            "point": p4326,
            "source": origin,
            "area_m2": areas_m2[i],
            "projection_m": road_info["projection_m"],
            "source_id": str(buildings_in.iloc[i].get("source_id", "")),
            "road_id": road_info["road_id"],
            "road_name": road_info["road_name"],
            "distance_to_road_m": road_info["distance_m"],
            "road_side": road_info["side"],
            "frontage_key": group_key,
        })

    # Satu rumah per sepenggal muka jalan.
    #
    # Versi sebelumnya memakai grid tetap (projection_m // 4) sehingga
    # hasilnya bergantung kebetulan posisi grid: dua rumah berjarak 3,8 m
    # bisa jatuh di bin yang sama (satu dibuang), sementara dua rumah
    # berjarak 0,3 m bisa beda bin (dua-duanya lolos). Untuk rumah deret
    # kampung itu membuang rumah asli. Sekarang jaraknya diukur langsung
    # antar rumah di sepanjang jalan.
    if ENABLE_FIRST_ROW_BIN_FILTER and MIN_FRONTAGE_SPACING_M > 0:
        before = len(accepted_stage)
        grouped: Dict[Tuple, List[Dict[str, Any]]] = {}
        for row in accepted_stage:
            grouped.setdefault(row["frontage_key"], []).append(row)

        swept: List[Dict[str, Any]] = []
        dropped: List[Dict[str, Any]] = []
        for group in grouped.values():
            group.sort(key=lambda r: r["projection_m"])
            kept: List[Dict[str, Any]] = []
            for row in group:
                if kept and row["projection_m"] - kept[-1]["projection_m"] < MIN_FRONTAGE_SPACING_M:
                    # Dua kandidat berebut muka jalan yang sama: pilih yang
                    # paling dekat jalan (baris depan). Menggeser yang
                    # tersimpan ke projection lebih besar hanya melebarkan
                    # jarak ke rumah sebelumnya, jadi tetap aman.
                    if row["distance_to_road_m"] < kept[-1]["distance_to_road_m"]:
                        dropped.append(kept[-1])
                        kept[-1] = row
                    else:
                        dropped.append(row)
                    continue
                kept.append(row)
            swept.extend(kept)

        accepted_stage = swept
        diag["dibuang_rapat"] = len(dropped)
        for row in dropped:
            rejected.append(make_reject_row(
                boundary_name, row["point"], row["source_id"], row.get("source", ""),
                "BERDEMPETAN",
                f"Ada rumah lain lebih dekat jalan dalam {MIN_FRONTAGE_SPACING_M:.0f} m "
                f"di muka jalan yang sama ({row['road_id']}, sisi {row['road_side']})",
                {"road_id": row["road_id"], "road_name": row["road_name"],
                 "distance_m": row["distance_to_road_m"]},
                row.get("area_m2")))

    return accepted_stage, rejected, diag


# ==========================================================
# KML EXPORT
# ==========================================================
def export_kml_accepted(rows: List[Dict[str, Any]],
                        attribution: str = "",
                        rejected: Optional[List[Dict[str, Any]]] = None) -> bytes:
    """KML hasil. Titik yang ditolak ikut sebagai folder terpisah yang
    default-nya tidak tercentang, jadi tampilan normal tidak berubah tapi
    alasan penolakan bisa diperiksa langsung di peta."""
    kml = simplekml.Kml()
    if attribution:
        # Google Open Buildings (CC BY 4.0) dan Overture (ODbL) sama-sama
        # mewajibkan atribusi ikut pada karya turunan.
        kml.document.description = attribution
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

    if INCLUDE_REJECTED_IN_KML and rejected:
        debug_root = kml.newfolder(name="DEBUG - DITOLAK")
        debug_root.visibility = 0
        per_status: Dict[str, Any] = {}
        for i, row in enumerate(rejected[:MAX_REJECTED_IN_KML], start=1):
            if row["Latitude"] == "" or row["Longitude"] == "":
                continue
            status = row.get("Status", "DITOLAK")
            if status not in per_status:
                sub = debug_root.newfolder(
                    name=f"{status} — {REJECT_STATUS_LABEL.get(status, '')}".strip(" —"))
                sub.visibility = 0
                per_status[status] = sub
            pnt = per_status[status].newpoint(
                name=f"{status}-{i:04d}",
                coords=[(row["Longitude"], row["Latitude"])],
            )
            pnt.visibility = 0
            pnt.description = row.get("Alasan", "")

    return kml.kml().encode("utf-8")


def export_excel_report(accepted: List[Dict[str, Any]],
                        rejected: List[Dict[str, Any]],
                        diagnostics: List[Dict[str, Any]]) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(accepted).to_excel(writer, index=False, sheet_name="DITERIMA")
        (pd.DataFrame(rejected) if rejected else pd.DataFrame(columns=["Boundary"])) \
            .to_excel(writer, index=False, sheet_name="DITOLAK")
        pd.DataFrame(diagnostics).to_excel(writer, index=False, sheet_name="DIAGNOSTIK")
    return buf.getvalue()


def pack_outputs(base_name: str, kml_bytes: bytes,
                 xlsx_bytes: Optional[bytes]) -> Tuple[bytes, str, str]:
    """(content, filename, content_type). ZIP hanya kalau ada Excel."""
    if not xlsx_bytes:
        return (kml_bytes, f"{base_name}_placemark.kml",
                "application/vnd.google-earth.kml+xml")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{base_name}_placemark.kml", kml_bytes)
        z.writestr(f"{base_name}_laporan.xlsx", xlsx_bytes)
    return buf.getvalue(), f"{base_name}_placemark.zip", "application/zip"


# ==========================================================
# DIAGNOSTIK
# ==========================================================
def explain_empty_boundary(d: Dict[str, Any]) -> str:
    """Terjemahkan hitungan per tahap jadi satu kalimat sebab-akibat.

    Menggantikan pesan lama yang hanya menyodorkan tiga kemungkinan tanpa
    data, sehingga pemakai tidak bisa tahu mana yang sebenarnya terjadi.
    """
    name = d.get("boundary", "?")
    src = d.get("sumber", "-")
    bangunan = d.get("bangunan_total", 0)
    jalan = d.get("jalan", 0)
    gagal = d.get("tile_gagal", 0)
    ekor = f" ({gagal} bagian area gagal diunduh)" if gagal else ""

    if bangunan == 0 and jalan == 0:
        return (f"{name}: sumber {src} tidak punya data bangunan maupun jalan "
                f"di area ini{ekor}.")
    if bangunan == 0:
        return (f"{name}: {jalan} jalan terbaca, tapi TIDAK ADA footprint bangunan"
                f"{ekor}. Ini batas liputan data, bukan filter — aktifkan sumber "
                "Google Open Buildings (AUTO_PLACEMARK_SOURCE=merge).")
    if jalan == 0:
        return (f"{name}: {bangunan} bangunan terbaca, tapi TIDAK ADA jalan{ekor}. "
                "Tanpa jalan seluruh rumah otomatis dibuang — jalan/gang di area "
                "ini belum terpetakan di OSM.")
    if d.get("di_dalam_boundary", 0) == 0:
        # Data diambil per bbox, jadi sedikit bangunan yang semuanya jatuh di
        # luar poligon itu wajar. Salah CRS baru masuk akal kalau bangunannya
        # banyak tapi tak satu pun masuk.
        if bangunan >= 20:
            return (f"{name}: {bangunan} bangunan terbaca tapi tidak satu pun titik "
                    "pusatnya jatuh di dalam boundary. Periksa apakah boundary "
                    "memakai koordinat WGS84 (lon,lat derajat desimal).")
        return (f"{name}: hanya {bangunan} bangunan di bbox area ini dan semuanya "
                "di luar garis boundary. Liputan footprint di sini praktis kosong — "
                "aktifkan Google Open Buildings (AUTO_PLACEMARK_SOURCE=merge).")
    return (f"{name}: {d['di_dalam_boundary']} bangunan di dalam boundary, semuanya "
            f"tersaring — {d.get('dibuang_kecil', 0)} luasnya di bawah "
            f"{MIN_BUILDING_AREA_M2:.0f} m2, "
            f"{d.get('dibuang_jauh', 0)} lebih dari "
            f"{MAX_DISTANCE_TO_ROAD_M:.0f} m dari jalan, "
            f"{d.get('dibuang_terhalang', 0)} terhalang bangunan lain, "
            f"{d.get('dibuang_rapat', 0)} berdempetan kurang dari "
            f"{MIN_FRONTAGE_SPACING_M:.0f} m di muka jalan yang sama.")


# ==========================================================
# MAIN ENGINE FUNCTION
# ==========================================================
def process_auto_placemark(
    boundary_content: bytes,
    filename: str,
    is_kmz: bool = False,
    progress_cb=None,
    buildings_file: Optional[bytes] = None,
    buildings_filename: str = "",
) -> Dict[str, Any]:
    """
    Main processing function.

    Args:
        boundary_content: raw bytes of the boundary file
        filename: original filename (used to detect format)
        is_kmz: True if KMZ
        progress_cb: optional callback(message: str) for progress updates
        buildings_file: unggahan opsional berisi footprint bangunan sendiri
            (hasil survei/digitasi). Kalau ada, sumber online tidak dipakai.
        buildings_filename: nama berkas unggahan itu, untuk deteksi format

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
        rejected_rows: List[Dict[str, Any]] = []
        global_no = 1
        stats = FetchStats()
        warnings: List[str] = []
        diagnostics: List[Dict[str, Any]] = []
        source_errors: List[str] = []
        attributions: List[str] = []

        mode = BUILDING_SOURCE if BUILDING_SOURCE in ("osm", "gob", "merge", "overture") else "merge"

        # Footprint sendiri menggantikan seluruh sumber online. Jalan tetap
        # dari OSM karena unggahan ini isinya bangunan.
        custom_buildings = None
        if buildings_file:
            try:
                custom_buildings, cinfo = load_custom_buildings(
                    buildings_file, buildings_filename or "bangunan.geojson")
                attributions.append(cinfo["attribution"])
                mode = "custom"
                warnings.append(
                    f"Memakai {len(custom_buildings)} footprint dari unggahan "
                    f"'{cinfo['file']}'; sumber bangunan online dilewati."
                )
            except BuildingSourceUnavailable as e:
                source_errors.append(str(e))
                warnings.append(f"File bangunan diabaikan: {e}")

        for idx, brow in boundaries.iterrows():
            boundary_name = clean_name(str(brow["boundary_name"]), f"AREA_{idx+1:02d}")
            boundary_geom = brow.geometry
            if not boundary_geom.is_valid:
                boundary_geom = boundary_geom.buffer(0)

            coord_warning = indonesia_coord_warning(boundary_geom)
            if coord_warning:
                warnings.append(f"{boundary_name}: {coord_warning}")
                print(f"[auto_placemark] {boundary_name}: {coord_warning}")

            buildings = empty_buildings()
            roads = empty_roads()
            source_label = "-"
            osm_count = 0
            added_count = 0
            failed_before = stats.failed

            if mode == "custom":
                if progress_cb:
                    progress_cb(f"Mengunduh jalan OSM untuk {boundary_name}...")
                _, roads = download_osm_features(boundary_geom, progress_cb, stats)
                buildings = custom_buildings
                added_count = len(buildings)
                source_label = "CUSTOM"
            elif mode == "overture":
                # Bangunan DAN jalan dari Overture. Lambat; lihat catatan di
                # engines/building_sources.py.
                if progress_cb:
                    progress_cb(f"Mengambil data Overture untuk {boundary_name}...")
                try:
                    buildings, roads, oinfo = fetch_overture_features(boundary_geom, progress_cb)
                    source_label = f"Overture {oinfo['release']}"
                    attributions.append(oinfo["attribution"])
                except BuildingSourceUnavailable as e:
                    source_errors.append(f"{boundary_name}: {e}")
            else:
                # Jalan SELALU dari OSM: liputan jalan & gang di Indonesia
                # sudah bagus, dan Google Open Buildings memang tidak punya
                # data jalan sama sekali.
                if progress_cb:
                    progress_cb(f"Mengunduh data bangunan & jalan OSM untuk {boundary_name}...")
                buildings, roads = download_osm_features(boundary_geom, progress_cb, stats)
                osm_count = len(buildings)
                source_label = "OSM"

                if mode in ("gob", "merge"):
                    if progress_cb:
                        progress_cb(f"Melengkapi bangunan dari Google Open Buildings untuk {boundary_name}...")
                    try:
                        gob, ginfo = fetch_gob_buildings(boundary_geom, progress_cb)
                        if mode == "gob":
                            buildings = gob
                            added_count = len(gob)
                            source_label = "GOB"
                        else:
                            buildings, added_count = merge_buildings(buildings, gob)
                            source_label = f"OSM+GOB" if added_count else "OSM"
                        if added_count:
                            attributions.append(ginfo["attribution"])
                    except BuildingSourceUnavailable as e:
                        source_errors.append(f"{boundary_name}: {e}")

            tiles_failed_here = stats.failed - failed_before

            print(f"[auto_placemark] {boundary_name}: {len(buildings)} buildings "
                  f"({source_label}, OSM={osm_count}, tambahan={added_count}), "
                  f"{len(roads)} roads, tile gagal={tiles_failed_here}")

            if progress_cb:
                progress_cb(f"Memfilter rumah frontage untuk {boundary_name}...")

            accepted_stage, rejected_stage, diag = prepare_candidate_points(
                boundary_name, boundary_geom, buildings, roads)
            rejected_rows.extend(rejected_stage)

            diag.update({
                "boundary": boundary_name,
                "sumber": source_label,
                "luas_km2": round(approx_area_km2(boundary_geom), 3),
                "bangunan_osm": int(osm_count),
                "bangunan_tambahan": int(added_count),
                "bangunan_total": int(len(buildings)),
                "jalan": int(len(roads)),
                "tile_gagal": int(tiles_failed_here),
                "diterima": len(accepted_stage),
                "ditolak": len(rejected_stage),
                "peringatan_koordinat": coord_warning,
            })
            diagnostics.append(diag)

            # Penomoran menyusuri jalan: jalan diurutkan dari yang paling
            # utara, lalu per sisi jalan, lalu menurut jarak sepanjang jalan.
            # Dulu diurutkan murni utara->selatan sehingga nomor HP melompat
            # bolak-balik antar jalan.
            road_rank: Dict[str, float] = {}
            for r in accepted_stage:
                road_rank[r["road_id"]] = max(road_rank.get(r["road_id"], -1e9), r["point"].y)
            accepted_stage.sort(key=lambda r: (-road_rank[r["road_id"]], r["road_id"],
                                               r["road_side"], r["projection_m"]))

            for item in accepted_stage:
                placemark = make_placemark_name(global_no)
                accepted_rows.append({
                    "No": global_no,
                    "Boundary": item["boundary"],
                    "Placemark": placemark,
                    "Latitude": round(item["point"].y, 7),
                    "Longitude": round(item["point"].x, 7),
                    "Sumber": item.get("source", ""),
                    "Source_ID": item.get("source_id", ""),
                    "Luas_m2": (round(item["area_m2"], 1)
                                if item.get("area_m2") is not None else ""),
                    "Road_ID": item.get("road_id", ""),
                    "Road_Name": item.get("road_name", ""),
                    "Sisi_Jalan": item.get("road_side", ""),
                    "Jarak_Ke_Jalan_m": round(item.get("distance_to_road_m", 0.0), 2),
                })
                global_no += 1

        if stats.tiles and stats.failed == stats.tiles:
            return {
                "status": "error",
                "message": (
                    "Semua permintaan ke server OpenStreetMap gagal (rate limit atau "
                    "server tidak dapat dihubungi). Coba lagi beberapa menit lagi."
                ),
            }

        if not accepted_rows:
            reasons = [explain_empty_boundary(d) for d in diagnostics]
            coord_warns = [w for w in warnings if "WGS84" in w]
            detail = " ".join(coord_warns + reasons[:5]) or "Tidak ada boundary yang terbaca."
            if source_errors:
                detail += " Sumber tambahan gagal: " + "; ".join(source_errors[:3])
            ringkasan_tolak: Dict[str, int] = {}
            for r in rejected_rows:
                s = r.get("Status", "?")
                ringkasan_tolak[s] = ringkasan_tolak.get(s, 0) + 1
            return {
                "status": "error",
                "message": "Tidak ada placemark frontage yang berhasil dibuat. " + detail,
                "report": {
                    "warnings": coord_warns + reasons,
                    "diagnostics": diagnostics,
                    "ditolak_per_alasan": ringkasan_tolak,
                    "stats": {
                        "hp": 0,
                        "ditolak": len(rejected_rows),
                        "boundary": len(boundaries),
                        "tile_osm": stats.tiles,
                        "tile_gagal": stats.failed,
                        "sumber": mode,
                    },
                },
            }

        if stats.failed:
            warnings.append(
                f"{stats.failed} dari {stats.tiles} bagian area gagal diunduh dari "
                "OpenStreetMap — rumah di bagian itu TIDAK ada di hasil. Proses ulang "
                "nanti untuk melengkapinya."
            )
        if stats.skipped_timeout:
            warnings.append(
                f"{stats.skipped_timeout} bagian area dilewati karena melewati batas waktu "
                f"{MAX_FETCH_SECONDS // 60} menit — perkecil boundary atau pecah jadi beberapa file."
            )
        for d in diagnostics:
            if d["diterima"] == 0:
                warnings.append(explain_empty_boundary(d))
        if source_errors:
            warnings.append("Sumber bangunan tambahan gagal: " + "; ".join(source_errors[:3]))

        # Rumah yang jauh dari jalan biasanya bukan rumah kebun, melainkan
        # rumah di gang yang belum terpetakan. Kalau porsinya besar, pemakai
        # perlu tahu — kalau tidak, hasilnya terlihat "sudah lengkap".
        jauh = sum(d.get("dibuang_jauh", 0) for d in diagnostics)
        dalam = sum(d.get("di_dalam_boundary", 0) for d in diagnostics)
        if dalam and jauh / dalam >= 0.15:
            warnings.append(
                f"{jauh} dari {dalam} bangunan ({jauh / dalam:.0%}) dibuang karena "
                f"lebih dari {MAX_DISTANCE_TO_ROAD_M:.0f} m dari jalan terdekat. "
                "Biasanya berarti gang di area itu belum ada di OpenStreetMap — "
                "petakan gangnya, atau naikkan batas jarak lewat env "
                "AUTO_PLACEMARK_MAX_ROAD_M."
            )

        total_tambahan = sum(d["bangunan_tambahan"] for d in diagnostics)
        # Peringatan "hasil deteksi citra" hanya berlaku untuk sumber ML.
        # Footprint unggahan pemakai sudah tervalidasi olehnya sendiri.
        if total_tambahan and mode in ("gob", "merge"):
            warnings.append(
                f"{total_tambahan} bangunan yang tidak ada di OSM ditambahkan dari "
                "Google Open Buildings (footprint hasil deteksi citra, "
                f"confidence >= {GOB_MIN_CONFIDENCE:.2f}). Verifikasi di lapangan "
                "sebelum dipakai untuk HPDB final."
            )

        if INCLUDE_REJECTED_IN_KML and rejected_rows:
            warnings.append(
                f"{len(rejected_rows)} bangunan yang tidak jadi HP ikut di KML pada "
                "folder 'DEBUG - DITOLAK' (tidak tercentang), dikelompokkan per "
                "alasan — centang di Google Earth untuk memeriksanya."
            )

        if progress_cb:
            progress_cb("Mengekspor hasil...")

        attribution = " | ".join(dict.fromkeys(attributions))
        kml_bytes = export_kml_accepted(accepted_rows, attribution, rejected_rows)

        xlsx_bytes = None
        if EXPORT_EXCEL_REPORT:
            try:
                xlsx_bytes = export_excel_report(accepted_rows, rejected_rows, diagnostics)
            except Exception as e:
                warnings.append(f"Laporan Excel gagal dibuat: {type(e).__name__}: {e}")

        # Output filename follows input name
        base_name = filename.rsplit(".", 1)[0] if "." in filename else filename
        content, output_filename, content_type = pack_outputs(
            base_name, kml_bytes, xlsx_bytes)

        print(f"[auto_placemark] Total accepted: {len(accepted_rows)}, "
              f"rejected: {len(rejected_rows)}, output: {output_filename}")

        ringkasan_tolak: Dict[str, int] = {}
        for r in rejected_rows:
            s = r.get("Status", "?")
            ringkasan_tolak[s] = ringkasan_tolak.get(s, 0) + 1

        return {
            "status": "success",
            "filename": output_filename,
            "content": content,
            "content_type": content_type,
            "report": {
                "warnings": warnings,
                "diagnostics": diagnostics,
                "ditolak_per_alasan": ringkasan_tolak,
                "attribution": attribution,
                "stats": {
                    "hp": len(accepted_rows),
                    "ditolak": len(rejected_rows),
                    "boundary": len(boundaries),
                    "tile_osm": stats.tiles,
                    "tile_gagal": stats.failed,
                    "sumber": mode,
                    "bangunan_dari_gob": total_tambahan if mode in ("gob", "merge") else 0,
                    "bangunan_dari_unggahan": total_tambahan if mode == "custom" else 0,
                },
            },
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "status": "error",
            "message": str(e),
        }
