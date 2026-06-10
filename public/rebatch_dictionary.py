#!/usr/bin/env python3
"""
rebatch_dictionary.py — Reagrupa los JSONs de módulos en lotes numerados < 100 MB.

Lee los archivos {MODULO}.json de lib/lsec_gestos/, combina todas las entradas,
las divide en lotes de ~95 MB máximo, y escribe diccionario_01.json, etc.
"""

import json
import os
from pathlib import Path

GESTOS_DIR = Path("lib/lsec_gestos")
MAX_BATCH_SIZE = 95 * 1024 * 1024  # 95 MB

def main():
    module_files = sorted([
        f for f in GESTOS_DIR.iterdir()
        if f.suffix == ".json" and f.name != "index.json" and f.name.startswith("diccionario_")
    ])

    # If we already have diccionario_ files, skip
    if module_files:
        print("Ya existen archivos diccionario_XX.json. Saltando rebatch.")
        return

    module_files = sorted([
        f for f in GESTOS_DIR.iterdir()
        if f.suffix == ".json" and f.name != "index.json" and not f.name.startswith("diccionario_")
    ])

    if not module_files:
        print("No se encontraron archivos de módulo (ej. 03_SUSTANTIVOS.json)")
        return

    # Load all entries
    all_entries = {}
    for mf in module_files:
        with open(mf, "r", encoding="utf-8") as f:
            data = json.load(f)
        mod_name = mf.stem
        print(f"  {mf.name}: {len(data)} gestos")
        for key, entry in data.items():
            if key not in all_entries:
                all_entries[key] = entry

    total_gestos = len(all_entries)
    print(f"\nTotal: {total_gestos} gestos únicos")

    # Split into batches by estimated size
    entries = list(all_entries.items())
    batches = []
    current_batch = {}
    current_size = 0

    for key, entry in entries:
        entry_str = json.dumps({key: entry}, indent=2, ensure_ascii=False)
        entry_size = len(entry_str.encode("utf-8"))

        if current_size + entry_size > MAX_BATCH_SIZE and current_batch:
            batches.append(current_batch)
            current_batch = {}
            current_size = 0

        current_batch[key] = entry
        current_size += entry_size

    if current_batch:
        batches.append(current_batch)

    # Write batches
    batch_files = []
    print(f"\nEscribiendo lotes en {GESTOS_DIR}/:")
    for idx, batch in enumerate(batches, 1):
        fname = f"diccionario_{idx:02d}.json"
        path = GESTOS_DIR / fname
        with open(path, "w", encoding="utf-8") as f:
            json.dump(batch, f, indent=2, ensure_ascii=False)
        size_mb = path.stat().st_size / (1024 * 1024)
        batch_files.append(fname)
        print(f"  {fname}: {len(batch)} gestos ({size_mb:.1f} MB)")

    batch_stems = [Path(f).stem for f in batch_files]
    with open(GESTOS_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(batch_stems, f, indent=2)
    print(f"\nindex.json actualizado: {len(batch_stems)} lotes")

if __name__ == "__main__":
    main()
