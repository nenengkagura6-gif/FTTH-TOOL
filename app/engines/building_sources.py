# -*- coding: utf-8 -*-
"""
Sumber bangunan tambahan untuk Auto Placemark Frontage
=======================================================
OSM sering tidak punya footprint bangunan di Indonesia, padahal jalan dan
gang-nya justru lengkap. Contoh terukur (boundary 1,3 x 1,4 km di Bandung
Barat, 107.40 BT / -6.60 LS):

    OSM                     :     1 bangunan, 40 jalan
    Google Open Buildings   : 2.062 bangunan  (1.833 confidence >= 0,70)

Karena filter frontage membuang seluruh boundary begitu tidak ada bangunan,
satu-satunya yang kurang adalah footprint. Modul ini menambalnya.

Kenapa FlatGeobuf VIDA, bukan CSV resmi atau Overture
------------------------------------------------------
* CSV resmi Google Open Buildings di GCS dibagi per sel S2 level 4: total
  178 GB, satu berkas bisa 7,8 GB, dan tidak ada API bbox. Mustahil dipakai
  per-permintaan.
* FlatGeobuf punya R-tree bawaan dan mendukung HTTP range request, jadi
  hanya bagian berkas yang beririsan boundary yang diunduh — RAM yang
  terpakai hanya sebesar hasilnya.
* Dua mirror FlatGeobuf diadu pada bbox yang sama. VIDA (Google + Microsoft
  + OSM, dideduplikasi, satu berkas per negara) adalah superset murni dari
  Google Open Buildings polos (partisi sel S2): 2.107 vs 2.062 bangunan,
  NOL yang hanya ada di GOB, 45 tambahan dari Microsoft, dan lebih cepat
  (16 detik vs 46 detik) karena tidak perlu menghitung sel S2 dulu.
* Overture (tema buildings, GeoParquet + DuckDB) juga memuat Google Open
  Buildings dan punya data jalan, tapi partisinya tidak dipangkas per
  wilayah: DuckDB harus membaca footer ratusan berkas global. Diuji pada
  bbox yang sama, satu query belum selesai setelah 25 menit. Tetap
  disediakan lewat AUTO_PLACEMARK_SOURCE=overture untuk pemakaian batch di
  mesin besar, tapi bukan jalur bawaan.

Lisensi: VIDA CC BY 4.0 / ODbL, Overture ODbL. Atribusi wajib ikut pada
hasil (lihat ATTRIBUTION_*).
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import geopandas as gpd
import pandas as pd
from shapely.geometry.base import BaseGeometry

# ==========================================================
# KONFIGURASI
# ==========================================================
# osm    : hanya Overpass (perilaku lama)
# gob    : hanya Google Open Buildings
# merge  : bangunan OSM + bangunan GOB yang tidak tumpang tindih (bawaan)
# overture: bangunan & jalan dari Overture via DuckDB (lambat, lihat atas)
BUILDING_SOURCE = os.environ.get("AUTO_PLACEMARK_SOURCE", "merge").strip().lower()

# Dataset VIDA: Google Open Buildings + Microsoft ML + OSM yang sudah
# dideduplikasi, dipartisi per negara. Diadu langsung dengan Google Open
# Buildings murni (partisi sel S2) pada bbox yang sama, VIDA adalah superset
# murni: 2.107 vs 2.062 bangunan, nol yang hanya ada di GOB, 45 tambahan
# dari Microsoft — dan lebih cepat (16 detik vs 46 detik) karena satu berkas
# per negara tidak perlu menghitung sel S2 dulu.
GOB_FGB_URL = os.environ.get(
    "GOB_FGB_URL",
    "https://data.source.coop/vida/google-microsoft-osm-open-buildings"
    "/flatgeobuf/by_country/country_iso=IDN/IDN.fgb",
)

# Footprint hasil ML punya skor keyakinan. Di bawah 0,70 banyak yang
# sebetulnya pohon, bayangan, atau atap seng gudang.
GOB_MIN_CONFIDENCE = float(os.environ.get("GOB_MIN_CONFIDENCE", "0.70"))
GOB_TIMEOUT_SECONDS = int(os.environ.get("GOB_TIMEOUT_SECONDS", "120"))

# Cache hasil per-bbox. Berkas instance memang fana, tapi satu instance
# biasanya memproses cluster yang sama berulang kali — dan boundary multi-
# polygon dalam satu file kerap saling tumpang tindih bbox-nya.
CACHE_DIR_ENV = os.environ.get("AUTO_PLACEMARK_CACHE_DIR", "").strip()
CACHE_TTL_SECONDS = int(os.environ.get("AUTO_PLACEMARK_CACHE_TTL", str(7 * 24 * 3600)))
CACHE_MAX_ENTRIES = int(os.environ.get("AUTO_PLACEMARK_CACHE_MAX", "200"))

ATTRIBUTION_GOB = (
    "Footprint bangunan: VIDA Google-Microsoft-OSM Open Buildings (CC BY 4.0 / "
    "ODbL) via Source Cooperative. Jalan: OpenStreetMap contributors (ODbL)."
)
ATTRIBUTION_OVERTURE = (
    "Bangunan & jalan: Overture Maps Foundation (ODbL) - konflasi "
    "OpenStreetMap, Google Open Buildings, Microsoft ML Buildings, Esri."
)

BUILDING_COLUMNS = ["source_id", "source", "building", "name", "geometry"]
ROAD_COLUMNS = ["road_id", "highway", "name", "service", "geometry"]


class BuildingSourceUnavailable(RuntimeError):
    """Sumber tambahan tidak bisa dipakai: paket kurang, jaringan gagal,
    atau boundary terlalu luas. Pemanggil harus tetap jalan dengan OSM."""


def empty_buildings() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(columns=BUILDING_COLUMNS, geometry="geometry", crs="EPSG:4326")


def empty_roads() -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(columns=ROAD_COLUMNS, geometry="geometry", crs="EPSG:4326")


# ==========================================================
# CACHE LOKAL (.fgb)
# ==========================================================
def _cache_dir() -> Optional[Path]:
    if CACHE_DIR_ENV.lower() in ("0", "off", "none", "false"):
        return None
    base = (Path(CACHE_DIR_ENV) if CACHE_DIR_ENV
            else Path(tempfile.gettempdir()) / "ftth_placemark_cache")
    try:
        base.mkdir(parents=True, exist_ok=True)
        return base
    except Exception:
        return None


def _cache_path(base: Path, west: float, south: float,
                east: float, north: float) -> Path:
    # 4 desimal ~ 11 meter: cukup halus supaya bbox berbeda tidak tertukar,
    # cukup kasar supaya boundary yang sama dari file berbeda tetap kena.
    raw = (f"{GOB_FGB_URL}|{west:.4f}|{south:.4f}|{east:.4f}|{north:.4f}"
           f"|{GOB_MIN_CONFIDENCE}")
    return base / f"bld_{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:20]}.fgb"


def _cache_read(path: Path) -> Optional[gpd.GeoDataFrame]:
    try:
        if not path.exists() or path.stat().st_size == 0:
            return None
        if time.time() - path.stat().st_mtime > CACHE_TTL_SECONDS:
            path.unlink(missing_ok=True)
            return None
        gdf = gpd.read_file(path)
    except Exception:
        return None
    if gdf is None or gdf.empty:
        return None
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    elif str(gdf.crs).upper() != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")
    for col in BUILDING_COLUMNS:
        if col not in gdf.columns:
            return None
    return gdf[BUILDING_COLUMNS]


def _cache_write(path: Path, gdf: gpd.GeoDataFrame) -> None:
    if gdf is None or gdf.empty:
        return
    try:
        gdf.to_file(path, driver="FlatGeobuf")
    except Exception:
        return
    # Buang entri terlama supaya disk instance tidak penuh diam-diam.
    try:
        files = sorted(path.parent.glob("bld_*.fgb"), key=lambda p: p.stat().st_mtime)
        for old in files[:max(0, len(files) - CACHE_MAX_ENTRIES)]:
            old.unlink(missing_ok=True)
    except Exception:
        pass


# ==========================================================
# FILE BANGUNAN SENDIRI (hasil survei / digitasi manual)
# ==========================================================
def load_custom_buildings(content: bytes,
                          filename: str) -> Tuple[gpd.GeoDataFrame, Dict[str, Any]]:
    """Baca footprint dari unggahan pemakai; menggantikan sumber online.

    Padanan CUSTOM_BUILDINGS_FILE di skrip desktop V4.3, memakai slot
    unggahan opsional yang sudah ada di API.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("geojson", "json", "shp", "zip", "fgb", "gpkg", "kml", "kmz", "parquet"):
        raise BuildingSourceUnavailable(
            f"Format file bangunan '.{ext}' belum didukung. Pakai GeoJSON, "
            "SHP (dalam .zip), FlatGeobuf, GeoPackage, KML/KMZ, atau GeoParquet."
        )

    tmp = Path(tempfile.gettempdir()) / f"custom_bld_{os.getpid()}_{int(time.time())}.{ext}"
    try:
        tmp.write_bytes(content)
        try:
            if ext == "parquet":
                gdf = gpd.read_parquet(tmp)
            elif ext == "zip":
                gdf = gpd.read_file(f"zip://{tmp}")
            else:
                gdf = gpd.read_file(tmp)
        except Exception as e:
            raise BuildingSourceUnavailable(
                f"Gagal membaca file bangunan '{filename}': {type(e).__name__}: {str(e)[:200]}"
            ) from e
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

    if gdf is None or gdf.empty:
        raise BuildingSourceUnavailable(f"File bangunan '{filename}' kosong.")

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    name_col = next((c for c in ("name", "Name", "NAMA", "nama") if c in gdf.columns), None)
    records: List[Dict[str, Any]] = []
    for pos, row in enumerate(gdf.itertuples(index=False)):
        geom = getattr(row, "geometry", None)
        if geom is None or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        records.append({
            "source_id": f"custom/{pos}",
            "source": "CUSTOM",
            "building": "yes",
            "name": str(getattr(row, name_col, "") or "") if name_col else "",
            "geometry": geom,
        })

    if not records:
        raise BuildingSourceUnavailable(
            f"File bangunan '{filename}' tidak berisi Polygon/MultiPolygon."
        )

    out = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
    return out, {
        "source": "CUSTOM",
        "file": filename,
        "kept": int(len(out)),
        "attribution": f"Footprint bangunan: {filename} (unggahan pengguna).",
    }


