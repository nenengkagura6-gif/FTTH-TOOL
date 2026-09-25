"""
KML/KMZ Insert Coding Engine
=============================
Automatically renames FDT, FAT, CABLE, and NEW POLE elements and updates Boundary HP Cover counts.
Mendukung prefix untuk FDT berapa pun (FDT 01, 02, ..., n).

Setiap Placemark diproses TEPAT SEKALI, oleh folder berperan terdekat di
atasnya (FAT, CABLE, NEW POLE, FDT). Versi sebelumnya memakai
getElementsByTagName yang menjangkau seluruh keturunan, sehingga kabel di
dalam folder "FDT 01" diganti namanya dua kali ("PFX - PFX LINE A ...").
"""

import io
import re
import zipfile
from collections import defaultdict, OrderedDict
from typing import Dict, List, Tuple, Optional, Any
from xml.dom import minidom
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
from defusedxml.minidom import parseString as safe_parse_string
from utils.commons import load_kml_text, read_kmz_attachments, fdt_number
from utils.report import ProcessReport

ROLE_SKIP = "skip"
ROLE_FAT = "fat"
ROLE_CABLE = "cable"
ROLE_NEW_POLE = "new_pole"
ROLE_FDT = "fdt"
ROLE_NONE = "none"

_HP_DESC_RE = re.compile(r"^\s*\d+\s*HP\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _name_of(elem) -> str:
    """Get the text content of the first <name> child."""
    for child in elem.childNodes:
        if getattr(child, "tagName", None) == "name":
            text = []
            def get_text(node):
                if node.nodeType in (node.TEXT_NODE, node.CDATA_SECTION_NODE):
                    text.append(node.nodeValue)
                for c in getattr(node, "childNodes", []):
                    get_text(c)
            get_text(child)
            return "".join(text).strip()
    return ""


def _set_child_text(elem, tag: str, text: str, doc: minidom.Document, first: bool) -> None:
    nodes = [c for c in elem.childNodes if getattr(c, "tagName", None) == tag]
    if nodes:
        node = nodes[0]
        while node.firstChild:
            node.removeChild(node.firstChild)
        node.appendChild(doc.createTextNode(text))
        return
    el = doc.createElement(tag)
    el.appendChild(doc.createTextNode(text))
    if first:
        elem.insertBefore(el, elem.firstChild)
    else:
        elem.appendChild(el)


def _set_placemark_name(pm, new_name: str, doc: minidom.Document):
    """Set (or create) the <name> element of a Placemark."""
    _set_child_text(pm, "name", new_name, doc, first=True)


def _description_of(elem) -> str:
    for c in elem.childNodes:
        if getattr(c, "tagName", None) == "description":
            return "".join(n.nodeValue for n in c.childNodes
                           if n.nodeType in (n.TEXT_NODE, n.CDATA_SECTION_NODE))
    return ""


def _set_hp_count_description(elem, count: int, doc: minidom.Document):
    """Tulis 'N HP' ke description tanpa membuang catatan lain di dalamnya."""
    current = _description_of(elem)
    line = f"{count} HP"
    if not current.strip():
        new = line
    elif _HP_DESC_RE.match(current):
        new = _HP_DESC_RE.sub(line, current, count=1)
    else:
        new = f"{line}\n{current}"
    _set_child_text(elem, "description", new, doc, first=False)


def _folder_role(name: str) -> str:
    u = (name or "").upper()
    if "BOUNDARY CLUSTER" in u:
        return ROLE_SKIP
    if re.match(r"^\s*LINE\b", u) or "HP COVER" in u or "HP UNCOVER" in u:
        return ROLE_NONE
    if "BOUNDARY" in u:
        # 'BOUNDARY FAT' tetap dikodekan seperti versi lama (poligonnya
        # bernama kode FAT), tetapi dinomori terpisah dari titik FAT.
        return ROLE_FAT if re.search(r"\bFAT\b", u) else ROLE_NONE
    if re.search(r"\bFAT\b", u):
        return ROLE_FAT
    if "CABLE" in u or "DISTRIBUTION" in u or "KABEL" in u:
        return ROLE_CABLE
    if re.search(r"\bNEW\s*POLE\b", u):
        return ROLE_NEW_POLE
    if re.search(r"\bFDT\b", u):
        return ROLE_FDT
    return ""


def _owner_folder(pm) -> Tuple[Optional[Any], str]:
    """Folder berperan terdekat di atas placemark, beserta perannya."""
    cur = pm.parentNode
    while cur is not None and cur.nodeName != "Document":
        if cur.nodeName == "Folder":
            role = _folder_role(_name_of(cur))
            if role:
                return cur, role
        cur = cur.parentNode
    return None, ""


def _get_fdt_number(node) -> int:
    """Walk up parent nodes to find FDT number (e.g. FDT 01 -> 1). Default is 1."""
    curr = node
    while curr is not None and curr.nodeName != "Document":
        if curr.nodeName == "Folder":
            num = fdt_number(_name_of(curr))
            if num is not None:
                return num
        curr = curr.parentNode
    return 1


def _line_letter(node) -> Optional[str]:
    curr = node.parentNode if node is not None else None
    while curr is not None and curr.nodeName != "Document":
        if curr.nodeName == "Folder":
            m = re.search(r"LINE\s*([A-Z])\b", _name_of(curr).upper())
            if m:
                return m.group(1)
        curr = curr.parentNode
    return None


def _fat_number(name: str, prefix: str) -> Optional[int]:
    """Nomor FAT dari nama lama maupun nama yang sudah pernah dikodekan.

    'FAT A03' -> 3, 'a3' -> 3, 'JKT01.XYZ.A03' -> 3. Dulu pola '[A-Z](\\d+)'
    peka huruf besar dan mengambil kecocokan pertama, sehingga nama hasil
    coding (prefix berangka) terbaca dengan nomor yang salah saat diproses
    ulang.
    """
    text = name.strip()
    if prefix and text.upper().startswith(prefix.upper() + "."):
        text = text[len(prefix) + 1:]
    m = re.search(r"([A-Za-z])\s*0*(\d+)\s*$", text) or re.search(r"(\d+)\s*$", text)
    if not m:
        return None
    return int(m.group(m.lastindex))


# ---------------------------------------------------------------------------
# Engine Class
# ---------------------------------------------------------------------------

class InsertCodingEngine:
    def __init__(self):
        self.doc: Optional[minidom.Document] = None
        self.input_filename = ""
        self._is_kmz = False
        self._kmz_bytes: Optional[bytes] = None
        self.report = ProcessReport()
        self._missing_prefix = set()

    def load_kml(self, content: bytes, filename: str, is_kmz: bool = False) -> Dict[str, Any]:
        self.input_filename = filename
        self._is_kmz = is_kmz
        self._kmz_bytes = content

        raw = load_kml_text(content, is_kmz)
        # Hanya prefix 'kml:' yang dibuang; gx:* dibiarkan utuh.
        cleaned = re.sub(r"<(/?)kml:", r"<\1", raw)
        self.doc = safe_parse_string(cleaned.encode("utf-8"))
        return {"status": "success"}

    def _prefix(self, prefixes: Dict[int, str], fdt_num: int) -> str:
        if fdt_num in prefixes:
            return prefixes[fdt_num]
        self._missing_prefix.add(fdt_num)
        return prefixes.get(1) or next(iter(prefixes.values()), "DEFAULT")

    def process(self, prefixes: Dict[int, str]) -> Dict[str, Any]:
        if not self.doc:
            return {"status": "error", "message": "KML belum di-load"}

        prefixes = {int(k): v.strip() for k, v in (prefixes or {}).items() if v and v.strip()}
        if not prefixes:
            prefixes = {1: "DEFAULT"}

        doc = self.doc
        folders = doc.getElementsByTagName("Folder")

        # Step 1-2: BOUNDARY HP cover matching per LINE
        boundaries_updated = 0
        for line_folder in folders:
            if not re.match(r"LINE\s*[A-Z]\b", _name_of(line_folder).upper()):
                continue
            hp_cover_folder = boundary_folder = None
            for sub in line_folder.getElementsByTagName("Folder"):
                sub_name = _name_of(sub).upper()
                if "HP COVER" in sub_name and hp_cover_folder is None:
                    hp_cover_folder = sub
                elif "BOUNDARY" in sub_name and "CLUSTER" not in sub_name and boundary_folder is None:
                    boundary_folder = sub
            if not (boundary_folder and hp_cover_folder):
                continue
            hp_by_name = {}
            for h_sub in hp_cover_folder.getElementsByTagName("Folder"):
                hp_by_name.setdefault(_name_of(h_sub).upper(), h_sub)
            for b_sub in boundary_folder.getElementsByTagName("Folder"):
                b_name = _name_of(b_sub).upper()
                if "CLUSTER" in b_name or b_name not in hp_by_name:
                    continue
                total_hp = len(hp_by_name[b_name].getElementsByTagName("Placemark"))
                if total_hp > 0:
                    _set_hp_count_description(b_sub, total_hp, doc)
                    boundaries_updated += 1

        # Step 3: kelompokkan setiap placemark menurut folder berperan terdekat
        fat_groups: "OrderedDict[Tuple[int, str, bool], List]" = OrderedDict()
        pole_groups: Dict[int, List] = defaultdict(list)
        renamed = defaultdict(int)

        for pm in doc.getElementsByTagName("Placemark"):
            owner, role = _owner_folder(pm)
            if owner is None or role in (ROLE_SKIP, ROLE_NONE):
                continue
            fdt_num = _get_fdt_number(owner)
            orig_name = _name_of(pm)
            if role == ROLE_FDT:
                # Titik FDT: nomor di namanya sendiri ('FDT 2') lebih
                # menentukan daripada nomor folder induknya.
                fdt_num = fdt_number(orig_name) or fdt_num
            prefix = self._prefix(prefixes, fdt_num)

            if role == ROLE_FDT:
                num = fdt_num
                new_name = re.sub(r"FDT[\s._\-]*0*" + str(num) + r"\b", prefix.upper(),
                                  orig_name, flags=re.IGNORECASE)
                new_name = re.sub(r"\bFDT\b", prefix.upper(), new_name, flags=re.IGNORECASE)
                if new_name != orig_name:
                    _set_placemark_name(pm, new_name, doc)
                    renamed["fdt"] += 1
            elif role == ROLE_FAT:
                letter = _line_letter(owner) or "A"
                is_boundary = "BOUNDARY" in _name_of(owner).upper()
                fat_groups.setdefault((fdt_num, letter, is_boundary), []).append(pm)
            elif role == ROLE_CABLE:
                if not orig_name.startswith(f"{prefix} - "):
                    _set_placemark_name(pm, f"{prefix} - {orig_name}", doc)
                    renamed["kabel"] += 1
            elif role == ROLE_NEW_POLE:
                pole_groups[fdt_num].append(pm)

        # Step 4: FAT — dinomori per (FDT, LINE), lintas folder FAT, supaya
        # dua folder FAT di satu line tidak sama-sama mulai dari A01.
        fat_without_number = []
        for (fdt_num, letter, _is_boundary), pms in fat_groups.items():
            prefix = self._prefix(prefixes, fdt_num)
            keyed = []
            for order, pm in enumerate(pms):
                name = _name_of(pm)
                num = _fat_number(name, prefix)
                if num is None:
                    fat_without_number.append(name or "(tanpa nama)")
                keyed.append((num if num is not None else 10 ** 6, order, pm))
            keyed.sort(key=lambda x: (x[0], x[1]))
            for idx, (_, _, pm) in enumerate(keyed, 1):
                _set_placemark_name(pm, f"{prefix}.{letter}{idx:02d}", doc)
                renamed["fat"] += 1

        # Step 5: NEW POLE — dinomori ulang per FDT
        for fdt_num, pms in pole_groups.items():
            prefix = self._prefix(prefixes, fdt_num)
            prefix_short = prefix.rsplit(".", 1)[0]
            all_poles = []
            for order, pm in enumerate(pms):
                name = _name_of(pm)
                m = re.search(r"\.P(\d+)$", name) or re.search(r"(\d+)$", name)
                if m:
                    num = int(m.group(1))
                else:
                    digits = re.findall(r"\d+", name)
                    num = int(digits[-1]) if digits else None
                all_poles.append((num if num is not None else 10 ** 6, order, pm))
            all_poles.sort(key=lambda x: (x[0], x[1]))
            for idx, (_, _, pm) in enumerate(all_poles, 1):
                _set_placemark_name(pm, f"MR.{prefix_short}.P{idx:03d}", doc)
                renamed["new_pole"] += 1

        rep = self.report
        for key in ("fdt", "fat", "kabel", "new_pole"):
            rep.stat(key, renamed[key])
        rep.stat("boundary_hp", boundaries_updated)
        if self._missing_prefix:
            rep.warn("Tidak ada prefix untuk FDT berikut; memakai prefix FDT 01",
                     [f"FDT {n:02d}" for n in sorted(self._missing_prefix)])
        if fat_without_number:
            rep.warn("FAT tanpa nomor di namanya diletakkan di akhir urutan",
                     fat_without_number)

        output_bytes = self._build_kmz()
        base = self.input_filename.rsplit(".", 1)[0]

        return {
            "status": "success",
            "filename": f"{base}_renamed.kmz",
            "content": output_bytes,
            "content_type": "application/vnd.google-earth.kmz",
            "report": rep.to_dict(),
        }

    def _build_kmz(self) -> bytes:
        kml_str = self.doc.toxml(encoding="utf-8")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as kmz_out:
            kmz_out.writestr("doc.kml", kml_str)
            for item, data in read_kmz_attachments(self._kmz_bytes or b"").items():
                if item.lower() != "doc.kml":
                    kmz_out.writestr(item, data)
        return buf.getvalue()


def process_insert_coding(
    kml_content: bytes,
    filename: str,
    prefixes: Dict[int, str],
    is_kmz: bool = False,
) -> Dict[str, Any]:
    engine = InsertCodingEngine()
    load_result = engine.load_kml(kml_content, filename, is_kmz)
    if load_result.get("status") == "error":
        return load_result
    return engine.process(prefixes)
