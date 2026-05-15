import math
import tkinter as tk
from tkinter import filedialog, messagebox
from lxml import etree
from pathlib import Path

# =========================================================
# KONFIGURASI
# =========================================================
MAX_DISTANCE_METER = 1.0

TARGET_KEYWORDS = ["POLE", "HP"]

# =========================================================
# HAPUS NAMESPACE
# =========================================================
def clean(tag):

    if "}" in tag:
        return tag.split("}", 1)[1]

    return tag


# =========================================================
# HAVERSINE
# =========================================================
def haversine(lat1, lon1, lat2, lon2):

    R = 6371000

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(dlambda / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


# =========================================================
# PARSE KML
# =========================================================
def parse_kml(kml_path):

    parser = etree.XMLParser(recover=True)

    tree = etree.parse(str(kml_path), parser)

    root = tree.getroot()

    results = []

    # =====================================================
    # LOOP FOLDER
    # =====================================================
    for folder in root.iter():

        if clean(folder.tag) != "Folder":
            continue

        # =================================================
        # NAMA FOLDER
        # =================================================
        folder_name = ""

        for child in folder:

            if clean(child.tag) == "name":

                if child.text:
                    folder_name = child.text.strip()

                break

        if not folder_name:
            continue

        # =================================================
        # FILTER POLE / HP
        # =================================================
        upper = folder_name.upper()

        if not any(k in upper for k in TARGET_KEYWORDS):
            continue

        print(f"\nFOLDER -> {folder_name}")

        # =================================================
        # HANYA PLACEMARK LANGSUNG
        # =================================================
        for child in folder:

            if clean(child.tag) != "Placemark":
                continue

            try:

                placemark_name = ""
                lat = None
                lon = None

                # =========================================
                # AMBIL DATA
                # =========================================
                for item in child.iter():

                    tag = clean(item.tag)

                    # =====================================
                    # NAME
                    # =====================================
                    if tag == "name":

                        if item.text and not placemark_name:
                            placemark_name = item.text.strip()

                    # =====================================
                    # COORD
                    # =====================================
                    elif tag == "coordinates":

                        if item.text:

                            coord = item.text.strip()

                            lon, lat, *_ = coord.split(",")

                            lon = float(lon)
                            lat = float(lat)

                # =========================================
                # VALID
                # =========================================
                if (
                    placemark_name
                    and lat is not None
                    and lon is not None
                ):

                    results.append({
                        "name": placemark_name,
                        "lat": lat,
                        "lon": lon,
                        "folder": folder_name,
                        "file": Path(kml_path).name
                    })

                    print(f"  FOUND -> {placemark_name}")

            except:
                continue

    return results


# =========================================================
# DUPLIKAT
# =========================================================
def check_duplicates(data):

    duplicates = []

    total = len(data)

    print(f"\nTOTAL POINT: {total}")

    for i in range(total):

        for j in range(i + 1, total):

            a = data[i]
            b = data[j]

            distance = haversine(
                a["lat"],
                a["lon"],
                b["lat"],
                b["lon"]
            )

            if distance <= MAX_DISTANCE_METER:

                duplicates.append({
                    "name1": a["name"],
                    "name2": b["name"],
                    "distance": round(distance, 3),
                    "folder": a["folder"]
                })

                print(
                    f"DUPLIKAT -> "
                    f"{a['name']} <-> {b['name']} "
                    f"({round(distance,3)} m)"
                )

    return duplicates


# =========================================================
# MAIN
# =========================================================
def main():

    root = tk.Tk()
    root.withdraw()

    kml_files = filedialog.askopenfilenames(
        title="Pilih File KML",
        filetypes=[("KML Files", "*.kml")]
    )

    if not kml_files:
        return

    output_txt = filedialog.asksaveasfilename(
        title="Simpan Hasil",
        defaultextension=".txt",
        filetypes=[("Text File", "*.txt")]
    )

    if not output_txt:
        return

    all_points = []

    # =====================================================
    # LOAD KML
    # =====================================================
    for file in kml_files:

        print(f"\nPROCESSING: {Path(file).name}")

        try:

            data = parse_kml(file)

            all_points.extend(data)

            print(f"TOTAL MATCH: {len(data)}")

        except Exception as e:

            print(f"ERROR: {e}")

    # =====================================================
    # CEK DUPLIKAT
    # =====================================================
    duplicates = check_duplicates(all_points)

    # =====================================================
    # SAVE TXT
    # =====================================================
    with open(output_txt, "w", encoding="utf-8") as f:

        f.write("HASIL DUPLIKAT\n")
        f.write("=" * 70 + "\n\n")

        if not duplicates:

            f.write("TIDAK ADA DUPLIKAT\n")

        else:

            for i, d in enumerate(duplicates, start=1):

                f.write(f"{i}. DUPLIKAT\n")

                f.write(f"Folder : {d['folder']}\n")

                f.write(f"{d['name1']}\n")
                f.write(f"{d['name2']}\n")

                f.write(
                    f"Jarak : {d['distance']} meter\n"
                )

                f.write("-" * 70 + "\n")

    print("\nSELESAI")

    messagebox.showinfo(
        "SELESAI",
        f"Total duplikat: {len(duplicates)}"
    )


# =========================================================
# RUN
# =========================================================
if __name__ == "__main__":
    main()