# ==========================================================
# GOOGLE OPEN BUILDINGS (FlatGeobuf + HTTP range request)
# ==========================================================
def _gdal_options() -> Dict[str, Any]:
    """Setelan vsicurl.

    Chunk bawaan GDAL 16 KB berarti ratusan round-trip HTTP untuk menyusuri
    R-tree lalu membaca fitur. Dinaikkan ke 1 MB: pada uji bbox 1,3 x 1,4 km
    waktu baca turun dari 50,4 detik menjadi 20,9 detik.
    """
    return {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".fgb",
        "VSI_CACHE": True,
        "VSI_CACHE_SIZE": 52428800,
        "CPL_VSIL_CURL_CHUNK_SIZE": 1048576,
        "CPL_VSIL_CURL_CACHE_SIZE": 209715200,
        "GDAL_HTTP_VERSION": "2",
        "GDAL_HTTP_MULTIPLEX": "YES",
        "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
        "GDAL_HTTP_TIMEOUT": GOB_TIMEOUT_SECONDS,
        "GDAL_HTTP_MAX_RETRY": "3",
        "GDAL_HTTP_RETRY_DELAY": "2",
        # CDN Source Cooperative menolak User-Agent kosong.
        "GDAL_HTTP_USERAGENT": "ftth-tool-auto-placemark/1.2 (+https://ftthtools.my.id)",
    }


