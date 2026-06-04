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
