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


def lonlat_to_xy(lon: float, lat: float, lat0: float) -> Tuple[float, float]:
    """Proyeksi ekuirektangular lokal (meter) — cukup akurat untuk skala cluster."""
    return lon * 111320.0 * math.cos(math.radians(lat0)), lat * 110540.0


def polyline_projection(
    point: Tuple[float, float], coords: List[Tuple[float, float]]
) -> Optional[Tuple[float, float]]:
    """Proyeksikan titik (lon, lat) ke polyline [(lon, lat), ...].

    Mengembalikan (jarak sepanjang garis dari titik awal, jarak tegak lurus),
    keduanya dalam meter, atau None kalau garisnya kurang dari dua titik.
    """
    if not coords or len(coords) < 2:
        return None
    lat0 = point[1]
    px, py = lonlat_to_xy(point[0], point[1], lat0)
    xy = [lonlat_to_xy(lon, lat, lat0) for lon, lat in coords]
    best_perp, best_along, acc = float("inf"), 0.0, 0.0
    for (x1, y1), (x2, y2) in zip(xy, xy[1:]):
        dx, dy = x2 - x1, y2 - y1
        seg = math.hypot(dx, dy)
        t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (seg * seg)))
        d = math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
        if d < best_perp:
            best_perp, best_along = d, acc + t * seg
        acc += seg
    return best_along, best_perp


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


# Batas isi arsip KMZ. Upload dibatasi 50 MB, tetapi itu ukuran TERKOMPRESI:
# KMZ buatan yang mengembang ribuan kali lipat (zip bomb) dulu dibaca apa
# adanya ke memori. KML asli jarang terkompresi lebih dari ~30x.
MAX_KMZ_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
MAX_KMZ_RATIO = 200


def _check_zip_size(arsip: zipfile.ZipFile, compressed_len: int) -> None:
    total = sum(i.file_size for i in arsip.infolist())
    if total > MAX_KMZ_UNCOMPRESSED_BYTES:
        raise KmlLoadError(
            "Isi arsip KMZ terlalu besar setelah diekstrak "
            f"({total / (1024 * 1024):.0f} MB)."
        )
    if compressed_len > 0 and total / compressed_len > MAX_KMZ_RATIO:
        raise KmlLoadError(
            "Arsip KMZ ditolak: rasio kompresinya tidak wajar (kemungkinan zip bomb)."
        )


def is_zip_bytes(content: bytes) -> bool:
    return content[:4] in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")


def read_kmz_attachments(content: bytes) -> Dict[str, bytes]:
    """Ambil lampiran KMZ (ikon, overlay) selain KML utama, dengan batas ukuran.

    Dipakai tool yang mengemas ulang hasilnya sebagai KMZ. KML tambahan di
    dalam arsip ikut dipertahankan; hanya KML utama yang diganti hasil proses.
    """
    if not content or not is_zip_bytes(content):
        return {}
    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as arsip:
            _check_zip_size(arsip, len(content))
            utama = _pilih_kml_dalam_kmz(arsip.namelist())
            return {
                n: arsip.read(n)
                for n in arsip.namelist()
                if n != utama and not n.endswith("/")
            }
    except zipfile.BadZipFile:
        return {}


def strip_doctype(teks: str) -> str:
    """Buang deklarasi <!DOCTYPE ...>, termasuk internal subset-nya.

    KML tidak pernah butuh DTD. Yang memakainya hanya serangan XML — entitas
    eksternal (membaca file server) dan 'billion laughs'. Tidak semua engine
    memakai defusedxml, jadi pembersihan dilakukan sekali di pemuat bersama.
    """
    return re.sub(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", "", teks, count=1,
                  flags=re.DOTALL | re.IGNORECASE)


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
    raw_text = strip_doctype(raw_text)
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

    if is_zip_bytes(content):
        try:
            with zipfile.ZipFile(io.BytesIO(content), "r") as arsip:
                _check_zip_size(arsip, len(content))
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
    """Nama sebuah Folder/Placemark — hanya dari anak <name> langsung.

    getElementsByTagName("name") mencari ke seluruh keturunan, jadi folder
    tanpa <name> sendiri dulu 'meminjam' nama Placemark pertama di dalamnya.
    """
    for child in getattr(folder, "childNodes", []):
        if getattr(child, "nodeType", None) == 1 and child.nodeName == "name":
            return "".join(
                n.nodeValue for n in child.childNodes
                if n.nodeType in (n.TEXT_NODE, n.CDATA_SECTION_NODE)
            ).strip()
    return ""


_FDT_NUM_RE = re.compile(r"\bFDT[\s._\-]*0*(\d+)", re.IGNORECASE)


def fdt_number(text: str) -> Optional[int]:
    """Nomor FDT dari teks bebas: 'FDT 01', 'FDT-2', 'MR.ABC.FDT03' -> 1, 2, 3."""
    m = _FDT_NUM_RE.search(text or "")
    return int(m.group(1)) if m else None


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