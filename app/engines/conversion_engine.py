"""
Engine for converting KML/KMZ to CSV, KML/KMZ to SHP, and SHP to KML
"""
import io
import csv
import zipfile
import shapefile
from lxml import etree
from utils.commons import clean_xml_prefixes

def convert_kml_to_csv(content: bytes, is_kmz: bool = False) -> bytes:
    """
    Extract Point Placemarks to a CSV containing latitude, longitude, name.
    
    Args:
        content: Raw bytes of KML or KMZ file
        is_kmz: Whether the input file is in KMZ format
        
    Returns:
        bytes representing the CSV content
    """
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                raise ValueError("No KML file found inside KMZ archive.")
            kml_name = kml_files[0]
            with kmz.open(kml_name) as kml_file:
                content = kml_file.read()
                
    content_str = content.decode("utf-8", errors="ignore")
    cleaned_text = clean_xml_prefixes(content_str)
    tree = etree.parse(io.BytesIO(cleaned_text.encode("utf-8")), parser)
    root = tree.getroot()
    
    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer, delimiter=",", quotechar='"', quoting=csv.QUOTE_MINIMAL)
    # Write headers
    writer.writerow(["latitude", "longitude", "name"])
    
    # Iterate through all Placemarks
    for pm in root.iter():
        tag_name = pm.tag.split("}", 1)[1] if "}" in pm.tag else pm.tag
        if tag_name == "Placemark":
            name_elem = None
            point_elem = None
            
            for child in pm:
                child_tag = child.tag.split("}", 1)[1] if "}" in child.tag else child.tag
                if child_tag == "name":
                    name_elem = child
                elif child_tag == "Point":
                    point_elem = child
                    
            name = name_elem.text.strip() if name_elem is not None and name_elem.text else "No Name"
            
            if point_elem is not None:
                coord_elem = None
                for c in point_elem:
                    c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if c_tag == "coordinates":
                        coord_elem = c
                        break
                        
                if coord_elem is not None and coord_elem.text:
                    try:
                        # coordinates format: longitude,latitude[,altitude]
                        parts = coord_elem.text.strip().split(",")
                        if len(parts) >= 2:
                            lon = float(parts[0].strip())
                            lat = float(parts[1].strip())
                            writer.writerow([lat, lon, name])
                    except:
                        pass
                        
    return csv_buffer.getvalue().encode("utf-8")

