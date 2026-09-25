"""
Engine for processing KML/KMZ files and generating BOQ Excel
"""
import io
import os
import re
from typing import Dict, List, Any, Optional
from geopy.distance import geodesic
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.workbook.workbook import Workbook
from xml.dom import minidom
from collections import defaultdict

from utils.commons import (
    parse_kml_content, find_all_folders, get_folder_name,
    parse_coords, clean_project_name, fdt_number
)
from utils.report import ProcessReport
from utils.template_validator import validate_boq_template

# Susunan template BOQ: satu kolom per FDT. Template standar hanya punya tiga
# kolom FDT; FDT di luar itu tidak punya tempat dan dilaporkan sebagai
# peringatan, bukan dibuang diam-diam.
FDT_COLUMNS = {1: "C", 2: "I", 3: "O"}
LINE_ROW_OFFSET = {"A": 0, "B": 1, "C": 2, "D": 3}
CABLE_ROW_OFFSET = {24: 0, 36: 4, 48: 8}
FAT_ROWS = {"A": 36, "B": 37, "C": 38, "D": 39}
POLE_ROWS = {
    "new pole 7-4": 54,
    "new pole 7-3": 55,
    "new pole 7-2.5": 56,
    "new pole 9-4": 58,
    "existing pole emr 7-4": 61,
}

_LINE_RE = re.compile(r"\bLINE[\s\-_]*([A-Z])\b", re.IGNORECASE)
_CORE_RE = re.compile(r"\b(\d{2,3})\s*C(?:ORE)?\b", re.IGNORECASE)


def get_fdt_number_from_ancestors(node: minidom.Element) -> Optional[int]:
    """Nomor FDT dari folder leluhur terdekat yang menyebut FDT, atau None."""
    curr = node
    while curr is not None:
        if curr.nodeType == minidom.Node.ELEMENT_NODE and curr.nodeName == "Folder":
            num = fdt_number(get_folder_name(curr))
            if num is not None:
                return num
        curr = curr.parentNode
    return None


def get_fdt_name_from_ancestors(node: minidom.Element) -> str:
    """Kompatibilitas lama: 'FDT 01' dari folder leluhur, default FDT 01."""
    return f"FDT {(get_fdt_number_from_ancestors(node) or 1):02d}"


