#!/usr/bin/env python3
"""
extract_lsec2.py — Extrae LSEC_Videos_LSEC.zip en assets/LSEC2/ con barra de progreso.

Solo extrae los videos/modulos estructurados (01-12) para el generador de landmarks.
Los videos de VIDEOS/lsec/ se ignoran (reservados para ML futuro).

Uso:
    python public/extract_lsec2.py
"""

import zipfile
import os
import shutil
import time
from pathlib import Path

ZIP_PATH = Path("assets/LSEC_Videos_LSEC.zip")
OUTPUT_DIR = Path("assets/LSEC2")

def format_bytes(b):
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.2f} TB"

def main():
    if not ZIP_PATH.exists():
        print(f"ERROR: No se encuentra {ZIP_PATH}")
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    zf = zipfile.ZipFile(str(ZIP_PATH), "r")
    members = zf.infolist()

    # Filtrar: excluir VIDEOS/lsec/ (reservado para ML futuro)
    filtered = [m for m in members if not m.filename.startswith("VIDEOS/")]
    total = len(filtered)
    total_bytes = sum(m.file_size for m in filtered)

    print(f"  Archivo:      {ZIP_PATH.name}")
    print(f"  Tamaño zip:   {format_bytes(os.path.getsize(ZIP_PATH))}")
    print(f"  Extraer:      {total} archivos ({format_bytes(total_bytes)})")
    print(f"  Destino:      {OUTPUT_DIR}/")
    print()

    extracted_bytes = 0
    t0 = time.time()
    bar_width = 40

    for idx, member in enumerate(filtered, 1):
        path = OUTPUT_DIR / member.filename
        if member.is_dir():
            path.mkdir(parents=True, exist_ok=True)
            continue

        path.parent.mkdir(parents=True, exist_ok=True)
        zf.extract(member, str(OUTPUT_DIR))
        extracted_bytes += member.file_size

        # ── Progress bar ──
        pct = extracted_bytes / total_bytes * 100
        filled = int(bar_width * extracted_bytes / total_bytes)
        bar = "█" * filled + "░" * (bar_width - filled)
        elapsed = time.time() - t0
        speed = extracted_bytes / elapsed if elapsed > 0 else 0
        eta = (total_bytes - extracted_bytes) / speed if speed > 0 else 0
        print(
            f"\r  [{bar}] {pct:5.1f}%  "
            f"{format_bytes(extracted_bytes)}/{format_bytes(total_bytes)}  "
            f"{format_bytes(speed)}/s  ETA:{eta:5.0f}s  "
            f"({idx}/{total} archivos)  ",
            end="", flush=True,
        )

    zf.close()
    t = time.time() - t0
    print(f"\n\n  Hecho en {t:.0f}s ({format_bytes(total_bytes / t)}/s)")

    # ── Compactar disco ──
    print("\n  Compactando archivos de zona...")
    for zf in OUTPUT_DIR.rglob("*:Zone.Identifier"):
        zf.unlink(missing_ok=True)
    for zf in OUTPUT_DIR.rglob("__MACOSX"):
        if zf.is_dir():
            shutil.rmtree(zf, ignore_errors=True)

    # Eliminar el .docx y .pptx si ya existían (los del zip son iguales)
    print("  Limpiando archivos duplicados...")

    print(f"\n  ✓ Extracción completa en {OUTPUT_DIR}/")
    return 0

if __name__ == "__main__":
    exit(main())
