"""
Engine for checking duplicate POLE/HP in KML files
"""
import io
import math
from typing import Dict, List, Any, Tuple
from lxml import etree
from pathlib import Path

from utils.commons import haversine, safe_localname


class DuplikatEngine:
    """Engine to check for duplicate POLE/HP points in KML files."""
    
    def __init__(self, max_distance_meter: float = 1.0):
        self.max_distance_meter = max_distance_meter
        self.target_keywords = ["POLE", "HP"]
        self.all_points = []
    
    def set_max_distance(self, distance: float) -> None:
        """Set maximum distance for duplicate detection."""
        self.max_distance_meter = distance
    
    def set_target_keywords(self, keywords: List[str]) -> None:
        """Set target keywords for folder filtering."""
        self.target_keywords = keywords
    
    def parse_kml(self, content: bytes, filename: str = "input.kml") -> List[Dict]:
        """Parse KML content and extract POLE/HP points."""
        parser = etree.XMLParser(recover=True)
        tree = etree.parse(io.BytesIO(content), parser)
        root = tree.getroot()
        
        results = []
        
        for folder in root.iter():
            if safe_localname(folder) != "Folder":
                continue
            
            # Get folder name
            folder_name = ""
            for child in folder:
                if safe_localname(child) == "name":
                    if child.text:
                        folder_name = child.text.strip()
                    break
            
            if not folder_name:
                continue
            
            # Check if folder matches target keywords
            upper = folder_name.upper()
            if not any(k in upper for k in self.target_keywords):
                continue
            
            # Process placemarks
            for child in folder:
                if safe_localname(child) != "Placemark":
                    continue
                
                try:
                    placemark_name = ""
                    lat = None
                    lon = None
                    
                    for item in child.iter():
                        tag = safe_localname(item)
                        
                        if tag == "name":
                            if item.text and not placemark_name:
                                placemark_name = item.text.strip()
                        
                        elif tag == "coordinates":
                            if item.text:
                                coord = item.text.strip()
                                try:
                                    lon_str, lat_str, *_ = coord.split(",")
                                    lon = float(lon_str)
                                    lat = float(lat_str)
                                except ValueError:
                                    continue
                    
                    # Valid placemark
                    if placemark_name and lat is not None and lon is not None:
                        results.append({
                            "name": placemark_name,
                            "lat": lat,
                            "lon": lon,
                            "folder": folder_name,
                            "file": Path(filename).name
                        })
                
                except Exception:
                    continue
        
        return results
    
    def check_duplicates(self, data: List[Dict]) -> List[Dict]:
        """Check for duplicate points within max_distance_meter."""
        duplicates = []
        total = len(data)
        
        for i in range(total):
            for j in range(i + 1, total):
                a = data[i]
                b = data[j]
                
                distance = haversine(
                    a["lat"], a["lon"],
                    b["lat"], b["lon"]
                )
                
                if distance <= self.max_distance_meter:
                    duplicates.append({
                        "name1": a["name"],
                        "name2": b["name"],
                        "distance": round(distance, 3),
                        "folder": a["folder"],
                        "file1": a.get("file", ""),
                        "file2": b.get("file", "")
                    })
        
        return duplicates
    
    def process_multiple(self, files: List[Tuple[bytes, str]]) -> Dict[str, Any]:
        """Process multiple KML files and check for duplicates across all."""
        all_points = []
        file_stats = []
        
        for content, filename in files:
            try:
                data = self.parse_kml(content, filename)
                all_points.extend(data)
                file_stats.append({
                    "filename": filename,
                    "matched": len(data)
                })
            except Exception as e:
                file_stats.append({
                    "filename": filename,
                    "error": str(e)
                })
        
        duplicates = self.check_duplicates(all_points)
        
        return {
            "status": "success",
            "total_points": len(all_points),
            "duplicate_count": len(duplicates),
            "duplicates": duplicates,
            "file_stats": file_stats
        }
    
    def generate_report(self, result: Dict[str, Any]) -> str:
        """Generate text report from results."""
        lines = []
        lines.append("HASIL CEK DUPLIKAT")
        lines.append("=" * 70)
        lines.append("")
        lines.append(f"Total Titik: {result['total_points']}")
        lines.append(f"Jumlah Duplikat: {result['duplicate_count']}")
        lines.append("")
        
        if result['file_stats']:
            lines.append("Statistik File:")
            for stat in result['file_stats']:
                if 'error' in stat:
                    lines.append(f"  - {stat['filename']}: ERROR - {stat['error']}")
                else:
                    lines.append(f"  - {stat['filename']}: {stat['matched']} titik")
            lines.append("")
        
        if not result['duplicates']:
            lines.append("TIDAK ADA DUPLIKAT")
        else:
            for i, d in enumerate(result['duplicates'], start=1):
                lines.append(f"{i}. DUPLIKAT")
                lines.append(f"   Folder : {d['folder']}")
                lines.append(f"   Titik 1: {d['name1']}")
                if d.get('file1'):
                    lines.append(f"   File 1 : {d['file1']}")
                lines.append(f"   Titik 2: {d['name2']}")
                if d.get('file2'):
                    lines.append(f"   File 2 : {d['file2']}")
                lines.append(f"   Jarak  : {d['distance']} meter")
                lines.append("-" * 70)
        
        return "\n".join(lines)
    
    def generate_json_report(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Generate JSON report from results."""
        return {
            "summary": {
                "total_points": result['total_points'],
                "duplicate_count": result['duplicate_count'],
                "files_processed": len(result['file_stats'])
            },
            "files": result['file_stats'],
            "duplicates": result['duplicates']
        }


def check_duplicates_kml(
    files: List[Tuple[bytes, str]],
    max_distance: float = 1.0,
    keywords: List[str] = None
) -> Dict[str, Any]:
    """
    Check for duplicate POLE/HP in KML files.
    
    Args:
        files: List of (content_bytes, filename) tuples
        max_distance: Maximum distance in meters for duplicate detection
        keywords: Target keywords for folder filtering
    
    Returns:
        Dict with status, duplicates, and statistics
    """
    engine = DuplikatEngine(max_distance_meter=max_distance)
    if keywords:
        engine.set_target_keywords(keywords)
    return engine.process_multiple(files)