def convert_kml_to_shp(content: bytes, is_kmz: bool = False) -> bytes:
    """
    Convert KML points, lines, and polygons into separate shapefile layers inside a ZIP.
    
    Args:
        content: Raw bytes of KML or KMZ file
        is_kmz: Whether the input file is in KMZ format
        
    Returns:
        bytes representing the ZIP archive containing Shapefile layers
    """
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                raise ValueError("No KML file found inside KMZ archive.")
            kml_name = kml_files[0]
            with kmz.open(kml_name) as kml_file:
                content = kml_file.read()
                
    content_str = content.decode("utf-8", errors="ignore")
    cleaned_text = clean_xml_prefixes(content_str)
    tree = etree.parse(io.BytesIO(cleaned_text.encode("utf-8")), parser)
    root = tree.getroot()
    
    points = []
    lines = []
    polygons = []
    
    # Extract geometries
    for pm in root.iter():
        tag_name = pm.tag.split("}", 1)[1] if "}" in pm.tag else pm.tag
        if tag_name == "Placemark":
            name_elem = None
            point_elem = None
            line_elem = None
            poly_elem = None
            
            for child in pm:
                child_tag = child.tag.split("}", 1)[1] if "}" in child.tag else child.tag
                if child_tag == "name":
                    name_elem = child
                elif child_tag == "Point":
                    point_elem = child
                elif child_tag == "LineString":
                    line_elem = child
                elif child_tag == "Polygon":
                    poly_elem = child
                    
            name = name_elem.text.strip() if name_elem is not None and name_elem.text else "No Name"
            
            # 1. Point
            if point_elem is not None:
                coord_elem = None
                for c in point_elem:
                    c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if c_tag == "coordinates":
                        coord_elem = c
                        break
                if coord_elem is not None and coord_elem.text:
                    try:
                        lon, lat, *_ = map(float, coord_elem.text.strip().split(","))
                        points.append({"name": name, "coords": [lon, lat]})
                    except:
                        pass
            
            # 2. LineString
            if line_elem is not None:
                coord_elem = None
                for c in line_elem:
                    c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if c_tag == "coordinates":
                        coord_elem = c
                        break
                if coord_elem is not None and coord_elem.text:
                    try:
                        coords = []
                        for pair in coord_elem.text.strip().split():
                            lon, lat, *_ = map(float, pair.split(","))
                            coords.append([lon, lat])
                        if coords:
                            lines.append({"name": name, "coords": coords})
                    except:
                        pass
            
            # 3. Polygon
            if poly_elem is not None:
                # Find coordinates in outerBoundaryIs -> LinearRing -> coordinates
                coord_elem = None
                outer = None
                for c in poly_elem:
                    c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if c_tag == "outerBoundaryIs":
                        outer = c
                        break
                if outer is not None:
                    ring = None
                    for c in outer:
                        c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                        if c_tag == "LinearRing":
                            ring = c
                            break
                    if ring is not None:
                        for c in ring:
                            c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                            if c_tag == "coordinates":
                                coord_elem = c
                                break
                if coord_elem is not None and coord_elem.text:
                    try:
                        coords = []
                        for pair in coord_elem.text.strip().split():
                            lon, lat, *_ = map(float, pair.split(","))
                            coords.append([lon, lat])
                        if coords:
                            polygons.append({"name": name, "coords": coords})
                    except:
                        pass

    zip_buffer = io.BytesIO()
    # WGS84 Spatial Reference Projection
    prj_content = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Write Points Shapefile
        if points:
            shp_io, shx_io, dbf_io = io.BytesIO(), io.BytesIO(), io.BytesIO()
            with shapefile.Writer(shp=shp_io, shx=shx_io, dbf=dbf_io, shapeType=shapefile.POINT) as w:
                w.field('name', 'C', 100)
                for pt in points:
                    w.point(pt["coords"][0], pt["coords"][1])
                    w.record(pt["name"])
            zip_file.writestr("points.shp", shp_io.getvalue())
            zip_file.writestr("points.shx", shx_io.getvalue())
            zip_file.writestr("points.dbf", dbf_io.getvalue())
            zip_file.writestr("points.prj", prj_content)
            
        # Write Polylines Shapefile
        if lines:
            shp_io, shx_io, dbf_io = io.BytesIO(), io.BytesIO(), io.BytesIO()
            with shapefile.Writer(shp=shp_io, shx=shx_io, dbf=dbf_io, shapeType=shapefile.POLYLINE) as w:
                w.field('name', 'C', 100)
                for ln in lines:
                    w.line([ln["coords"]])
                    w.record(ln["name"])
            zip_file.writestr("lines.shp", shp_io.getvalue())
            zip_file.writestr("lines.shx", shx_io.getvalue())
            zip_file.writestr("lines.dbf", dbf_io.getvalue())
            zip_file.writestr("lines.prj", prj_content)
            
        # Write Polygons Shapefile
        if polygons:
            shp_io, shx_io, dbf_io = io.BytesIO(), io.BytesIO(), io.BytesIO()
            with shapefile.Writer(shp=shp_io, shx=shx_io, dbf=dbf_io, shapeType=shapefile.POLYGON) as w:
                w.field('name', 'C', 100)
                for poly in polygons:
                    w.poly([poly["coords"]])
                    w.record(poly["name"])
            zip_file.writestr("polygons.shp", shp_io.getvalue())
            zip_file.writestr("polygons.shx", shx_io.getvalue())
            zip_file.writestr("polygons.dbf", dbf_io.getvalue())
            zip_file.writestr("polygons.prj", prj_content)
            
        if not points and not lines and not polygons:
            zip_file.writestr("no_features.txt", "No point, line, or polygon geometries found in KML/KMZ.")
            
    return zip_buffer.getvalue()

