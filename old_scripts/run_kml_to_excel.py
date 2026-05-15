import os
import zipfile
import openpyxl
from xml.dom import minidom
from geopy.distance import geodesic
from tkinter import Tk, filedialog
import re

# --- PILIH FILE INPUT DENGAN DIALOG ---
root = Tk()
root.withdraw()

input_file = filedialog.askopenfilename(
    title="Pilih file KML/KMZ",
    filetypes=[("KML/KMZ files", "*.kml *.kmz"), ("All files", "*.*")]
)

if not input_file:
    raise FileNotFoundError("Tidak ada file yang dipilih!")

print(f"[INFO] File dipilih: {input_file}")

# --- HAPUS PREFIX XML ---
def remove_prefixes(xml_text: str) -> str:
    return re.sub(r"<(/?)([\w\-]+):", r"<\1", xml_text)

# --- BACA KML / KMZ ---
if input_file.lower().endswith(".kmz"):
    with zipfile.ZipFile(input_file, "r") as kmz:
        kml_name = [f for f in kmz.namelist() if f.endswith(".kml")][0]
        with kmz.open(kml_name) as kml_file:
            raw_text = kml_file.read().decode("utf-8", errors="ignore")
            cleaned_text = remove_prefixes(raw_text)
            doc = minidom.parseString(cleaned_text)
else:
    with open(input_file, "r", encoding="utf-8", errors="ignore") as f:
        raw_text = f.read()
    cleaned_text = remove_prefixes(raw_text)
    doc = minidom.parseString(cleaned_text)

# --- TEMPLATE EXCEL ---
excel_template = "BOQ_Template.xlsx"
if not os.path.exists(excel_template):
    raise FileNotFoundError(f"Template Excel '{excel_template}' tidak ditemukan!")

wb = openpyxl.load_workbook(excel_template)
sheet_ae = wb["BoM AE"]
sheet_bo = wb["BoQ NRO Cluster"]

# --- FUNGSI BANTU ---
def get_folder_name(folder):
    names = folder.getElementsByTagName("name")
    return names[0].firstChild.nodeValue.strip() if names and names[0].firstChild else ""

def clean_project_name(filepath):

    filename = os.path.basename(filepath)

    filename = os.path.splitext(filename)[0]

    filename = re.sub(
        r"^[A-Z]{2,}\d+\s*",
        "",
        filename,
        flags=re.IGNORECASE
    )

    return filename.strip()

def parse_coords(text):
    coords = []
    for line in text.strip().split():
        parts = [p for p in line.split(",") if p]
        if len(parts) >= 2:
            lon, lat = map(float, parts[:2])
            coords.append((lat, lon))
    return coords

def calculate_length_from_placemark(placemark):
    coords_tags = placemark.getElementsByTagName("coordinates")
    if coords_tags and coords_tags[0].firstChild:
        coord_list = parse_coords(coords_tags[0].firstChild.nodeValue)
        return sum(geodesic(coord_list[i], coord_list[i+1]).meters for i in range(len(coord_list)-1))
    return 0

def safe_add(sheet, cell, value):

    current = sheet[cell].value or 0

    total = current + value

    sheet[cell] = round(total)

def find_all_folders(node):
    folders = []
    if getattr(node, "tagName", None) == "Folder":
        folders.append(node)
    for child in getattr(node, "childNodes", []):
        if getattr(child, "nodeType", None) == child.ELEMENT_NODE:
            folders.extend(find_all_folders(child))
    return folders

# --- FAT ---
def is_true_fat_folder(name: str) -> bool:
    up = (name or "").upper()
    return "FAT" in up and "COVER" not in up

def count_fat_in_line(line_folder):
    """Hitung semua Placemark di folder FAT (rekursif, semua level)."""
    total = 0
    subfolders = find_all_folders(line_folder)
    for f in subfolders:
        if is_true_fat_folder(get_folder_name(f)):
            total += len(f.getElementsByTagName("Placemark"))
    return total

# --- CARI SEMUA FOLDER ---
all_folders = find_all_folders(doc.documentElement)

# --- FDT ---
fdt_columns = ["C", "I", "O"]
fdt_folders = [f for f in all_folders if "FDT" in get_folder_name(f).upper()]

