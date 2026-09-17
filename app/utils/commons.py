"""
Utility functions for KML processing
"""
import math
import re
import zipfile
import io
import html.entities
from typing import Tuple, Optional, Dict, Any, List
# defusedxml menolak deklarasi entitas XML, sehingga file KML kecil
# berisi 'billion laughs' tidak bisa lagi menghabiskan RAM instance.
# minidom & xml.etree bawaan Python rentan terhadap serangan ini.
from xml.dom import minidom
from defusedxml.minidom import parseString as safe_parse_string
from lxml import etree


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates using Haversine formula."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_localname(elem) -> Optional[str]:
    """Safely get the local name of an XML element."""
    try:
        if hasattr(elem, 'tag'):
            if isinstance(elem.tag, str):
                if "}" in elem.tag:
                    return elem.tag.split("}", 1)[1]
                return elem.tag
    except Exception:
        pass
    return None


def clean_xml_prefixes(xml_text: str) -> str:
    """Remove namespace prefixes from XML content.

    Catatan: regex ini hanya menyentuh TAG. Atribut berprefix seperti
    kml:id="..." tidak tersentuh, padahal atribut itu sendiri sudah cukup
    untuk memicu 'unbound prefix'. Karena itu ia dipakai BERSAMA
    repair_unbound_prefixes(), bukan sebagai gantinya.
    """
    return re.sub(r"<(/?)([\w\-]+):", r"<\1", xml_text)


# Prefix yang lazim muncul di berkas KML dunia nyata. Google Earth Pro
# menulis <gx:CascadingStyle kml:id="..."> dan mendeklarasikan xmlns-nya di
# elemen akar — tetapi berkas yang sudah pernah disunting tangan, dipotong,
# atau dihasilkan ulang oleh perkakas lain kerap kehilangan deklarasi itu
# sementara isinya tetap memakai prefiksnya.
WELL_KNOWN_KML_NS = {
    "gx": "http://www.google.com/kml/ext/2.2",
    "kml": "http://www.opengis.net/kml/2.2",
    "atom": "http://www.w3.org/2005/Atom",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xal": "urn:oasis:names:tc:ciq:xsdschema:xAL:2.0",
}


def _find_root_tag_span(text: str) -> Optional[Tuple[int, int]]:
    """Posisi '<' dan '>' dari tag pembuka elemen akar.

    Melewati deklarasi XML, komentar, dan DOCTYPE. Pencarian '>' menghormati
    tanda kutip, supaya nilai atribut yang memuat '>' tidak memotong tag
    terlalu awal.
    """
    i, n = 0, len(text)
    while i < n:
        lt = text.find("<", i)
        if lt == -1:
            return None
        nxt = text[lt + 1:lt + 2]
        if nxt == "?":                      # <?xml ... ?>
            end = text.find("?>", lt)
            i = lt + 2 if end == -1 else end + 2
            continue
        if nxt == "!":                      # <!-- ... --> atau <!DOCTYPE ...>
            if text.startswith("<!--", lt):
                end = text.find("-->", lt)
                i = lt + 4 if end == -1 else end + 3
            else:
                end = text.find(">", lt)
                i = lt + 2 if end == -1 else end + 1
            continue
        j, quote = lt + 1, ""
        while j < n:
            ch = text[j]
            if quote:
                if ch == quote:
                    quote = ""
            elif ch in "\"'":
                quote = ch
            elif ch == ">":
                return lt, j
            j += 1
        return None
    return None