def convert_shp_to_kml(zip_content: bytes) -> bytes:
    """
    Convert shapefiles inside a ZIP archive into a single KML file.
    Supports archives with multiple shapefile layers (e.g., points, lines, polygons).
    
    Args:
        zip_content: Raw bytes of the ZIP file containing shapefiles
        
    Returns:
        bytes representing the KML content
    """
    import os
    
    # Group zip files by base name (layer name)
    layers = {}
    with zipfile.ZipFile(io.BytesIO(zip_content), "r") as z:
        for name in z.namelist():
            base_name, ext = os.path.splitext(os.path.basename(name))
            ext = ext.lower()
            if ext in (".shp", ".shx", ".dbf"):
                if base_name not in layers:
                    layers[base_name] = {}
                layers[base_name][ext[1:]] = z.read(name)
                
    kml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        '<Document>',
        '<name>Converted Shapefile</name>'
    ]
    
    # Process each shapefile layer
    for layer_name, data in layers.items():
        shp_data = data.get("shp")
        dbf_data = data.get("dbf")
        shx_data = data.get("shx")
        
        if not shp_data or not dbf_data:
            continue
            
        shp_io = io.BytesIO(shp_data)
        shx_io = io.BytesIO(shx_data) if shx_data else None
        dbf_io = io.BytesIO(dbf_data)
        
        reader = shapefile.Reader(shp=shp_io, shx=shx_io, dbf=dbf_io)
        
        name_field_idx = -1
        for idx, field in enumerate(reader.fields[1:]):
            if field[0].lower() in ('name', 'label', 'id', 'title'):
                name_field_idx = idx
                break
        if name_field_idx == -1 and len(reader.fields) > 1:
            name_field_idx = 0
            
        for shape_rec in reader.shapeRecords():
            shape = shape_rec.shape
            record = shape_rec.record
            
            name = "No Name"
            if name_field_idx != -1 and len(record) > name_field_idx:
                name = str(record[name_field_idx]).strip() or "No Name"
                
            geom_type = shape.shapeType
            points = shape.points
            
            if geom_type == shapefile.POINT:
                if points:
                    lon, lat = points[0]
                    kml_parts.extend([
                        '<Placemark>',
                        f'<name>{name}</name>',
                        '<Point>',
                        f'<coordinates>{lon},{lat},0</coordinates>',
                        '</Point>',
                        '</Placemark>'
                    ])
            elif geom_type in (shapefile.POLYLINE, shapefile.POLYLINEZ, shapefile.POLYLINEM):
                if points:
                    coord_str = " ".join(f"{lon},{lat},0" for lon, lat in points)
                    kml_parts.extend([
                        '<Placemark>',
                        f'<name>{name}</name>',
                        '<LineString>',
                        f'<coordinates>{coord_str}</coordinates>',
                        '</LineString>',
                        '</Placemark>'
                    ])
            elif geom_type in (shapefile.POLYGON, shapefile.POLYGONZ, shapefile.POLYGONM):
                if points:
                    coord_str = " ".join(f"{lon},{lat},0" for lon, lat in points)
                    kml_parts.extend([
                        '<Placemark>',
                        f'<name>{name}</name>',
                        '<Polygon>',
                        '<outerBoundaryIs>',
                        '<LinearRing>',
                        f'<coordinates>{coord_str}</coordinates>',
                        '</LinearRing>',
                        '</outerBoundaryIs>',
                        '</Polygon>',
                        '</Placemark>'
                    ])
                    
    kml_parts.extend(['</Document>', '</kml>'])
    return "\n".join(kml_parts).encode("utf-8")

