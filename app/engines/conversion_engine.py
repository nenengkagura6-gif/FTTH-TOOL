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

    # Sanitize layer names and extract unique ones
    layers = set()
    for f in features:
        sanitized = sanitize_dxf_name(f["layer"])
        f["layer"] = sanitized
        layers.add(sanitized)
        
    # Start DXF building
    dxf_lines = []
    
    def add_val(code, val):
        dxf_lines.append(f"{code:>3}")
        dxf_lines.append(str(val))
        
    # 1. Write TABLES section for layer colors
    add_val(0, "SECTION")
    add_val(2, "TABLES")
    add_val(0, "TABLE")
    add_val(2, "LAYER")
    add_val(70, len(layers))
    
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
    
    for l_name in sorted(layers):
        l_lower = l_name.lower()
        color = 7
        for key, val in color_map.items():
            if key in l_lower:
                color = val
                break
        add_val(0, "LAYER")
        add_val(2, l_name)
        add_val(70, 0)
        add_val(62, color)
        add_val(6, "Continuous")
        
    add_val(0, "ENDTAB")
    add_val(0, "ENDSEC")
    
    # 2. Write ENTITIES section
    add_val(0, "SECTION")
    add_val(2, "ENTITIES")
    
    for f in features:
        layer = f["layer"]
        name = f["name"]
        ftype = f["type"]
        
        if ftype == "point":
            lon, lat = f["coords"]
            x, y = project_coords(lon, lat)
            
            # Write a point circle (Radius = 1 meter)
            add_val(0, "CIRCLE")
            add_val(8, layer)
            add_val(10, x)
            add_val(20, y)
            add_val(30, 0.0)
            add_val(40, 1.0)
            
            # Write point node (standard POINT)
            add_val(0, "POINT")
            add_val(8, layer)
            add_val(10, x)
            add_val(20, y)
            add_val(30, 0.0)
            
            # Write text label next to the circle
            add_val(0, "TEXT")
            add_val(8, layer)
            add_val(10, x + 1.2)
            add_val(20, y + 1.2)
            add_val(30, 0.0)
            add_val(40, 1.5) # Height in meters
            add_val(1, name)
            
        elif ftype in ("line", "polygon"):
            # Project all vertices
            projected = [project_coords(lon, lat) for lon, lat in f["coords"]]
            is_closed = ftype == "polygon"
            
            # Write polyline
            add_val(0, "LWPOLYLINE")
            add_val(8, layer)
            add_val(90, len(projected))
            add_val(70, 1 if is_closed else 0)
            add_val(43, 0.0)
            
            for x, y in projected:
                add_val(10, x)
                add_val(20, y)
                
            # Write line name at the midpoint of the line for identification
            if name and name != "No Name" and len(projected) >= 2:
                mid_idx = len(projected) // 2
                x_mid = (projected[mid_idx-1][0] + projected[mid_idx][0]) / 2.0
                y_mid = (projected[mid_idx-1][1] + projected[mid_idx][1]) / 2.0
                add_val(0, "TEXT")
                add_val(8, layer)
                add_val(10, x_mid + 1.0)
                add_val(20, y_mid + 1.0)
                add_val(30, 0.0)
                add_val(40, 1.5)
                add_val(1, name)
                
    add_val(0, "ENDSEC")
    add_val(0, "EOF")
    
    return "\n".join(dxf_lines).encode("utf-8")

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

