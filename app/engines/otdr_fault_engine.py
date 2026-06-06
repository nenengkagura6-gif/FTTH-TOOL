"""
Engine for extracting paths and markers from KML/KMZ files for the OTDR Distance-to-Fault Locator
"""
from typing import Dict, List, Any
from utils.commons import parse_kml_lxml, safe_localname, parse_coords


def extract_kml_geometries(content: bytes, is_kmz: bool = False) -> Dict[str, Any]:
    """
    Parse KML or KMZ content and extract LineString (paths) and Point (markers) coordinates.
    
    Args:
        content: Raw bytes of KML or KMZ file
        is_kmz: Whether the file is KMZ format
        
    Returns:
        Dict containing lists of paths and points.
    """
    try:
        tree = parse_kml_lxml(content, is_kmz)
        root = tree.getroot()
    except Exception as e:
        return {
            "status": "error",
            "message": f"Gagal membaca file KML/KMZ: {str(e)}",
            "paths": [],
            "points": []
        }

    paths = []
    points = []

    # Traverse all elements to find Placemarks
    for elem in root.iter():
        if safe_localname(elem) == "Placemark":
            name = "No Name"
            coords_line = []
            coords_point = None
            
            # Find name and geometry elements
            for child in elem:
                c_tag = safe_localname(child)
                if c_tag == "name" and child.text:
                    name = child.text.strip()
                elif c_tag == "LineString":
                    # Extract LineString coordinates
                    for sub_child in child:
                        if safe_localname(sub_child) == "coordinates" and sub_child.text:
                            # parse_coords returns a list of (lat, lon)
                            coords_line = parse_coords(sub_child.text)
                            break
                elif c_tag == "Point":
                    # Extract Point coordinates
                    for sub_child in child:
                        if safe_localname(sub_child) == "coordinates" and sub_child.text:
                            try:
                                parts = [p.strip() for p in sub_child.text.strip().split(",") if p]
                                if len(parts) >= 2:
                                    lon = float(parts[0])
                                    lat = float(parts[1])
                                    coords_point = (lat, lon)
                            except ValueError:
                                pass
                            break
            
            # Add to results
            if coords_line:
                paths.append({
                    "name": name,
                    "coords": [{"lat": lat, "lng": lng} for lat, lng in coords_line]
                })
            elif coords_point:
                points.append({
                    "name": name,
                    "lat": coords_point[0],
                    "lng": coords_point[1]
                })

    return {
        "status": "success",
        "paths": paths,
        "points": points
    }