def convert_kml_to_dxf(content: bytes, is_kmz: bool = False) -> bytes:
    """
    Convert KML points, lines, and polygons into an AutoCAD DXF file with UTM projected coordinates.
    """
    import math
    import ezdxf
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                raise ValueError("No KML file found inside KMZ archive.")
            kml_name = kml_files[0]
            with kmz.open(kml_name) as kml_file:
                content = kml_file.read()
                
    content_str = content.decode("utf-8", errors="ignore")
    cleaned_text = clean_xml_prefixes(content_str)
    tree = etree.parse(io.BytesIO(cleaned_text.encode("utf-8")), parser)
    root = tree.getroot()
    
    # Extract features using our recursive folder-aware extractor
    features = extract_features_with_folders(root)
    
    if not features:
        raise ValueError("No valid point, line, or polygon geometries found in KML/KMZ.")
        
    # Collect all coordinates to find the center projection zone
    all_lons = []
    all_lats = []
    for f in features:
        if f["type"] == "point":
            all_lons.append(f["coords"][0])
            all_lats.append(f["coords"][1])
        elif f["type"] in ("line", "polygon"):
            for pt in f["coords"]:
                all_lons.append(pt[0])
                all_lats.append(pt[1])
                
    if not all_lons:
        raise ValueError("No coordinates found to determine UTM projection zone.")
        
    # Calculate center of coordinates
    avg_lon = sum(all_lons) / len(all_lons)
    avg_lat = sum(all_lats) / len(all_lats)
    
    # Determine UTM zone
    zone_number = int((avg_lon + 180) / 6) + 1
    lon_origin = (zone_number - 1) * 6 - 180 + 3
    is_southern = avg_lat < 0.0
    
    # Helper to project
    def project_coords(lon, lat):
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        lon_origin_rad = math.radians(lon_origin)
        
        a = 6378137.0
        f = 1.0 / 298.257223563
        b = a * (1.0 - f)
        e = math.sqrt(1.0 - (b**2 / a**2))
        e2 = e**2
        ep2 = e2 / (1.0 - e2)
        
        k0 = 0.9996
        
        N = a / math.sqrt(1.0 - e2 * math.sin(lat_rad)**2)
        T = math.tan(lat_rad)**2
        C = ep2 * math.cos(lat_rad)**2
        A = (lon_rad - lon_origin_rad) * math.cos(lat_rad)
        
        M = a * (
            (1.0 - e2/4.0 - 3.0*e2**2/64.0 - 5.0*e2**3/256.0) * lat_rad
            - (3.0*e2/8.0 + 3.0*e2**2/32.0 + 45.0*e2**3/1024.0) * math.sin(2.0*lat_rad)
            + (15.0*e2**2/256.0 + 45.0*e2**3/1024.0) * math.sin(4.0*lat_rad)
            - (35.0*e2**3/3072.0) * math.sin(6.0*lat_rad)
        )
        
        easting = k0 * N * (
            A + (1.0 - T + C) * A**3 / 6.0
            + (5.0 - 18.0 * T + T**2 + 72.0 * C - 58.0 * ep2) * A**5 / 120.0
        ) + 500000.0
        
        northing = k0 * (
            M + N * math.tan(lat_rad) * (
                A**2 / 2.0
                + (5.0 - T + 9.0 * C + 4.0 * C**2) * A**4 / 24.0
                + (61.0 - 58.0 * T + T**2 + 600.0 * C - 330.0 * ep2) * A**6 / 720.0
            )
        )
        
        if is_southern:
            northing += 10000000.0
            
        return easting, northing

    # Create new DXF document (R2010 format)
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    
    # Layer colors
    color_map = {
        "tiang": 2,      # Yellow
        "pole": 2,       # Yellow
        "kabel": 4,      # Cyan
        "cable": 4,      # Cyan
        "fat": 1,        # Red
        "odp": 1,        # Red
        "fdt": 3,        # Green
        "roset": 6,      # Magenta
        "area": 5,       # Blue
        "polygon": 5,    # Blue
        "default": 7     # White
    }
    
    # Track created layers
    created_layers = set()
    
    def get_or_create_layer(layer_name):
        sanitized = sanitize_dxf_name(layer_name)
        if sanitized not in created_layers:
            # Determine color
            l_lower = sanitized.lower()
            color = 7
            for key, val in color_map.items():
                if key in l_lower:
                    color = val
                    break
            # Add layer to document
            doc.layers.new(name=sanitized, dxfattribs={'color': color})
            created_layers.add(sanitized)
        return sanitized

    for f in features:
        layer = get_or_create_layer(f["layer"])
        name = f["name"]
        ftype = f["type"]
        
        if ftype == "point":
            lon, lat = f["coords"]
            x, y = project_coords(lon, lat)
            
            # 1. Circle node (Radius = 1 meter)
            msp.add_circle(center=(x, y), radius=1.0, dxfattribs={'layer': layer})
            # 2. Point entity
            msp.add_point(location=(x, y), dxfattribs={'layer': layer})
            # 3. Label text next to it
            msp.add_text(text=name, dxfattribs={'layer': layer, 'height': 1.5}).set_placement((x + 1.2, y + 1.2))
            
        elif ftype in ("line", "polygon"):
            projected = [project_coords(lon, lat) for lon, lat in f["coords"]]
            is_closed = ftype == "polygon"
            
            # Write polyline
            poly = msp.add_lwpolyline(points=projected, dxfattribs={'layer': layer})
            if is_closed:
                poly.closed = True
                
            # Write line name at the midpoint of the line
            if name and name != "No Name" and len(projected) >= 2:
                mid_idx = len(projected) // 2
                x_mid = (projected[mid_idx-1][0] + projected[mid_idx][0]) / 2.0
                y_mid = (projected[mid_idx-1][1] + projected[mid_idx][1]) / 2.0
                msp.add_text(text=name, dxfattribs={'layer': layer, 'height': 1.5}).set_placement((x_mid + 1.0, y_mid + 1.0))
                
    # Save to string buffer
    dxf_string_io = io.StringIO()
    doc.write(dxf_string_io)
    return dxf_string_io.getvalue().encode("utf-8")

