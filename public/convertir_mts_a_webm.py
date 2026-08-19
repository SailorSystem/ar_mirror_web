#!/usr/bin/env python3
"""
convertir_mts_a_webm.py — Convierte los videos MTS fuente del diccionario LSEC a WebM.

Genera webm para TODOS los gestos del diccionario (lib/lsec_gestos/*.json) usando
el campo "video" de cada entrada, que apunta al .MTS original (assets/LSEC2).
Estandariza nombres: key normalizado (mayúsculas, sin acentos, sin símbolos),
espacios → guion bajo. Finalmente escribe un manifiesto
(lib/lsec_gestos/videos_index.json) que mapea palabra normalizada → archivo webm,
incluyendo variantes _2 (alias sin fuente) y los gestos existentes fuera del dict.

Uso:
    python public/convertir_mts_a_webm.py [--dry-run]
"""

import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

GESTOS_DIR = Path("lib/lsec_gestos")
WEBM_DIR = Path("assets/LSEC/gestoswebm")
ASSETS_DIR = Path("assets")
MANIFEST = GESTOS_DIR / "videos_index.json"

# Parámetros ffmpeg (igual que los 27 webm actuales: VP9, 720p, sin audio)
FFMPEG_CMD = [
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", "{src}",
    "-c:v", "libvpx-vp9",
    "-crf", "34",
    "-b:v", "0",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease",
    "-an", "-deadline", "realtime", "-cpu-used", "5",
    "{dst}",
]


def normalize_key(name):  # réplica exacta de normalizeWord() en section-vozsenias.js
    s = unicodedata.normalize("NFD", name)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.upper()
    s = re.sub(r"[^A-ZÑ]", "", s)
    return s


def normalize_spaced_key(name):  # clave del manifiesto (conserva separación de palabras)
    s = unicodedata.normalize("NFD", name)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.upper()
    s = re.sub(r"[^A-ZÑ ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_filename(key):  # key → nombre de archivo (espacios → _)
    s = normalize_spaced_key(key)
    s = s.replace(" ", "_")
    return s or "GESTO"


def load_dictionary_entries():
    entries = {}  # key dict → meta
    for f in sorted(GESTOS_DIR.glob("diccionario_*.json")):
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        entries.update(data)
    return entries


def scan_existing_webm():
    existing = {}  # nombre exacto de archivo
    for f in WEBM_DIR.iterdir():
        if f.suffix.lower() == ".webm":
            existing[f.name] = True
    return existing


def find_source_by_stem(nk):
    nk_nospace = nk.replace(" ", "")
    for root, _dirs, files in os.walk(ASSETS_DIR / "LSEC2"):
        for fn in files:
            if fn.lower().endswith((".mts", ".mp4")) and \
               normalize_spaced_key(os.path.splitext(fn)[0]).replace(" ", "") == nk_nospace:
                return Path(root) / fn
    return None


def main():
    dry_run = "--dry-run" in sys.argv
    entries = load_dictionary_entries()
    existing = scan_existing_webm()  # archivo → True

    # Índice por key normalizado del stem del archivo (maneja acentos: MAMÁ.webm)
    existing_by_stem = {}
    for name in existing:
        nk = normalize_spaced_key(Path(name).stem)
        existing_by_stem.setdefault(nk, name)

    # ── Plan de archivos: norm_key → filename destino ──
    plan = {}       # norm_key -> filename
    from_base = {}  # "_2" keys -> filename de su base

    # Base del diccionario: 199 keys
    for key, meta in entries.items():
        nk = normalize_spaced_key(key)
        base = re.sub(r"\s*_\d+$", "", nk)
        is_variant = re.search(r"_\d+$", nk)

        if is_variant:
            from_base.setdefault(nk, base)
            continue

        # ¿Ya existe un webm (con o sin acentos)?
        if nk in existing_by_stem:
            plan[nk] = existing_by_stem[nk]
            continue

        dest = normalize_filename(nk)
        fname = f"{dest}.webm"
        if fname in existing:
            plan[nk] = fname
            continue

        plan[nk] = fname  # pendiente de convertir

    # Variantes _2 sin fuente → alias al archivo de su base
    for nk, base in from_base.items():
        if base in plan:
            plan[nk] = plan[base]
        elif base in existing_by_stem:
            plan[nk] = existing_by_stem[base]

    # Gestos existentes fuera del diccionario (ABURRIDO, PUCE, ...) se conservan
    for nk, name in existing_by_stem.items():
        if nk not in plan:
            plan[nk] = name

    # ── Lista de conversiones ──
    to_convert = []
    for nk, fname in plan.items():
        src = None
        entry = None
        for key, meta in entries.items():
            if normalize_spaced_key(key) == nk:
                entry = (key, meta)
                break
        if entry:
            _key, meta = entry
            vid = meta.get("video")
            if vid:
                cand = ASSETS_DIR / Path(vid)
                if cand.exists():
                    src = cand
        if src is None:
            src = find_source_by_stem(nk)
        if src is None:
            continue
        if not (WEBM_DIR / fname).exists():
            to_convert.append((nk, src, fname))

    print(f"  Gestos en diccionario: {len(entries)}")
    print(f"  Total en manifiesto:   {len(plan)}")
    print(f"  A convertir:           {len(to_convert)}")

    if dry_run:
        for nk, src, fname in to_convert[:8]:
            print(f"    + {nk}: {src} -> {fname}")
        return

    # ── Conversión ──
    WEBM_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    ok = 0
    for i, (nk, src, fname) in enumerate(to_convert, 1):
        dst = WEBM_DIR / fname
        if dst.exists():
            ok += 1
            continue
        cmd = [c.format(src=str(src), dst=str(dst)) for c in FFMPEG_CMD]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                ok += 1
            else:
                print(f"  [FAIL] {nk}: {r.stderr[-200:].strip()}")
        except Exception as e:
            print(f"  [ERROR] {nk}: {e}")
        elapsed = time.time() - t0
        eta = avg = elapsed / i
        eta = avg * (len(to_convert) - i)
        print(f"  [{i}/{len(to_convert)}] {nk}: {fname} ({elapsed/60:.1f}m ETA {eta/60:.1f}m)", flush=True)

    print(f"  Conversión completada: {ok}/{len(to_convert)} en {time.time()-t0:.0f}s")

    # ── Manifiesto ──
    manifest = {}
    for nk, fname in sorted(plan.items()):
        if (WEBM_DIR / fname).exists():
            manifest[nk] = fname
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f"  Manifiesto: {MANIFEST} ({len(manifest)} palabras)")


if __name__ == "__main__":
    main()