def repair_unbound_prefixes(xml_text: str) -> str:
    """Deklarasikan prefix namespace yang dipakai tapi tidak pernah diumumkan.

    Parser XML menolak SELURUH dokumen begitu menemukan satu prefix yang
    tidak dideklarasikan ('unbound prefix'), meskipun sisa berkasnya
    sempurna. Google Earth sendiri memaafkan hal ini, dan pengguna kami
    mengunggah berkas apa adanya dari lapangan — menolak seluruh pekerjaan
    karena satu deklarasi yang hilang bukan perilaku yang benar.

    Prefix yang dikenal dipetakan ke URI resminya sehingga isinya tetap
    bermakna. Prefix asing tetap dideklarasikan dengan URI penampung agar
    dokumennya bisa dibaca, bukan dibuang.

    Mengembalikan teks apa adanya kalau tidak ada yang perlu diperbaiki.
    """
    dipakai = set(re.findall(r"<\s*/?\s*([A-Za-z_][\w.\-]*):", xml_text))
    # Atribut berprefix — 'xmlns:' sengaja disaring keluar.
    dipakai |= {
        p for p in re.findall(r"\s([A-Za-z_][\w.\-]*):[\w.\-]+\s*=\s*[\"']", xml_text)
        if p != "xmlns"
    }

    dideklarasikan = set(re.findall(r"xmlns:([\w.\-]+)\s*=", xml_text))
    hilang = dipakai - dideklarasikan - {"xml", "xmlns"}
    if not hilang:
        return xml_text

    span = _find_root_tag_span(xml_text)
    if span is None:
        return xml_text
    _, gt = span

    # Tag kosong (<kml ... />) menaruh '/' tepat sebelum '>'.
    sisip = gt - 1 if gt > 0 and xml_text[gt - 1] == "/" else gt

    deklarasi = "".join(
        ' xmlns:{}="{}"'.format(p, WELL_KNOWN_KML_NS.get(p, "urn:x-unresolved:" + p))
        for p in sorted(hilang)
    )
    return xml_text[:sisip] + deklarasi + xml_text[sisip:]


# =====================================================================
# PEMUAT KML/KMZ TAHAN BANTING
# =====================================================================
# Berkas KML dari lapangan datang dalam keadaan yang beragam: diekspor
# ulang oleh bermacam perkakas, disunting tangan, dikemas ulang, atau
# sekadar salah ekstensi. Parser XML menolak SELURUH dokumen begitu
# menemukan satu cacat, sehingga satu karakter '&' telanjang di kolom
# deskripsi sudah cukup membatalkan pekerjaan sehari.
#
# Google Earth memaafkan hampir semuanya. Pemuat ini mengejar perilaku
# yang sama: perbaiki yang bisa diperbaiki, dan kalau benar-benar tidak
# bisa, sampaikan alasannya dalam bahasa manusia — bukan "unbound prefix:
# line 6, column 132".


class KmlLoadError(ValueError):
    """Berkas benar-benar tidak bisa dibaca; pesannya layak ditampilkan ke user."""


# Karakter yang dilarang XML 1.0 di luar tab/newline/carriage-return.
_KARAKTER_TERLARANG = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x84\x86-\x9f﷐-﷟￾￿]"
)

# Entitas yang sah menurut XML: lima bawaan + rujukan numerik.
_ENTITAS_SAH = re.compile(r"&(?:#[0-9]+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);")

# Potongan CDATA harus dilewati saat membenahi entitas: di dalamnya '&'
# memang harfiah, dan meng-escape-nya justru memunculkan "&amp;" di layar.
_POTONGAN_CDATA = re.compile(r"<!\[CDATA\[.*?\]\]>", re.DOTALL)


def _decode_kml_bytes(data: bytes) -> str:
    """Ubah bytes jadi teks tanpa pernah gagal, semirip mungkin dengan aslinya.

    Urutan percobaan: BOM -> encoding yang dideklarasikan di prolog XML ->
    UTF-8 -> CP1252 -> Latin-1. Latin-1 tidak pernah menolak byte apa pun,
    jadi ia jaring pengaman terakhir. Decoding lossy ('errors=ignore')
    sengaja dihindari selama masih ada kandidat yang utuh, karena ia
    membuang karakter diam-diam.
    """
    for bom, enc in (
        (b"\xef\xbb\xbf", "utf-8-sig"),
        (b"\xff\xfe\x00\x00", "utf-32-le"),
        (b"\x00\x00\xfe\xff", "utf-32-be"),
        (b"\xff\xfe", "utf-16-le"),
        (b"\xfe\xff", "utf-16-be"),
    ):
        if data.startswith(bom):
            try:
                return data.decode(enc)
            except UnicodeDecodeError:
                break

    kandidat = []
    m = re.match(rb"\s*<\?xml[^>]*encoding\s*=\s*[\"']([\w.\-]+)[\"']", data[:200])
    if m:
        kandidat.append(m.group(1).decode("ascii", errors="ignore"))
    kandidat += ["utf-8", "cp1252", "latin-1"]

    for enc in kandidat:
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue

    return data.decode("utf-8", errors="replace")