def sanitize_dxf_name(name: str) -> str:
    # AutoCAD layer names must not contain forbidden characters
    forbidden = '<>/\":;?*|=`'
    for char in forbidden:
        name = name.replace(char, '_')
    name = name.strip()
    return name or "Default"

def extract_features_with_folders(element, current_folder="Default") -> list:
    tag_name = element.tag.split("}", 1)[1] if "}" in element.tag else element.tag
    
    if tag_name == "Folder":
        folder_name = current_folder
        for child in element:
            child_tag = child.tag.split("}", 1)[1] if "}" in child.tag else child.tag
            if child_tag == "name" and child.text:
                folder_name = child.text.strip()
                break
        
        features = []
        for child in element:
            child_tag = child.tag.split("}", 1)[1] if "}" in child.tag else child.tag
            if child_tag != "name":
                features.extend(extract_features_with_folders(child, folder_name))
        return features

    elif tag_name == "Placemark":
        name = "No Name"
        point_elem = None
        line_elem = None
        poly_elem = None
        
        for child in element:
            child_tag = child.tag.split("}", 1)[1] if "}" in child.tag else child.tag
            if child_tag == "name" and child.text:
                name = child.text.strip()
            elif child_tag == "Point":
                point_elem = child
            elif child_tag == "LineString":
                line_elem = child
            elif child_tag == "Polygon":
                poly_elem = child
                
        feature = {"name": name, "layer": current_folder}
        
        if point_elem is not None:
            coord_elem = None
            for c in point_elem:
                c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                if c_tag == "coordinates":
                    coord_elem = c
                    break
            if coord_elem is not None and coord_elem.text:
                try:
                    lon, lat, *_ = map(float, coord_elem.text.strip().split(","))
                    feature["type"] = "point"
                    feature["coords"] = [lon, lat]
                    return [feature]
                except:
                    pass
                    
        if line_elem is not None:
            coord_elem = None
            for c in line_elem:
                c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                if c_tag == "coordinates":
                    coord_elem = c
                    break
            if coord_elem is not None and coord_elem.text:
                try:
                    coords = []
                    for pair in coord_elem.text.strip().split():
                        lon, lat, *_ = map(float, pair.split(","))
                        coords.append([lon, lat])
                    if coords:
                        feature["type"] = "line"
                        feature["coords"] = coords
                        return [feature]
                except:
                    pass

        if poly_elem is not None:
            coord_elem = None
            outer = None
            for c in poly_elem:
                c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                if c_tag == "outerBoundaryIs":
                    outer = c
                    break
            if outer is not None:
                ring = None
                for c in outer:
                    c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if c_tag == "LinearRing":
                        ring = c
                        break
                if ring is not None:
                    for c in ring:
                        c_tag = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                        if c_tag == "coordinates":
                            coord_elem = c
                            break
            if coord_elem is not None and coord_elem.text:
                try:
                    coords = []
                    for pair in coord_elem.text.strip().split():
                        lon, lat, *_ = map(float, pair.split(","))
                        coords.append([lon, lat])
                    if coords:
                        feature["type"] = "polygon"
                        feature["coords"] = coords
                        return [feature]
                except:
                    pass
        return []
        
    else:
        features = []
        for child in element:
            features.extend(extract_features_with_folders(child, current_folder))
        return features

