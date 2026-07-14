import re

with open(r'd:\WEB APP\app\engines\kml_apd_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Helper function to get FDT from line name
fdt_extractor = """
def get_fdt_name_from_line(line_name):
    upper_name = line_name.upper()
    if "FDT" in upper_name:
        idx = upper_name.find("FDT")
        return line_name[idx:].strip()
    return "FDT" # Fallback
"""
content = content.replace("def process_boundaries_and_hp_in_line(line_folder):", fdt_extractor + "\ndef process_boundaries_and_hp_in_line(line_folder):")

# 1. Update move_root_hp_to_lines
old_move_hp = """            nm = line_folder.find("name")
            parts = (nm.text or "").split()
            letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (nm.text or "")[0].upper()
            polygons = polygons_by_line.get(letter, [])"""

new_move_hp = """            nm = line_folder.find("name")
            line_name = (nm.text or "").strip()
            parts = line_name.split()
            letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper() if line_name else 'X'
            fdt_name = get_fdt_name_from_line(line_name)
            
            polygons = []
            if fdt_name in polygons_by_line and letter in polygons_by_line[fdt_name]:
                polygons = polygons_by_line[fdt_name][letter]"""
content = content.replace(old_move_hp, new_move_hp)

# 2. Update update_boundary_descriptions
old_update_boundary = """        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (line_name or "")[0].upper()
        polygons = polygons_by_line.get(letter, [])"""

new_update_boundary = """        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (line_name or "")[0].upper()
        fdt_name = get_fdt_name_from_line(line_name)
        polygons = polygons_by_line.get(fdt_name, {}).get(letter, [])"""
content = content.replace(old_update_boundary, new_update_boundary)

# 3. Update process_poles signature
content = content.replace("def process_poles(doc, tol_m=5.0):", "def process_poles(doc, fdts, tol_m=5.0):")

old_process_poles_fdt = """    fdt_lat, fdt_lon = None, None
    for f in doc.findall("Folder"):
        nm_el = f.find("name")
        if nm_el is not None and (nm_el.text or "").upper().startswith("FDT"):
            pm = f.find("Placemark/Point/coordinates")
            if pm is not None and pm.text:
                try:
                    lon, lat, *_ = pm.text.strip().split(",")
                    fdt_lat, fdt_lon = float(lat), float(lon)
                except Exception:
                    pass
            break"""
new_process_poles_fdt = """    # FDTs are now passed as fdts dictionary: {"FDT 01": (lat, lon)}"""
content = content.replace(old_process_poles_fdt, new_process_poles_fdt)

# Inside process_poles, replace fdt_lat logic for line normalization
old_line_fdt_logic = """        # Normalize direction: distribution from FDT to end
        if fdt_lat is not None and dist_mapped:"""
new_line_fdt_logic = """        fdt_name = get_fdt_name_from_line(line_name)
        fdt_lat, fdt_lon = fdts.get(fdt_name, (None, None))
        
        # Normalize direction: distribution from FDT to end
        if fdt_lat is not None and dist_mapped:"""
content = content.replace(old_line_fdt_logic, new_line_fdt_logic)

# Replace fdt_lat in remaining poles loop
old_remaining = """    if remaining:
        if fdt_lat is not None:
            remaining.sort(key=lambda pm: haversine(poles[pm][0], poles[pm][1], fdt_lat, fdt_lon))"""
new_remaining = """    if remaining:
        # Fallback to first FDT for unassigned poles if any
        fallback_lat, fallback_lon = None, None
        if fdts:
            fallback_lat, fallback_lon = list(fdts.values())[0]
        if fallback_lat is not None:
            remaining.sort(key=lambda pm: haversine(poles[pm][0], poles[pm][1], fallback_lat, fallback_lon))"""
content = content.replace(old_remaining, new_remaining)

# Update fdt_lat references in remaining
content = content.replace("if fdt_lat is not None and haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:", "if fallback_lat is not None and haversine(lat, lon, fallback_lat, fallback_lon) <= 5.0:")

# 4. _process_kml_tree step 1
old_step1 = """    # Step 1: Process boundaries and HP coverage per LINE
    polygons_by_line = {}
    line_folders = []
    for line_folder in doc.findall("Folder"):
        nm = line_folder.find("name")
        if nm is None:
            continue
        if (nm.text or "").strip().upper().startswith("LINE "):
            line_folders.append(line_folder)
            polygons = process_boundaries_and_hp_in_line(line_folder)
            if polygons:
                polygons_by_line[polygons[0][3]] = polygons
            else:
                parts = (nm.text or "").split()
                letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (nm.text or "")[0].upper()
                polygons_by_line[letter] = []"""

new_step1 = """    # Step 1: Process boundaries and HP coverage per LINE
    polygons_by_line = {} # now it is polygons_by_line[fdt_name][letter]
    line_folders = []
    for line_folder in doc.findall("Folder"):
        nm = line_folder.find("name")
        if nm is None:
            continue
        line_name = (nm.text or "").strip()
        if line_name.upper().startswith("LINE "):
            line_folders.append(line_folder)
            fdt_name = get_fdt_name_from_line(line_name)
            if fdt_name not in polygons_by_line:
                polygons_by_line[fdt_name] = {}
                
            polygons = process_boundaries_and_hp_in_line(line_folder)
            
            parts = line_name.split()
            letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper()
            
            if polygons:
                polygons_by_line[fdt_name][polygons[0][3]] = polygons
            else:
                polygons_by_line[fdt_name][letter] = []"""
content = content.replace(old_step1, new_step1)

# Step 4: Get FDT info
old_step4 = """    # Step 4: Get FDT info for cable/sling processing
    fdt_count = 0
    fdt_lat, fdt_lon = None, None
    for f in doc.findall("Folder"):
        nm = f.find("name")
        if nm is not None and (nm.text or "").upper().startswith("FDT"):
            fdt_count += 1
            if fdt_lat is None:
                pm = f.find("Placemark/Point/coordinates")
                if pm is not None and pm.text:
                    try:
                        lon, lat, *_ = pm.text.strip().split(",")
                        fdt_lat, fdt_lon = float(lat), float(lon)
                    except Exception:
                        pass"""

new_step4 = """    # Step 4: Get FDT info for cable/sling processing
    fdts = {}
    fdt_count = 0
    for f in doc.findall("Folder"):
        nm = f.find("name")
        if nm is not None and (nm.text or "").upper().startswith("FDT"):
            for pm in f.findall("Placemark"):
                fdt_nm_el = pm.find("name")
                fdt_name = (fdt_nm_el.text or "").strip() if fdt_nm_el is not None else "FDT"
                coords = pm.find("Point/coordinates")
                if coords is not None and coords.text:
                    try:
                        lon, lat, *_ = coords.text.strip().split(",")
                        fdts[fdt_name.upper()] = (float(lat), float(lon))
                        fdt_count += 1
                    except Exception:
                        pass"""
content = content.replace(old_step4, new_step4)

# Step 5: Process FAT/Cable/Sling for each line
old_step5 = """    # Step 5: Process FAT/Cable/Sling for each line
    for line_folder in line_folders:
        nm = line_folder.find("name")
        parts = (nm.text or "").split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else (nm.text or "")[0].upper()
        polygons = polygons_by_line.get(letter, [])
        process_fat_cable_sling_for_line(
            line_folder, polygons, global_poles, fdt_count,
            doc=doc, line_folders=line_folders,
            fdt_lat=fdt_lat, fdt_lon=fdt_lon,
            tol_m_pole_line=5.0
        )"""

new_step5 = """    # Step 5: Process FAT/Cable/Sling for each line
    for line_folder in line_folders:
        nm = line_folder.find("name")
        line_name = (nm.text or "").strip()
        parts = line_name.split()
        letter = parts[1][0].upper() if len(parts) >= 2 and parts[1] else line_name[0].upper()
        
        fdt_name = get_fdt_name_from_line(line_name)
        fdt_lat, fdt_lon = fdts.get(fdt_name.upper(), (None, None))
        if fdt_lat is None and fdts: # fallback to first FDT
            fdt_lat, fdt_lon = list(fdts.values())[0]
            
        polygons = polygons_by_line.get(fdt_name, {}).get(letter, [])
        process_fat_cable_sling_for_line(
            line_folder, polygons, global_poles, fdt_count,
            doc=doc, line_folders=line_folders,
            fdt_lat=fdt_lat, fdt_lon=fdt_lon,
            tol_m_pole_line=5.0
        )"""
content = content.replace(old_step5, new_step5)

# Step 6: process_poles call
old_step6 = """    # Step 6: Process pole numbering
    process_poles(doc, tol_m=5.0)"""

new_step6 = """    # Step 6: Process pole numbering
    # Pass fdts dictionary with upper case keys
    process_poles(doc, {k.upper(): v for k, v in fdts.items()}, tol_m=5.0)"""
content = content.replace(old_step6, new_step6)

# Fix remaining reference to fdt_lat in process_poles loopback check
content = content.replace("if fdt_lat is not None and haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:", "if fdt_lat is not None and haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:") # Already fixed above to use fdt_lat from line, wait no, inside remaining it's fallback_lat
content = content.replace("""                is_fdt = False
                if fdt_lat is not None and haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:
                    is_fdt = True""", """                is_fdt = False
                if fdt_lat is not None and haversine(lat, lon, fdt_lat, fdt_lon) <= 5.0:
                    is_fdt = True""")


with open(r'd:\WEB APP\app\engines\kml_apd_engine_new.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactoring applied to kml_apd_engine_new.py!")