def _perbaiki_entitas(teks: str) -> str:
    """Escape '&' telanjang dan terjemahkan entitas HTML ke bentuk numerik.

    '&' telanjang adalah cacat KML paling sering dari perkakas lapangan —
    nama seperti "PLN & Telkom" ditulis apa adanya, dan XML menolaknya.
    Entitas HTML seperti &nbsp; juga tidak dikenal XML sehingga harus
    diubah ke rujukan numerik.
    """

    def ganti(m: "re.Match") -> str:
        potongan = m.group(0)
        if _ENTITAS_SAH.fullmatch(potongan):
            return potongan
        nama = m.group(1)
        if nama:
            kode = html.entities.name2codepoint.get(nama[:-1])
            if kode:
                return "&#%d;" % kode
        return "&amp;" + potongan[1:]

    return re.sub(r"&([A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#x[0-9A-Fa-f]+;)?", ganti, teks)


def _perbaiki_entitas_luar_cdata(teks: str) -> str:
    """Terapkan perbaikan entitas hanya di luar blok CDATA."""
    hasil, ujung = [], 0
    for m in _POTONGAN_CDATA.finditer(teks):
        hasil.append(_perbaiki_entitas(teks[ujung:m.start()]))
        hasil.append(m.group(0))
        ujung = m.end()
    hasil.append(_perbaiki_entitas(teks[ujung:]))
    return "".join(hasil)


def normalize_kml_text(raw_text: str) -> str:
    """Rapikan teks KML sampai layak diberikan ke parser XML mana pun.

    Urutannya disengaja:
      1. buang sampah sebelum '<' pertama (BOM ganda, spasi, header nyasar)
      2. buang karakter kontrol yang dilarang XML
      3. benahi entitas, kecuali di dalam CDATA
      4. deklarasikan prefix namespace yang yatim

    clean_xml_prefixes TIDAK dipanggil di sini: ia membuang prefix dari tag,
    yang merusak dokumen ber-namespace campuran. Mendeklarasikan prefiksnya
    lebih aman daripada menghapusnya.
    """
    mulai = raw_text.find("<")
    if mulai > 0:
        raw_text = raw_text[mulai:]

    raw_text = _KARAKTER_TERLARANG.sub("", raw_text)
    raw_text = _perbaiki_entitas_luar_cdata(raw_text)
    return repair_unbound_prefixes(raw_text)


def _pilih_kml_dalam_kmz(nama_berkas: List[str]) -> Optional[str]:
    """Pilih KML utama di dalam arsip KMZ.

    Spesifikasi KMZ menyebut berkas pertama bernama doc.kml sebagai entri
    utama, tetapi arsip dunia nyata sering memuat beberapa KML — lampiran,
    overlay, sisa kerja. Mengambil begitu saja elemen pertama daftar
    (perilaku lama) bisa memilih berkas yang salah, dan hasilnya kosong
    tanpa pesan error sama sekali.

    Urutan: doc.kml di akar -> nama .kml apa pun di akar -> yang paling
    dangkal -> abjad, supaya pilihannya stabil antar-jalan.
    """
    kandidat = [n for n in nama_berkas if n.lower().endswith(".kml")]
    if not kandidat:
        return None

    def kunci(n: str):
        jalur = n.replace("\\", "/")          # arsip buatan Windows
        dasar = jalur.rsplit("/", 1)[-1].lower()
        return (dasar != "doc.kml", jalur.count("/"), jalur.lower())

    return sorted(kandidat, key=kunci)[0]


