#!/usr/bin/env python3
"""Leser lydbokmappene, lager public/books.json og (valgfritt) laster opp til R2 med rclone.

Bruk:
  python3 tools/build_books.py --root ~/Dokumenter            # tørrkjøring: skriver books.json, viser planen
  python3 tools/build_books.py --root ~/Dokumenter --upload   # laster også opp til R2

Opplasting krever rclone og miljøvariablene R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
Trygt å kjøre flere ganger: filer som allerede er lastet opp hoppes over.
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

BUCKET = "lydbok"
AUDIO = {".mp3": "audio/mpeg", ".m4b": "audio/mp4", ".m4a": "audio/mp4"}

# (slug, tittel, forfatter, mappe/fil relativt til --root)
# En mappe = bok med kapittelfiler. En enkeltfil = bok med én fil.
BOOKS = [
    ("hp1", None, "J.K. Rowling", "Harry Potter Audiobooks 1-7/HP1*.m4b"),
    ("hobbit", "The Hobbit", "J.R.R. Tolkien", "The Hobbit/"),
    ("hunger-games-1", "The Hunger Games", "Suzanne Collins", "The Hunger Games Trilogy + Prequel (Audiobook)/Book 1*/"),
    ("hunger-games-2", "Catching Fire", "Suzanne Collins", "The Hunger Games Trilogy + Prequel (Audiobook)/Book 2*/"),
    ("hunger-games-3", "Mockingjay", "Suzanne Collins", "The Hunger Games Trilogy + Prequel (Audiobook)/Book 3*/"),
    ("hunger-games-0", None, "Suzanne Collins", "The Hunger Games Trilogy + Prequel (Audiobook)/The Ballad*.m4b"),
]

def natural(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]

def safe(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def clean_title(stem):
    t = re.sub(r"^HP\d\s*-\s*", "", stem)       # "HP1 - Harry ..." -> "Harry ..."
    t = re.sub(r"^\d+\.\s*", "", t)             # "01. Chapter 2" -> "Chapter 2"
    return t.strip()

def find(root, pattern):
    is_dir = pattern.endswith("/")
    matches = sorted(root.glob(pattern.rstrip("/")), key=natural)
    return [m for m in matches if m.is_dir() == is_dir]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "public" / "books.json"))
    a = ap.parse_args()
    root = Path(a.root).expanduser()

    books, uploads = [], []
    for slug, title, author, pattern in BOOKS:
        found = find(root, pattern)
        if not found:
            print(f"ADVARSEL: fant ingenting for {slug} ({pattern})", file=sys.stderr)
            continue
        src = found[0]
        files = [src] if src.is_file() else sorted((f for f in src.iterdir() if f.suffix.lower() in AUDIO), key=natural)
        if not files:
            print(f"ADVARSEL: ingen lydfiler i {src}", file=sys.stderr)
            continue
        if title is None:
            title = clean_title(files[0].stem)
        entries = []
        for i, f in enumerate(files, 1):
            key = f"{slug}/{i:03d}-{safe(f.stem)}{f.suffix.lower()}"
            ftitle = title if len(files) == 1 else clean_title(f.stem)
            entries.append({"title": ftitle, "src": key})
            uploads.append((f, key))
        book = {"id": slug, "title": title, "author": author}
        if (Path(a.out).parent / "covers" / f"{slug}.jpg").exists():
            book["cover"] = f"covers/{slug}.jpg"
        book["files"] = entries
        books.append(book)

    Path(a.out).write_text(json.dumps({"books": books}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(f.stat().st_size for f, _ in uploads)
    print(f"{len(books)} bøker, {len(uploads)} filer, {total/1e9:.2f} GB -> {a.out}")
    for b in books:
        print(f"  {b['id']:16} {b['title']}  ({len(b['files'])} filer)")

    if not a.upload:
        print("\nTørrkjøring ferdig. Legg til --upload for å laste opp.")
        return
    need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    missing = [n for n in need if not os.environ.get(n)]
    if missing:
        sys.exit("Mangler miljøvariabler: " + ", ".join(missing))
    env = dict(os.environ,
        RCLONE_CONFIG_R2_TYPE="s3", RCLONE_CONFIG_R2_PROVIDER="Cloudflare",
        RCLONE_CONFIG_R2_ACCESS_KEY_ID=os.environ["R2_ACCESS_KEY_ID"],
        RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=os.environ["R2_SECRET_ACCESS_KEY"],
        RCLONE_CONFIG_R2_ENDPOINT=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        RCLONE_CONFIG_R2_NO_CHECK_BUCKET="true")
    for n, (f, key) in enumerate(uploads, 1):
        print(f"[{n}/{len(uploads)}] {key}", flush=True)
        r = subprocess.run(["rclone", "copyto", str(f), f"R2:{BUCKET}/{key}", "--progress",
                            "--s3-chunk-size", "64M", "--header-upload", f"Content-Type: {AUDIO[f.suffix.lower()]}"], env=env)
        if r.returncode:
            sys.exit(f"Opplasting feilet for {f}")
    print("Alt lastet opp. Kjør: wrangler deploy")

if __name__ == "__main__":
    main()