class KMLEngine:
    """Engine to process KML/KMZ files and generate BOQ Excel."""

    def __init__(self, template_content: bytes = None):
        if template_content:
            validate_boq_template(template_content)
            self.template_content = template_content
        else:
            base_dir = Path(__file__).resolve().parent.parent
            default_template = base_dir / "templates" / "default_boq.xlsx"

            if default_template.exists():
                with open(default_template, "rb") as f:
                    self.template_content = f.read()
            else:
                self.template_content = None

        self.doc = None
        self.wb = None
        self.sheet_ae = None
        self.sheet_bo = None
        self.input_filename = ""
        self.report = ProcessReport()
        # Nilai dijumlah dalam float dan baru dibulatkan saat ditulis.
        # Dulu setiap penambahan langsung dibulatkan, sehingga selisih
        # pembulatan per segmen kabel menumpuk.
        self._totals: Dict[str, float] = defaultdict(float)
        self._unsupported_fdt: Dict[int, int] = defaultdict(int)

    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict[str, Any]:
        """Load KML/KMZ content."""
        self.input_filename = filename
        self.doc = parse_kml_content(content, is_kmz)
        return {"status": "success", "filename": filename}

    def load_template(self, template_content: bytes) -> Dict[str, Any]:
        """Load Excel template from bytes."""
        validate_boq_template(template_content)
        self.template_content = template_content
        return {"status": "success"}

    def _init_workbook(self) -> None:
        """Initialize workbook from template."""
        if self.template_content:
            self.wb = load_workbook(io.BytesIO(self.template_content))
        else:
            self.wb = Workbook()

        self.sheet_ae = self.wb["BoM AE"] if "BoM AE" in self.wb.sheetnames else self.wb.active
        self.sheet_bo = self.wb["BoQ NRO Cluster"] if "BoQ NRO Cluster" in self.wb.sheetnames else self.wb.active

    def _calculate_length_from_placemark(self, placemark: minidom.Element) -> float:
        """Calculate length from a LineString placemark."""
        coords_tags = placemark.getElementsByTagName("coordinates")
        if coords_tags and coords_tags[0].firstChild:
            coord_list = parse_coords(coords_tags[0].firstChild.nodeValue)
            return sum(
                geodesic(coord_list[i], coord_list[i+1]).meters
                for i in range(len(coord_list)-1)
            )
        return 0

    def _column_for(self, node) -> Optional[str]:
        """Kolom Excel untuk FDT leluhur `node`, atau None kalau di luar template."""
        num = get_fdt_number_from_ancestors(node) or 1
        col = FDT_COLUMNS.get(num)
        if col is None:
            self._unsupported_fdt[num] += 1
        return col

    def _add(self, cell: str, value: float) -> None:
        self._totals[cell] += value

    def _flush_totals(self) -> None:
        for cell, value in self._totals.items():
            current = self.sheet_ae[cell].value
            try:
                base = float(current) if current not in (None, "") else 0.0
            except (TypeError, ValueError):
                base = 0.0
            self.sheet_ae[cell] = round(base + value)

    def process(self) -> Dict[str, Any]:
        """Process the KML and generate Excel output."""
        if not self.doc:
            return {"status": "error", "message": "No KML loaded"}

        self._init_workbook()
        all_folders = find_all_folders(self.doc.documentElement)

        # Setiap FDT menulis HANYA ke kolomnya sendiri. Satu FDT tidak lagi
        # disalin ke kolom FDT 02/03.
        self._process_cables(all_folders)
        self._process_fat_per_line()
        self._process_pole_counts(all_folders)
        self._process_hp_cover(all_folders)
        self._flush_totals()

        if self._unsupported_fdt:
            self.report.warn(
                "Template BOQ hanya punya kolom FDT 01–03; elemen milik FDT berikut "
                "TIDAK masuk hitungan",
                [f"FDT {n:02d} ({c} elemen)" for n, c in sorted(self._unsupported_fdt.items())],
            )

        output_buffer = io.BytesIO()
        self.wb.save(output_buffer)
        output_buffer.seek(0)

        output_filename = f"Hasil_{os.path.splitext(self.input_filename)[0]}.xlsx"

        return {
            "status": "success",
            "filename": output_filename,
            "content": output_buffer.getvalue(),
            "report": self.report.to_dict(),
        }

    def _process_cables(self, all_folders: List) -> None:
        """Kabel distribusi (per line & kapasitas) dan sling wire per FDT."""
        processed = set()
        unmatched_cable: List[str] = []
        sling_len: Dict[str, float] = defaultdict(float)
        cable_total = 0.0

        for sub in all_folders:
            fname = get_folder_name(sub).lower()
            is_sling = "sling" in fname
            is_dist = "distribution" in fname and not is_sling
            if not (is_sling or is_dist):
                continue

            for pm in sub.getElementsByTagName("Placemark"):
                if id(pm) in processed:
                    continue
                processed.add(id(pm))
                length = self._calculate_length_from_placemark(pm)
                if length <= 0:
                    continue
                col = self._column_for(pm)
                if col is None:
                    continue

                if is_sling:
                    sling_len[col] += length
                    continue

                name = get_folder_name(pm)
                line_m = _LINE_RE.search(name)
                core_m = _CORE_RE.search(name)
                line = line_m.group(1).upper() if line_m else None
                cores = int(core_m.group(1)) if core_m else None
                if line not in LINE_ROW_OFFSET or cores not in CABLE_ROW_OFFSET:
                    unmatched_cable.append(f"{name or '(tanpa nama)'} {length:.0f} m")
                    continue
                self._add(f"{col}{2 + LINE_ROW_OFFSET[line] + CABLE_ROW_OFFSET[cores]}", length)
                cable_total += length

        for col, total in sling_len.items():
            self.sheet_ae[f"{col}15"] = round(total)

        self.report.stat("kabel_distribusi_m", round(cable_total))
        self.report.stat("sling_wire_m", round(sum(sling_len.values())))
        if unmatched_cable:
            self.report.warn(
                "Kabel distribusi yang tidak masuk BOQ karena nama tidak memuat "
                "LINE A–D dan kapasitas 24C/36C/48C",
                unmatched_cable,
            )

    def _process_fat_per_line(self) -> None:
        """Hitung FAT per Line, tulis ke kolom FDT yang bersangkutan saja."""
        total = 0
        for line_folder in self.doc.getElementsByTagName("Folder"):
            m = _LINE_RE.search(get_folder_name(line_folder))
            if not m:
                continue
            letter = m.group(1).upper()

            fat_count = None
            for sub in line_folder.getElementsByTagName("Folder"):
                if get_folder_name(sub).strip().upper() == "FAT":
                    fat_count = len(sub.getElementsByTagName("Placemark"))
                    break
            if fat_count is None:
                continue
            if letter not in FAT_ROWS:
                self.report.warn(f"FAT di LINE {letter} tidak punya baris di template BOQ ({fat_count} FAT)")
                continue
            col = self._column_for(line_folder)
            if col:
                self.sheet_ae[f"{col}{FAT_ROWS[letter]}"] = fat_count
                total += fat_count
        self.report.stat("fat", total)

    def _process_pole_counts(self, all_folders: List) -> None:
        """Hitung tiang, tulis ke kolom FDT yang bersangkutan saja."""
        processed = set()
        totals: Dict[tuple, int] = defaultdict(int)
        unknown: Dict[str, int] = defaultdict(int)

        for folder in all_folders:
            name = get_folder_name(folder).strip().lower()
            is_pole = "pole" in name or "tiang" in name
            if not is_pole:
                continue
            row = POLE_ROWS.get(re.sub(r"\s+", " ", name))
            direct = [c for c in folder.childNodes
                      if getattr(c, "nodeName", None) == "Placemark"]
            if row is None:
                if direct:
                    unknown[get_folder_name(folder)] += len(direct)
                continue
            for pm in folder.getElementsByTagName("Placemark"):
                if id(pm) in processed:
                    continue
                processed.add(id(pm))
                col = self._column_for(pm)
                if col:
                    totals[(col, row)] += 1

        for (col, row), count in totals.items():
            self.sheet_ae[f"{col}{row}"] = count
        self.report.stat("tiang", sum(totals.values()))
        if unknown:
            self.report.warn(
                "Folder tiang yang tidak dikenali template BOQ (tidak dihitung)",
                [f"{n} ({c})" for n, c in unknown.items()],
            )

    def _process_hp_cover(self, all_folders: List) -> None:
        """Process HP Cover count."""
        processed = set()
        for folder in all_folders:
            if "hp cover" in get_folder_name(folder).lower():
                for pm in folder.getElementsByTagName("Placemark"):
                    processed.add(id(pm))

        self.sheet_bo["O5"] = len(processed)
        self.sheet_bo["O3"] = clean_project_name(self.input_filename)
        self.report.stat("hp_cover", len(processed))


def process_kml_to_excel(
    kml_content: bytes,
    filename: str,
    template_content: bytes = None,
    is_kmz: bool = False
) -> Dict[str, Any]:
    """
    Process KML/KMZ file and generate BOQ Excel.

    Returns:
        Dict with status, filename, content bytes and report
    """
    engine = KMLEngine(template_content)
    engine.load_kml(kml_content, filename, is_kmz)
    return engine.process()
