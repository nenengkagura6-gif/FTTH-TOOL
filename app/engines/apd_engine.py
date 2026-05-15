"""
Engine for APD HPDB Processing
Supports both KML and KMZ files
"""
import io
import os
import re
import math
import time
import zipfile
import requests
from typing import Dict, List, Tuple, Any, Optional
from lxml import etree
from pathlib import Path
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Border, Side
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

from utils.commons import haversine, safe_localname


def parse_kml_lxml_with_kmz(content: bytes, is_kmz: bool = False) -> etree.ElementTree:
    """Parse KML content using lxml, with KMZ support."""
    parser = etree.XMLParser(recover=True)
    
    if is_kmz:
        with zipfile.ZipFile(io.BytesIO(content), "r") as kmz:
            kml_files = [f for f in kmz.namelist() if f.endswith(".kml")]
            if not kml_files:
                raise ValueError("No KML file found inside KMZ archive")
            kml_name = kml_files[0]
            with kmz.open(kml_name) as kml_file:
                content = kml_file.read()
    
    return etree.parse(io.BytesIO(content), parser)


class APDEngine:
    """Engine for APD HPDB processing with geocoding."""
    
    def __init__(self, template_content: bytes = None, apd_template_content: bytes = None):
        self.template_content = template_content
        
        if apd_template_content:
            self.apd_template_content = apd_template_content
        else:
            default_template = Path("app/templates/default_apd.xlsx")
            
            if default_template.exists():
                with open(default_template, "rb") as f:
                    self.apd_template_content = f.read()
            else:
                self.apd_template_content = None
        
        self.session = self._create_session()
        self.geocode_cache = {}
        self.input_filename = ""
        self.tree = None
        self.root = None
        self.fats = []
        self.poles = []
        self.hp_points = []
    
    def _create_session(self) -> requests.Session:
        """Create requests session with retry logic."""
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
    
    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict[str, Any]:
        """Load KML or KMZ content."""
        self.input_filename = filename
        self.tree = parse_kml_lxml_with_kmz(content, is_kmz)
        self.root = self.tree.getroot()
        return {"status": "success", "filename": filename, "is_kmz": is_kmz}
    
    def set_templates(self, template_content: bytes = None, apd_template_content: bytes = None) -> None:
        """Set template contents."""
        self.template_content = template_content
        self.apd_template_content = apd_template_content
    
    def parse_fat_pole(self) -> Tuple[List[Dict], List[Dict]]:
        """Parse FAT and POLE placemarks from KML."""
        placemarks_fat = []
        placemarks_pole = []
        
        for folder in self.root.iter():
            if safe_localname(folder) == "Folder":
                folder_name = ""
                for child in folder:
                    if safe_localname(child) == "name":
                        folder_name = child.text if child.text else ""
                        break
                
                for pm in folder:
                    if safe_localname(pm) == "Placemark":
                        name = "NONAME"
                        coords = None
                        for child in pm.iter():
                            if safe_localname(child) == "name":
                                name = child.text if child.text else "NONAME"
                            if safe_localname(child) == "coordinates":
                                coords = child
                        
                        if coords is not None:
                            coords_text = coords.text.strip()
                            for coord_pair in coords_text.split():
                                try:
                                    lon, lat, *_ = map(float, coord_pair.split(","))
                                    if folder_name.strip().upper() == "FAT":
                                        match = re.search(r'\b([A-Z]\d{1,2})\b', name, re.IGNORECASE)
                                        fat_id = match.group(1).upper() if match else name.strip().upper()
                                        placemarks_fat.append({"fat_id": fat_id, "lat": lat, "lon": lon})
                                    elif "POLE" in folder_name.upper():
                                        placemarks_pole.append({"name": name.strip(), "lat": lat, "lon": lon})
                                    break
                                except:
                                    continue
        
        return placemarks_fat, placemarks_pole
    
    def build_fat_to_pole_map(self, max_distance: float = 15) -> Dict[str, Dict]:
        """Build mapping of FAT to nearest POLE."""
        fat_to_pole = {}
        for fat in self.fats:
            fat_id, flat, flon = fat["fat_id"], fat["lat"], fat["lon"]
            best_match, best_distance = None, float("inf")
            for pole in self.poles:
                d = haversine(flat, flon, pole["lat"], pole["lon"])
                if d < best_distance:
                    best_distance = d
                    best_match = pole
            if best_match and best_distance <= max_distance:
                fat_to_pole[fat_id] = best_match
        return fat_to_pole
    
    def build_fat_to_hpc_map(self, max_distance: float = 25) -> Dict[str, List]:
        """Build mapping of FAT to nearest HP Cover."""
        fat_to_hpc = {}
        for fat in self.fats:
            fat_id, flat, flon = fat["fat_id"], fat["lat"], fat["lon"]
            best_match, best_distance = None, float("inf")
            for hp in self.hp_points:
                d = haversine(flat, flon, float(hp[1]), float(hp[2]))
                if d < best_distance:
                    best_distance = d
                    best_match = hp
            if best_match and best_distance <= max_distance:
                fat_to_hpc[fat_id] = best_match
        return fat_to_hpc
    
    def find_hp_cover_folders(self) -> List:
        """Find all HP COVER folders."""
        hp_cover_folders = []
        for folder in self.root.iter():
            if safe_localname(folder) == "Folder":
                name_elem = None
                for child in folder:
                    if safe_localname(child) == "name":
                        name_elem = child
                        break
                if name_elem is not None and name_elem.text and "HP" in name_elem.text.upper() and "COVER" in name_elem.text.upper():
                    hp_cover_folders.append(folder)
        return hp_cover_folders
    
    def extract_points_recursive(self, element, current_folder: str = "") -> List[List]:
        """Recursively extract points from folders."""
        points = []
        for child in element:
            tag = safe_localname(child)
            if tag == "Folder":
                name_elem = None
                for sub in child:
                    if safe_localname(sub) == "name":
                        name_elem = sub
                        break
                subfolder_name = name_elem.text.strip() if name_elem is not None else current_folder
                new_folder = f"{current_folder}/{subfolder_name}" if current_folder else subfolder_name
                points.extend(self.extract_points_recursive(child, new_folder))
            elif tag == "Placemark":
                name = "No Name"
                lon, lat = "", ""
                for sub in child.iter():
                    if safe_localname(sub) == "name":
                        name = sub.text.strip() if sub.text else "No Name"
                    if safe_localname(sub) == "coordinates":
                        lon, lat = sub.text.strip().split(",")[:2]
                if lat and lon:
                    points.append([name, lat, lon, current_folder])
        return points
    
    def clean_region_name(self, text: str) -> str:
        """Clean region name by removing common prefixes."""
        if not text:
            return ""
        text = str(text)
        remove_words = [
            "Provinsi ", "Kecamatan ", "Kabupaten ", "Kab. ", "Kota ",
            "Desa ", "Kelurahan "
        ]
        for rw in remove_words:
            text = text.replace(rw, "")
        return text.strip().upper()
    
    def reverse_geocode(self, lat: float, lon: float) -> Dict[str, str]:
        """Reverse geocode coordinates using Nominatim."""
        try:
            key = f"{round(float(lat), 6)},{round(float(lon), 6)}"
            if key in self.geocode_cache:
                return self.geocode_cache[key]
            
            url = "https://nominatim.openstreetmap.org/reverse"
            headers = {"User-Agent": "Mozilla/5.0 APD_HPDB_API"}
            params = {
                "lat": lat, "lon": lon,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": 18
            }
            
            response = self.session.get(url, params=params, headers=headers, timeout=30)
            time.sleep(1.2)  # Respect rate limiting
            
            if response.status_code != 200:
                return self._empty_geo_result()
            
            data = response.json()
            addr = data.get("address", {})
            
            # Extract street/road name
            street_name = (
                addr.get("road") or
                addr.get("street") or
                addr.get("path") or
                addr.get("pedestrian") or
                addr.get("track") or
                addr.get("highway") or
                addr.get("locality") or
                ""
            )
            
            result = {
                "province": self.clean_region_name(addr.get("state", "")),
                "kabupaten": self.clean_region_name(
                    addr.get("city") or addr.get("county") or 
                    addr.get("municipality") or addr.get("state_district", "")
                ),
                "kecamatan": self.clean_region_name(
                    addr.get("subdistrict") or addr.get("district") or
                    addr.get("city_district") or addr.get("suburb") or
                    addr.get("borough") or addr.get("quarter") or
                    addr.get("neighbourhood", "")
                ),
                "desa": self.clean_region_name(
                    addr.get("village") or addr.get("hamlet") or
                    addr.get("neighbourhood") or addr.get("quarter", "")
                ),
                "kodepos": str(addr.get("postcode", "")).strip(),
                "jalan": str(street_name).strip().upper()
            }
            
            self.geocode_cache[key] = result
            return result
        
        except Exception:
            return self._empty_geo_result()
    
    def _empty_geo_result(self) -> Dict[str, str]:
        """Return empty geocode result."""
        return {"province": "", "kabupaten": "", "kecamatan": "", "desa": "", "kodepos": "", "jalan": ""}
    
    def get_fdt_coords(self) -> Tuple[Optional[str], Optional[str]]:
        """Get FDT coordinates from KML."""
        try:
            for folder in self.root.iter():
                if safe_localname(folder) == "Folder":
                    name_elem = None
                    for child in folder:
                        if safe_localname(child) == "name":
                            name_elem = child
                            break
                    if name_elem is not None and name_elem.text and name_elem.text.strip().upper() == "FDT":
                        for pm in folder:
                            if safe_localname(pm) == "Placemark":
                                for coord in pm.iter():
                                    if safe_localname(coord) == "coordinates":
                                        lon, lat = map(float, coord.text.strip().split(",")[:2])
                                        return f"{lat:.5f}", f"{lon:.5f}"
        except Exception:
            pass
        return None, None
    
    def process(self) -> Dict[str, Any]:
        """Main processing method."""
        if not self.root:
            return {"status": "error", "message": "No KML/KMZ loaded"}
        
        # Parse FAT and POLE
        self.fats, self.poles = self.parse_fat_pole()
        fat_to_pole = self.build_fat_to_pole_map(max_distance=15)
        
        # Parse HP Cover points
        hp_folders = self.find_hp_cover_folders()
        for folder in hp_folders:
            self.hp_points.extend(self.extract_points_recursive(folder, ""))
        
        fat_to_hpc = self.build_fat_to_hpc_map(max_distance=25)
        
        # Calculate FAT ID statistics
        fat_id_nums = {}
        for row in self.hp_points:
            match = re.search(r'\b([A-Z]\d{1,2})\b', row[3] + " " + row[0], re.IGNORECASE)
            fat_id = match.group(1).upper() if match else ""
            if not fat_id:
                continue
            prefix = fat_id[0].upper()
            num = int(re.findall(r'\d+', fat_id)[0]) if re.findall(r'\d+', fat_id) else 0
            if prefix not in fat_id_nums:
                fat_id_nums[prefix] = []
            fat_id_nums[prefix].append(num)
        fat_id_max = {k: max(v) for k, v in fat_id_nums.items()}
        
        # Create workbook
        wb = Workbook()
        ws = wb.active
        headers = [
            "FDT Tray (Front)", "FDT Port", "Line", "Capacity",
            "Tube Colour", "Core Number", "FAT ID",
            "FAT Port", "POLE_Name", "POLE_Lat", "POLE_Lon",
            "HP_Cover", "name_1", "name_2", "latitude", "longitude"
        ]
        ws.append(headers)
        
        # Process rows
        fat_port_counters = {}
        fdt_port_counter = 1
        core_number = 1
        skip_numbers = {11, 12, 23, 24, 35, 36, 47, 48}
        last_fat_id = ""
        last_prefix = ""
        
        for row in self.hp_points:
            name, lat, lon, folder_path = row
            name_parts = [p.strip() for p in re.split(r"[,/ ]", name) if p.strip()]
            name_1 = name_parts[0] if len(name_parts) > 0 else ""
            name_2 = name_parts[1] if len(name_parts) > 1 else ""
            
            match = re.search(r'\b([A-Z]\d{1,2})\b', folder_path + " " + name, re.IGNORECASE)
            fat_id = match.group(1).upper() if match else ""
            if not fat_id:
                continue
            
            prefix = fat_id[0].upper()
            num_part = int(re.findall(r'\d+', fat_id)[0]) if re.findall(r'\d+', fat_id) else 0
            
            if fat_id != last_fat_id:
                fat_port_counters[fat_id] = 1
                last_fat_id = fat_id
            
            if prefix != last_prefix:
                core_number = 1
                last_prefix = prefix
            
            fat_port = fat_port_counters[fat_id]
            fat_port_counters[fat_id] += 1
            
            fdt_port = fdt_port_counter if fat_port == 1 else ""
            if fat_port == 1:
                fdt_port_counter += 1
            
            core = ""
            if fat_port in [1, 2]:
                while core_number in skip_numbers:
                    core_number += 1
                core = core_number
                core_number += 1
            
            line, cap, tube_number = "", "", ""
            if core:
                line = f"LINE {prefix}"
                max_num = fat_id_max.get(prefix, 0)
                if max_num <= 10:
                    cap = "24C/2T"
                elif max_num <= 15:
                    cap = "36C/3T"
                elif max_num <= 20:
                    cap = "48C/4T"
                
                if num_part <= 5:
                    tube_number = "1"
                elif num_part <= 10:
                    tube_number = "2"
                elif num_part <= 15:
                    tube_number = "3"
                elif num_part <= 20:
                    tube_number = "4"
            
            tray = ""
            if isinstance(fdt_port, int):
                if 1 <= fdt_port <= 8: tray = 1
                elif 9 <= fdt_port <= 16: tray = 2
                elif 17 <= fdt_port <= 24: tray = 3
                elif 25 <= fdt_port <= 32: tray = 4
                elif 33 <= fdt_port <= 40: tray = 5
            
            pole_name, pole_lat, pole_lon = "", "", ""
            if fat_id in fat_to_pole:
                pole_name = fat_to_pole[fat_id]["name"]
                pole_lat = fat_to_pole[fat_id]["lat"]
                pole_lon = fat_to_pole[fat_id]["lon"]
            
            hpc_text = ""
            if fat_id in fat_to_hpc:
                hpc_text = "IN FRONT OF HP NUMBER " + fat_to_hpc[fat_id][0]
            
            ws.append([
                tray, fdt_port, line, cap, tube_number, core, fat_id, fat_port,
                pole_name, pole_lat, pole_lon, hpc_text,
                name_1, name_2, lat, lon
            ])
        
        # Apply formatting
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for row in ws.iter_rows(min_row=2):
            for idx, cell in enumerate(row, 1):
                if cell.value not in (None, ""):
                    cell.border = thin_border
                if idx == 5:
                    if cell.value == "1":
                        cell.fill = PatternFill(start_color="ADD8E6", end_color="ADD8E6", fill_type="solid")
                    elif cell.value == "2":
                        cell.fill = PatternFill(start_color="FFD580", end_color="FFD580", fill_type="solid")
                    elif cell.value == "3":
                        cell.fill = PatternFill(start_color="90EE90", end_color="90EE90", fill_type="solid")
                    elif cell.value == "4":
                        cell.fill = PatternFill(start_color="D2B48C", end_color="D2B48C", fill_type="solid")
        
        # Save intermediate result
        output_buffer = io.BytesIO()
        wb.save(output_buffer)
        output_buffer.seek(0)
        
        output_filename = f"{os.path.splitext(self.input_filename)[0]}_with_pole.xlsx"
        
        # If template provided, integrate with template
        if self.apd_template_content:
            return self._integrate_with_template(output_buffer.getvalue(), output_filename)
        
        return {
            "status": "success",
            "filename": output_filename,
            "content": output_buffer.getvalue()
        }
    
    def _integrate_with_template(self, data_content: bytes, output_filename: str) -> Dict[str, Any]:
        """Integrate data with APD template."""
        wb_template = load_workbook(io.BytesIO(self.apd_template_content))
        ws_template = wb_template.worksheets[0]
        
        wb_data = load_workbook(io.BytesIO(data_content))
        ws_data = wb_data.active
        
        headers = [str(h).strip() for h in next(ws_data.iter_rows(min_row=1, max_row=1, values_only=True))]
        data_rows = list(ws_data.iter_rows(min_row=2, values_only=True))
        
        header_map = {
            "FDT Tray (Front)": "A",
            "FDT Port": "B",
            "Line": "C",
            "Capacity": "D",
            "Tube Colour": "E",
            "Core Number": "F",
            "FAT ID": ["G", "AT"],
            "FAT Port": "H",
            "POLE_Name": "I",
            "POLE_Lat": "J",
            "POLE_Lon": "K",
            "HP_Cover": "L",
            "name_1": "AJ",
            "name_2": "AJ",
            "latitude": "AV",
            "longitude": "AW",
        }
        
        tube_colors = {
            "1": "ADD8E6",
            "2": "FFD580",
            "3": "90EE90",
            "4": "D2B48C",
        }
        
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        start_row = 10
        for i, row in enumerate(data_rows, start=start_row):
            row_dict = dict(zip(headers, row))
            
            for key, target in header_map.items():
                if key not in row_dict:
                    continue
                val = row_dict[key]
                if val in (None, ""):
                    continue
                
                if isinstance(target, list):
                    for col in target:
                        cell = ws_template[f"{col}{i}"]
                        cell.value = val
                        cell.border = thin_border
                elif key == "name_1":
                    combined = str(val)
                    if row_dict.get("name_2"):
                        combined += " " + str(row_dict["name_2"])
                    cell = ws_template[f"{target}{i}"]
                    cell.value = combined
                    cell.border = thin_border
                elif key == "name_2":
                    continue
                else:
                    cell = ws_template[f"{target}{i}"]
                    if key in ["POLE_Lat", "POLE_Lon", "latitude", "longitude"]:
                        try:
                            val = float(val)
                        except:
                            pass
                    
                    cell.value = val
                    cell.border = thin_border
                    
                    if key == "Tube Colour":
                        color_hex = tube_colors.get(str(val).strip(), None)
                        if color_hex:
                            cell.fill = PatternFill(start_color=color_hex, end_color=color_hex, fill_type="solid")
        
        # Add FDT coordinates
        lat_fdt, lon_fdt = self.get_fdt_coords()
        if lat_fdt and lon_fdt:
            ws_template["N6"].value = f": {lat_fdt},{lon_fdt}"
        
        # Clean and set location name (remove dash)
        file_base_name = os.path.splitext(os.path.basename(self.input_filename))[0]
        file_base_name_clean = file_base_name.replace("APD_HPDB_", "")
        parts = file_base_name_clean.split(" ", 1)
        lokasi_nama = parts[1].strip() if len(parts) > 1 else file_base_name_clean.strip()
        
        # Remove dash from cluster name
        lokasi_nama_clean = lokasi_nama.replace("-", " ")
        
        ws_template["C5"].value = lokasi_nama_clean
        ws_template["Y10"].value = lokasi_nama_clean
        ws_template["Z10"].value = lokasi_nama_clean
        
        # Reverse geocode
        max_row_data = start_row + len(data_rows) - 1
        lat_source = ws_template["J10"].value
        lon_source = ws_template["K10"].value
        
        if lat_source in (None, "") or lon_source in (None, ""):
            lat_source = ws_template["AV10"].value
            lon_source = ws_template["AW10"].value
        
        geo_result = self._empty_geo_result()
        if lat_source not in (None, "") and lon_source not in (None, ""):
            geo_result = self.reverse_geocode(lat_source, lon_source)
        
        ws_template["M10"] = geo_result["province"]
        ws_template["N10"] = geo_result["kabupaten"]
        ws_template["W10"] = geo_result["kabupaten"]
        ws_template["O10"] = geo_result["kecamatan"]
        ws_template["P10"] = geo_result["desa"]
        ws_template["Q10"] = geo_result["kodepos"]
        ws_template["AD10"] = geo_result["jalan"]  # Nama jalan
        
        # Autocopy geocoding and cluster data to all rows
        for r in range(11, max_row_data + 1):
            ws_template[f"M{r}"] = ws_template["M10"].value
            ws_template[f"N{r}"] = ws_template["N10"].value
            ws_template[f"W{r}"] = ws_template["W10"].value
            ws_template[f"O{r}"] = ws_template["O10"].value
            ws_template[f"P{r}"] = ws_template["P10"].value
            ws_template[f"Q{r}"] = ws_template["Q10"].value
            ws_template[f"AD{r}"] = ws_template["AD10"].value  # Autocopy nama jalan
            ws_template[f"Y{r}"] = ws_template["Y10"].value    # Autocopy cluster Y
            ws_template[f"Z{r}"] = ws_template["Z10"].value    # Autocopy cluster Z
        
        # Count unique FAT IDs to determine capacity (Cell N3)
        fat_id_col_idx = headers.index("FAT ID") if "FAT ID" in headers else -1
        unique_fat_ids = set()
        if fat_id_col_idx >= 0:
            for row in data_rows:
                fat_id = row[fat_id_col_idx]
                if fat_id and str(fat_id).strip():
                    unique_fat_ids.add(str(fat_id).strip().upper())
        
        fat_count = len(unique_fat_ids)
        if fat_count <= 20:
            capacity = "48C"
        elif fat_count <= 30:
            capacity = "72C"
        elif fat_count <= 40:
            capacity = "96C"
        else:
            capacity = "96C"  # Default untuk lebih dari 40
        
        ws_template["N3"] = capacity
        
        # Set formula for N4
        ws_template["N4"] = f'=": "&COUNTA(G10:G{max_row_data})&" HP /Aerial"'
        
        # Delete unused rows
        last_template_row = ws_template.max_row
        if max_row_data < last_template_row:
            delete_start = max_row_data + 1
            delete_count = last_template_row - max_row_data
            ws_template.delete_rows(delete_start, delete_count)
        
        # Save final output
        output_buffer = io.BytesIO()
        wb_template.save(output_buffer)
        output_buffer.seek(0)
        
        # Generate final filename
        final_name = self._generate_final_filename(output_filename)
        
        return {
            "status": "success",
            "filename": final_name,
            "content": output_buffer.getvalue()
        }
    
    def _generate_final_filename(self, output_filename: str) -> str:
        """Generate final filename according to format."""
        excel_name = os.path.basename(output_filename)
        excel_base = os.path.splitext(excel_name)[0]
        
        excel_base = excel_base.replace("_with_pole", "")
        prefix = "APD_HPDB_"
        
        if excel_base.startswith(prefix):
            after_prefix = excel_base[len(prefix):]
        else:
            after_prefix = excel_base
        
        parts = after_prefix.split(" ", 1)
        lokasi_nama_final = parts[1].strip() if len(parts) > 1 else after_prefix.strip()
        
        return f"{prefix}{lokasi_nama_final}.xlsx"


def process_apd_hpdb(
    kml_content: bytes,
    filename: str,
    apd_template_content: bytes = None
) -> Dict[str, Any]:
    """
    Process APD HPDB from KML or KMZ file.
    
    Args:
        kml_content: Raw bytes of KML or KMZ file
        filename: Original filename
        apd_template_content: Optional APD template Excel bytes
    
    Returns:
        Dict with status, filename, and content bytes
    """
    is_kmz = filename.lower().endswith(".kmz")
    engine = APDEngine(apd_template_content=apd_template_content)
    engine.load_kml(kml_content, filename, is_kmz=is_kmz)
    return engine.process()