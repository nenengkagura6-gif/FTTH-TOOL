"""
Laporan hasil proses yang dibawa setiap engine.

Sebelumnya engine memilih salah satu dari dua hal saat menemui data yang
tidak bisa diolah: menelan error-nya diam-diam, atau mencetak ke log server
yang tidak pernah dibaca pengguna. Akibatnya hasil yang tidak lengkap tetap
dilaporkan "sukses". ProcessReport mengumpulkan peringatan dan angka ringkas
supaya backend bisa menyimpannya ke baris job dan frontend menampilkannya.
"""
from typing import Any, Dict, List

# Batas supaya satu job dengan ribuan peringatan serupa tidak membengkakkan
# kolom JSON di database.
MAX_WARNINGS = 50
MAX_EXAMPLES = 8


class ProcessReport:
    def __init__(self) -> None:
        self.warnings: List[str] = []
        self.stats: Dict[str, Any] = {}
        self._dropped = 0

    def warn(self, message: str, examples: List[str] = None) -> None:
        """Tambah peringatan; `examples` diringkas jadi beberapa contoh saja."""
        if examples:
            contoh = ", ".join(str(e) for e in examples[:MAX_EXAMPLES])
            if len(examples) > MAX_EXAMPLES:
                contoh += f", … (+{len(examples) - MAX_EXAMPLES})"
            message = f"{message}: {contoh}"
        if len(self.warnings) < MAX_WARNINGS:
            self.warnings.append(message)
        else:
            self._dropped += 1

    def stat(self, key: str, value: Any) -> None:
        self.stats[key] = value

    def to_dict(self) -> Dict[str, Any]:
        warnings = list(self.warnings)
        if self._dropped:
            warnings.append(f"… dan {self._dropped} peringatan lain.")
        return {"warnings": warnings, "stats": self.stats}