def fetch_gob_buildings(
    boundary_geom: BaseGeometry,
    progress_cb=None,
    margin_deg: float = 0.00015,
) -> Tuple[gpd.GeoDataFrame, Dict[str, Any]]:
    """Footprint Google Open Buildings di dalam bbox boundary.

    Google Open Buildings TIDAK punya data jalan, jadi fungsi ini hanya
    mengembalikan bangunan. Jalan tetap dari Overpass/OSM — dan memang di
    sanalah OSM sudah bagus.
    """
    try:
        from pyogrio import read_dataframe, set_gdal_config_options
    except ImportError as e:
        raise BuildingSourceUnavailable(
            "Paket 'pyogrio' belum tersedia (biasanya ikut geopandas). "
            "Sumber Google Open Buildings tidak aktif."
        ) from e

    minx, miny, maxx, maxy = boundary_geom.bounds
    west, south = minx - margin_deg, miny - margin_deg
    east, north = maxx + margin_deg, maxy + margin_deg

    base = _cache_dir()
    cached_at: Optional[Path] = None
    if base is not None:
        cached_at = _cache_path(base, west, south, east, north)
        hit = _cache_read(cached_at)
        if hit is not None:
            if progress_cb:
                progress_cb(f"Footprint bangunan: {len(hit)} dari cache lokal.")
            return hit, {
                "source": "GOB", "raw": int(len(hit)), "kept": int(len(hit)),
                "cached": True, "attribution": ATTRIBUTION_GOB,
            }

    set_gdal_config_options(_gdal_options())

    if progress_cb:
        progress_cb("Google Open Buildings: membaca footprint...")

    try:
        raw = read_dataframe(GOB_FGB_URL if GOB_FGB_URL.startswith("/vsicurl/")
                             else f"/vsicurl/{GOB_FGB_URL}",
                             bbox=(west, south, east, north))
    except Exception as e:
        raise BuildingSourceUnavailable(
            f"Gagal membaca footprint bangunan: {type(e).__name__}: {str(e)[:200]}"
        ) from e

    n_raw = 0 if raw is None else len(raw)
    if not n_raw:
        return empty_buildings(), {
            "source": "GOB", "raw": 0, "kept": 0,
            "attribution": ATTRIBUTION_GOB,
        }

    if "confidence" in raw.columns:
        # OSM di dataset VIDA tidak punya skor; jangan ikut terbuang.
        raw = raw[raw["confidence"].fillna(1.0) >= GOB_MIN_CONFIDENCE]

    by_source: Dict[str, int] = {}
    records: List[Dict[str, Any]] = []
    for pos, row in enumerate(raw.itertuples(index=False)):
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        origin = str(getattr(row, "bf_source", "") or "ml")
        by_source[origin] = by_source.get(origin, 0) + 1
        records.append({
            "source_id": f"gob/{origin}/{pos}",
            "source": "GOB",
            "building": "yes",
            "name": "",
            "geometry": geom,
        })

    gdf = (gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
           if records else empty_buildings())

    if cached_at is not None:
        _cache_write(cached_at, gdf)

    info = {
        "source": "GOB",
        "raw": n_raw,
        "kept": int(len(gdf)),
        "by_source": by_source,
        "min_confidence": GOB_MIN_CONFIDENCE,
        "cached": False,
        "attribution": ATTRIBUTION_GOB,
    }
    return gdf, info