def utm_to_latlon(easting: float, northing: float, zone_number: int, is_southern: bool) -> tuple:
    """
    Convert flat metric UTM coordinates (Easting/Northing) back to WGS84 geographic degrees (Lon/Lat).
    """
    import math
    
    # WGS84 ellipsoid constants
    a = 6378137.0
    f = 1.0 / 298.257223563
    b = a * (1.0 - f)
    e = math.sqrt(1.0 - (b**2 / a**2))
    e2 = e**2
    e4 = e2**2
    e6 = e2**3
    
    k0 = 0.9996
    
    # Adjust for southern hemisphere false-northing
    if is_southern:
        northing -= 10000000.0
        
    x = easting - 500000.0
    y = northing
    
    # Central meridian of the UTM Zone
    lon_origin = (zone_number - 1) * 6 - 180 + 3
    lon_origin_rad = math.radians(lon_origin)
    
    # Footpoint latitude calculation
    M = y / k0
    mu = M / (a * (1.0 - e2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0))
    
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    e12 = e1**2
    e13 = e1**3
    e14 = e1**4
    
    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e13 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e12 / 16.0 - 55.0 * e14 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * e13 / 96.0) * math.sin(6.0 * mu)
        + (1097.0 * e14 / 512.0) * math.sin(8.0 * mu)
    )
    
    C1 = (e2 / (1.0 - e2)) * math.cos(phi1)**2
    T1 = math.tan(phi1)**2
    N1 = a / math.sqrt(1.0 - e2 * math.sin(phi1)**2)
    R1 = a * (1.0 - e2) / (1.0 - e2 * math.sin(phi1)**2)**1.5
    D = x / (N1 * k0)
    
    # Latitude
    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D**2 / 2.0
        - (5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1**2 - 9.0 * (e2 / (1.0 - e2))) * D**4 / 24.0
        + (61.0 + 90.0 * T1 + 298.0 * C1 + 45.0 * T1**2 - 252.0 * (e2 / (1.0 - e2)) - 3.0 * C1**2) * D**6 / 720.0
    )
    
    # Longitude
    lon = lon_origin_rad + (
        D
        - (1.0 + 2.0 * T1 + C1) * D**3 / 6.0
        + (5.0 - 2.0 * C1 + 28.0 * T1 - 3.0 * C1**2 + 8.0 * (e2 / (1.0 - e2)) + 24.0 * T1**2) * D**5 / 120.0
    ) / math.cos(phi1)
    
    return math.degrees(lon), math.degrees(lat)