def load_kml_text(content: bytes, is_kmz: Optional[bool] = None) -> str:
    """Ambil teks KML yang sudah dirapikan, dari berkas KML maupun KMZ.

    `is_kmz` hanya petunjuk. Yang menentukan adalah isi berkasnya: arsip ZIP
    selalu diawali 'PK\\x03\\x04'. Pemeriksaan ini membuat berkas KMZ yang
    terlanjur dinamai .kml (dan sebaliknya) tetap terbaca — kekeliruan yang
    sangat sering terjadi karena Google Earth menyimpan keduanya.
    """
    if not content:
        raise KmlLoadError("Berkas kosong.")

    if content[:4] in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"):
        try:
            with zipfile.ZipFile(io.BytesIO(content), "r") as arsip:
                nama = _pilih_kml_dalam_kmz(arsip.namelist())
                if nama is None:
                    raise KmlLoadError(
                        "Arsip KMZ tidak memuat berkas .kml di dalamnya."
                    )
                data = arsip.read(nama)
        except zipfile.BadZipFile:
            raise KmlLoadError(
                "Berkas tampak seperti KMZ tetapi arsipnya rusak atau terpotong."
            )
    else:
        data = content

    teks = normalize_kml_text(_decode_kml_bytes(data))

    if "<" not in teks:
        raise KmlLoadError(
            "Isi berkas bukan XML/KML. Pastikan yang diunggah benar-benar "
            "berkas KML atau KMZ dari Google Earth."
        )

    return teks


def load_kml_bytes(content: bytes, is_kmz: Optional[bool] = None) -> bytes:
    """Sama seperti load_kml_text(), tetapi mengembalikan UTF-8 bytes.

    Dipakai pemanggil yang menyerahkan bytes ke parser. Prolog XML ditulis
    ulang ke UTF-8 supaya tidak bertentangan dengan encoding sebenarnya —
    parser mempercayai prolog, dan prolog yang berbohong memicu galat yang
    menyesatkan.
    """
    teks = load_kml_text(content, is_kmz)
    teks = re.sub(
        r"^\s*<\?xml[^>]*\?>",
        '<?xml version="1.0" encoding="UTF-8"?>',
        teks,
        count=1,
    )
    return teks.encode("utf-8")


def parse_kml_content(content: bytes, is_kmz: bool = False) -> minidom.Document:
    """Parse KML content from bytes."""
    return safe_parse_string(load_kml_text(content, is_kmz))


def parse_kml_lxml(content: bytes, is_kmz: bool = False) -> etree.ElementTree:
    """Parse KML content using lxml."""
    parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    return etree.parse(io.BytesIO(load_kml_bytes(content, is_kmz)), parser)


def get_folder_name(folder) -> str:
    """Extract name from a KML Folder element."""
    names = folder.getElementsByTagName("name")
    if names and names[0].firstChild:
        return names[0].firstChild.nodeValue.strip()
    return ""


def parse_coords(text: str) -> List[Tuple[float, float]]:
    """Parse coordinate string into list of (lat, lon) tuples."""
    coords = []
    for line in text.strip().split():
        parts = [p for p in line.split(",") if p]
        if len(parts) >= 2:
            try:
                lon, lat = map(float, parts[:2])
                coords.append((lat, lon))
            except ValueError:
                continue
    return coords


def clean_project_name(filename: str) -> str:
    """Clean project name from filename."""
    filename = re.sub(r"\.(kml|kmz)$", "", filename, flags=re.IGNORECASE)
    filename = re.sub(r"^[A-Z]{2,}\d+\s*", "", filename, flags=re.IGNORECASE)
    return filename.strip()


def find_all_folders(node) -> List:
    """Recursively find all Folder elements in a DOM node."""
    folders = []
    if hasattr(node, "tagName") and node.tagName == "Folder":
        folders.append(node)
    for child in getattr(node, "childNodes", []):
        if getattr(child, "nodeType", None) == getattr(child, "ELEMENT_NODE", 1):
            folders.extend(find_all_folders(child))
    return folders