# ==========================================================
# GABUNG OSM + SUMBER TAMBAHAN
# ==========================================================
def merge_buildings(base: gpd.GeoDataFrame,
                    extra: gpd.GeoDataFrame) -> Tuple[gpd.GeoDataFrame, int]:
    """Tambahkan bangunan `extra` yang belum diwakili `base`.

    Footprint OSM digambar manual dan lebih rapi, jadi dipertahankan. Dari
    GOB hanya diambil yang titik wakilnya TIDAK jatuh di dalam bangunan OSM
    mana pun, supaya satu rumah tidak dihitung dua kali.
    """
    if extra is None or extra.empty:
        return base, 0
    if base is None or base.empty:
        return extra.reset_index(drop=True), int(len(extra))

    try:
        points = extra.geometry.representative_point()
        hits = base.sindex.query(points, predicate="within")
        covered = set(int(i) for i in hits[0])
    except Exception:
        covered = set()

    mask = [i not in covered for i in range(len(extra))]
    addition = extra[mask]
    if addition.empty:
        return base, 0

    merged = gpd.GeoDataFrame(
        pd.concat([base, addition], ignore_index=True),
        geometry="geometry", crs="EPSG:4326",
    )
    return merged, int(len(addition))


# ==========================================================
# OVERTURE (opt-in; lihat catatan kinerja di docstring modul)
# ==========================================================
OVERTURE_S3_BASE = "s3://overturemaps-us-west-2/release"
OVERTURE_RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-09-23.1").strip()
OVERTURE_MEMORY_LIMIT = os.environ.get("OVERTURE_MEMORY_LIMIT", "256MB").strip()
OVERTURE_THREADS = int(os.environ.get("OVERTURE_THREADS", "2"))
OVERTURE_HTTP_TIMEOUT_MS = int(os.environ.get("OVERTURE_HTTP_TIMEOUT_MS", "60000"))

OVERTURE_ROAD_CLASSES: Tuple[str, ...] = (
    "residential", "service", "living_street", "unclassified",
    "tertiary", "secondary", "primary", "trunk",
    "path", "footway", "pedestrian", "track", "steps", "cycleway",
    "unknown",
)


def _overture_bbox_predicate(south: float, west: float, north: float, east: float) -> str:
    """Uji irisan bbox penuh.

    Contoh resmi Overture hanya menyaring bbox.xmin/ymin dengan BETWEEN,
    sehingga jalan panjang yang pangkalnya di luar kotak ikut terbuang —
    justru jalan tepi boundary yang paling dibutuhkan filter frontage.
    """
    return (
        f"bbox.xmin <= {east:.7f} AND bbox.xmax >= {west:.7f} "
        f"AND bbox.ymin <= {north:.7f} AND bbox.ymax >= {south:.7f}"
    )