def convert_dxf_to_kml(content: bytes, utm_zone: int, is_southern: bool) -> bytes:
    """
    Convert points, lines, circles, and polygons from DXF back to standard KML/KMZ format.
    """
    import ezdxf
    import io
    import os
    import tempfile
    import math
    
    # Save DXF content to a temporary file to let ezdxf auto-detect ASCII/Binary encoding
    with tempfile.NamedTemporaryFile(delete=False, suffix=".dxf") as tmp:
        tmp.write(content)
        temp_path = tmp.name
        
    try:
        doc = ezdxf.readfile(temp_path)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
            
    msp = doc.modelspace()
    
    points = []
    lines = []
    texts = []
    
    for entity in msp:
        etype = entity.dxftype()
        layer = entity.dxf.layer
        
        if etype == "POINT":
            loc = entity.dxf.location
            if abs(loc.x) < 0.0001 and abs(loc.y) < 0.0001:
                continue
            points.append({
                "x": loc.x,
                "y": loc.y,
                "layer": layer,
                "name": None,
                "type": "point"
            })
        elif etype == "CIRCLE":
            center = entity.dxf.center
            if abs(center.x) < 0.0001 and abs(center.y) < 0.0001:
                continue
            points.append({
                "x": center.x,
                "y": center.y,
                "layer": layer,
                "name": None,
                "type": "circle"
            })
        elif etype in ("TEXT", "MTEXT"):
            text_val = entity.dxf.text if etype == "TEXT" else entity.text
            text_val = text_val.strip() if text_val else ""
            if not text_val:
                continue
            
            insert = entity.dxf.insert
            if abs(insert.x) < 0.0001 and abs(insert.y) < 0.0001:
                continue
            texts.append({
                "x": insert.x,
                "y": insert.y,
                "layer": layer,
                "text": text_val
            })
        elif etype == "LWPOLYLINE":
            pts = entity.get_points()
            coords = [(pt[0], pt[1]) for pt in pts]
            coords = [(x, y) for x, y in coords if not (abs(x) < 0.0001 and abs(y) < 0.0001)]
            if len(coords) >= 2:
                lines.append({
                    "coords": coords,
                    "layer": layer,
                    "name": None,
                    "is_closed": entity.closed,
                    "type": "lwpolyline"
                })
        elif etype == "POLYLINE":
            coords = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]
            coords = [(x, y) for x, y in coords if not (abs(x) < 0.0001 and abs(y) < 0.0001)]
            if len(coords) >= 2:
                lines.append({
                    "coords": coords,
                    "layer": layer,
                    "name": None,
                    "is_closed": entity.is_closed,
                    "type": "polyline"
                })
                
    # Match TEXT labels to close POINTS/CIRCLES or LINES (proximity search)
    unmatched_texts = []
    for t in texts:
        best_dist = float("inf")
        best_obj = None
        best_obj_type = None
        
        # Search points on the same layer
        for p in points:
            if p["layer"] == t["layer"]:
                dist = math.sqrt((p["x"] - t["x"])**2 + (p["y"] - t["y"])**2)
                if dist < best_dist:
                    best_dist = dist
                    best_obj = p
                    best_obj_type = "point"
                    
        # Search lines on the same layer
        for l in lines:
            if l["layer"] == t["layer"]:
                pts = l["coords"]
                mid = len(pts) // 2
                x_mid = (pts[mid-1][0] + pts[mid][0]) / 2.0
                y_mid = (pts[mid-1][1] + pts[mid][1]) / 2.0
                dist = math.sqrt((x_mid - t["x"])**2 + (y_mid - t["y"])**2)
                if dist < best_dist:
                    best_dist = dist
                    best_obj = l
                    best_obj_type = "line"
                    
        # Associate if distance is within 15 meters for points, or 30 meters for lines
        if best_obj_type == "point" and best_dist < 15.0:
            if not best_obj["name"]:
                best_obj["name"] = t["text"]
            else:
                best_obj["name"] += " " + t["text"]
        elif best_obj_type == "line" and best_dist < 30.0:
            if not best_obj["name"]:
                best_obj["name"] = t["text"]
            else:
                best_obj["name"] += " " + t["text"]
        else:
            unmatched_texts.append(t)
            
    # Collect all coordinates to detect if the drawing is already using direct GPS coordinates (degree units)
    xs = []
    ys = []
    for p in points:
        xs.append(p["x"])
        ys.append(p["y"])
    for l in lines:
        for x, y in l["coords"]:
            xs.append(x)
            ys.append(y)
    for t in texts:
        xs.append(t["x"])
        ys.append(t["y"])
        
    is_already_latlon = False
    if xs and ys:
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        # GPS bounds: Longitude between -180 and 180, Latitude between -90 and 90
        if -180.0 <= min_x <= 180.0 and -180.0 <= max_x <= 180.0 and -90.0 <= min_y <= 90.0 and -90.0 <= max_y <= 90.0:
            is_already_latlon = True
            
    # Helper to project back
    def project_back(x, y):
        if is_already_latlon:
            return x, y
        return utm_to_latlon(x, y, utm_zone, is_southern)
        
    # Group elements by AutoCAD layer
    layers = {}
    def add_to_layer(layer_name, item):
        if layer_name not in layers:
            layers[layer_name] = []
        layers[layer_name].append(item)
        
    for p in points:
        name = p["name"] or f"Node-{p['type'].upper()}"
        lon, lat = project_back(p["x"], p["y"])
        add_to_layer(p["layer"], {
            "name": name,
            "type": "point",
            "coords": [lon, lat]
        })
        
    for l in lines:
        name = l["name"] or ("Polygon" if l["is_closed"] else "LineString")
        proj_coords = [project_back(x, y) for x, y in l["coords"]]
        add_to_layer(l["layer"], {
            "name": name,
            "type": "polygon" if l["is_closed"] else "line",
            "coords": proj_coords
        })
        
    for t in unmatched_texts:
        lon, lat = project_back(t["x"], t["y"])
        add_to_layer(t["layer"], {
            "name": t["text"],
            "type": "point",
            "coords": [lon, lat]
        })
        
    # Build KML
    kml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        '  <Document>',
        '    <name>Converted DXF Drawing</name>',
        '    <open>1</open>'
    ]
    
    for l_name, items in sorted(layers.items()):
        kml_parts.append('    <Folder>')
        kml_parts.append(f'      <name>{l_name}</name>')
        
        for item in items:
            name_esc = item["name"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            kml_parts.append('      <Placemark>')
            kml_parts.append(f'        <name>{name_esc}</name>')
            
            if item["type"] == "point":
                lon, lat = item["coords"]
                kml_parts.append('        <Point>')
                kml_parts.append(f'          <coordinates>{lon:.6f},{lat:.6f},0</coordinates>')
                kml_parts.append('        </Point>')
            elif item["type"] == "line":
                coord_str = " ".join(f"{lon:.6f},{lat:.6f},0" for lon, lat in item["coords"])
                kml_parts.append('        <LineString>')
                kml_parts.append(f'          <coordinates>{coord_str}</coordinates>')
                kml_parts.append('        </LineString>')
            elif item["type"] == "polygon":
                coords = list(item["coords"])
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                coord_str = " ".join(f"{lon:.6f},{lat:.6f},0" for lon, lat in coords)
                kml_parts.append('        <Polygon>')
                kml_parts.append('          <outerBoundaryIs>')
                kml_parts.append('            <LinearRing>')
                kml_parts.append(f'              <coordinates>{coord_str}</coordinates>')
                kml_parts.append('            </LinearRing>')
                kml_parts.append('          </outerBoundaryIs>')
                kml_parts.append('        </Polygon>')
                
            kml_parts.append('      </Placemark>')
            
        kml_parts.append('    </Folder>')
        
    kml_parts.extend([
        '  </Document>',
        '</kml>'
    ])
    
    return "\n".join(kml_parts).encode("utf-8")