for idx, fdt_folder in enumerate(fdt_folders[:3]):
    col = fdt_columns[idx]

    # 🔹 Distribution Cable
    for sub in all_folders:
        if "distribution" in get_folder_name(sub).lower():
            for pm in sub.getElementsByTagName("Placemark"):
                nm_nodes = pm.getElementsByTagName("name")
                pm_name = (nm_nodes[0].firstChild.nodeValue if nm_nodes and nm_nodes[0].firstChild else "").upper()
                length = calculate_length_from_placemark(pm)

                if "LINE A" in pm_name:
                    if "24C" in pm_name: safe_add(sheet_ae, f"{col}2", length)
                    elif "36C" in pm_name: safe_add(sheet_ae, f"{col}6", length)
                    elif "48C" in pm_name: safe_add(sheet_ae, f"{col}10", length)

                elif "LINE B" in pm_name:
                    if "24C" in pm_name: safe_add(sheet_ae, f"{col}3", length)
                    elif "36C" in pm_name: safe_add(sheet_ae, f"{col}7", length)
                    elif "48C" in pm_name: safe_add(sheet_ae, f"{col}11", length)

                elif "LINE C" in pm_name:
                    if "24C" in pm_name: safe_add(sheet_ae, f"{col}4", length)
                    elif "36C" in pm_name: safe_add(sheet_ae, f"{col}8", length)
                    elif "48C" in pm_name: safe_add(sheet_ae, f"{col}12", length)

                elif "LINE D" in pm_name:
                    if "24C" in pm_name: safe_add(sheet_ae, f"{col}5", length)
                    elif "36C" in pm_name: safe_add(sheet_ae, f"{col}9", length)
                    elif "48C" in pm_name: safe_add(sheet_ae, f"{col}13", length)

# 🔹 FAT per Line
for line_folder in doc.getElementsByTagName("Folder"):

    line_name = get_folder_name(line_folder).upper()

    # ======================================
    # HANYA LINE A-D
    # ======================================
    if line_name in ["LINE A", "LINE B", "LINE C", "LINE D"]:

        total_fat = 0

        # ==================================
        # CARI SUBFOLDER FAT
        # ==================================
        for sub_folder in line_folder.getElementsByTagName("Folder"):

            sub_name = get_folder_name(sub_folder).upper()

            # ==============================
            # FOLDER FAT
            # ==============================
            if sub_name == "FAT":

                placemarks = sub_folder.getElementsByTagName(
                    "Placemark"
                )

                total_fat = len(placemarks)

                break

        # ==================================
        # TULIS KE EXCEL
        # ==================================
        if line_name == "LINE A":
            sheet_ae[f"{col}36"] = total_fat

        elif line_name == "LINE B":
            sheet_ae[f"{col}37"] = total_fat

        elif line_name == "LINE C":
            sheet_ae[f"{col}38"] = total_fat

        elif line_name == "LINE D":
            sheet_ae[f"{col}39"] = total_fat

        print(
            f"[DEBUG] "
            f"{line_name} -> {total_fat} FAT"
        )

    # 🔹 Sling Wire
    total_sling_length = 0
    for sling_folder in all_folders:
        if "sling" in get_folder_name(sling_folder).lower():
            for pm in sling_folder.getElementsByTagName("Placemark"):
                total_sling_length += calculate_length_from_placemark(pm)

    sheet_ae[f"{col}15"] = round(total_sling_length)

# --- POLE COUNTS ---
target_counts = {
    "new pole 7-4": "C54",
    "new pole 7-2.5": "C56",
    "new pole 7-3": "C55",
    "new pole 9-4": "C58",
    "existing pole emr 7-4": "C61",
}
folder_totals = {key: 0 for key in target_counts}

for folder in all_folders:
    folder_name = get_folder_name(folder).strip().lower()
    for target_name in target_counts:
        if folder_name == target_name:
            folder_totals[target_name] += len(folder.getElementsByTagName("Placemark"))

for name, total in folder_totals.items():
    sheet_ae[target_counts[name]] = total

# --- HP COVER ---
hp_cover_total = 0
for folder in all_folders:
    if "hp cover" in get_folder_name(folder).lower():
        hp_cover_total += len(folder.getElementsByTagName("Placemark"))

sheet_bo["O5"] = hp_cover_total
sheet_bo["O3"] = clean_project_name(input_file)

# --- SIMPAN HASIL ---
output_path = f"Hasil_{os.path.splitext(os.path.basename(input_file))[0]}.xlsx"
wb.save(output_path)
print(f"Selesai! Hasil disimpan di: {output_path}")