def fetch_overture_features(
    boundary_geom: BaseGeometry,
    progress_cb=None,
    margin_deg: float = 0.00015,
) -> Tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, Dict[str, Any]]:
    """Bangunan + jalan dari Overture. LAMBAT — lihat docstring modul."""
    try:
        import duckdb
    except ImportError as e:
        raise BuildingSourceUnavailable(
            "Paket 'duckdb' belum terpasang, sumber Overture tidak aktif."
        ) from e

    from shapely import wkb as shapely_wkb

    minx, miny, maxx, maxy = boundary_geom.bounds
    west, south = minx - margin_deg, miny - margin_deg
    east, north = maxx + margin_deg, maxy + margin_deg

    con = duckdb.connect(database=":memory:")
    try:
        ext_dir = os.environ.get("DUCKDB_EXTENSION_DIR", "").strip()
        if ext_dir:
            con.execute("SET extension_directory=?", [ext_dir])
        con.execute(f"SET memory_limit='{OVERTURE_MEMORY_LIMIT}'")
        con.execute(f"SET threads={max(1, OVERTURE_THREADS)}")
        try:
            con.execute("INSTALL httpfs")
        except Exception:
            pass
        con.execute("LOAD httpfs")
        con.execute("SET s3_region='us-west-2'")
        con.execute(f"SET http_timeout={OVERTURE_HTTP_TIMEOUT_MS}")
        con.execute("SET http_retries=3")
        # Ekstensi `spatial` sengaja tidak dimuat: kolom geometry sudah WKB,
        # cukup dibaca sebagai BLOB lalu di-parse shapely. Hemat RAM.

        where_bbox = _overture_bbox_predicate(south, west, north, east)

        if progress_cb:
            progress_cb(f"Overture {OVERTURE_RELEASE}: bangunan...")
        b_rows = con.execute(f"""
            SELECT id, class, subtype, names.primary AS name, geometry
            FROM read_parquet(
                '{OVERTURE_S3_BASE}/{OVERTURE_RELEASE}/theme=buildings/type=building/*',
                hive_partitioning=1)
            WHERE {where_bbox}
        """).fetchall()

        if progress_cb:
            progress_cb(f"Overture {OVERTURE_RELEASE}: jalan & gang...")
        classes = ", ".join(f"'{c}'" for c in OVERTURE_ROAD_CLASSES)
        r_rows = con.execute(f"""
            SELECT id, class, names.primary AS name, geometry
            FROM read_parquet(
                '{OVERTURE_S3_BASE}/{OVERTURE_RELEASE}/theme=transportation/type=segment/*',
                hive_partitioning=1)
            WHERE subtype = 'road'
              AND (class IN ({classes}) OR class IS NULL)
              AND {where_bbox}
        """).fetchall()
    except Exception as e:
        raise BuildingSourceUnavailable(
            f"Gagal membaca Overture rilis '{OVERTURE_RELEASE}': "
            f"{type(e).__name__}: {str(e)[:200]}. Setel OVERTURE_RELEASE ke "
            "rilis yang masih tersedia."
        ) from e
    finally:
        con.close()

    def decode(rows: Sequence[Any], wanted: Tuple[str, ...]):
        for row in rows:
            blob = row[-1]
            if not blob:
                continue
            try:
                geom = shapely_wkb.loads(bytes(blob))
            except Exception:
                continue
            if geom is None or geom.is_empty:
                continue
            if not geom.is_valid:
                geom = geom.buffer(0)
            if geom.is_empty or geom.geom_type not in wanted:
                continue
            yield row, geom

    b_records = [{
        "source_id": f"overture/{row[0]}",
        "source": "OVERTURE",
        "building": row[1] or row[2] or "yes",
        "name": row[3] or "",
        "geometry": geom,
    } for row, geom in decode(b_rows, ("Polygon", "MultiPolygon"))]

    r_records = [{
        "road_id": f"overture/{row[0]}",
        "highway": row[1] or "unknown",
        "name": row[2] or "",
        "service": "",
        "geometry": geom,
    } for row, geom in decode(r_rows, ("LineString", "MultiLineString"))]

    buildings = (gpd.GeoDataFrame(b_records, geometry="geometry", crs="EPSG:4326")
                 if b_records else empty_buildings())
    roads = (gpd.GeoDataFrame(r_records, geometry="geometry", crs="EPSG:4326")
             if r_records else empty_roads())
    if not roads.empty:
        try:
            roads = roads[roads.geometry.intersects(
                boundary_geom.buffer(margin_deg * 2))].copy()
        except Exception:
            pass

    info = {
        "source": "OVERTURE",
        "release": OVERTURE_RELEASE,
        "buildings": int(len(buildings)),
        "roads": int(len(roads)),
        "attribution": ATTRIBUTION_OVERTURE,
    }
    return buildings, roads, info
