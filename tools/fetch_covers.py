#!/usr/bin/env python3
"""Henter bokforsider fra Open Library og legger dem i public/covers/<bok-id>.jpg.

Bruk:
  python3 tools/fetch_covers.py                 # henter alle som mangler
  python3 tools/fetch_covers.py --force         # henter på nytt
  python3 tools/fetch_covers.py --local ~/Dokumenter   # bruker først bilder som ligger i lydbokmappene
Så: python3 tools/build_books.py --root ~/Dokumenter   (legger "cover" inn i books.json)
    wrangler deploy

Egne bilder: legg en JPG som public/covers/<bok-id>.jpg (f.eks. hobbit.jpg), den hoppes over her.
"""
import argparse, json, re, shutil, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_JSON = ROOT / "public" / "books.json"
COVERS = ROOT / "public" / "covers"
UA = {"User-Agent": "lydbok-cover-fetcher/1.0"}

def get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()

def search_cover_id(title, author):
    title = re.sub(r"\s+A Hunger Games Novel$", "", title)   # ryddig søketittel
    q = urllib.parse.urlencode({"title": title, "author": author, "limit": 10, "fields": "title,cover_i"})
    docs = json.loads(get(f"https://openlibrary.org/search.json?{q}")).get("docs", [])
    for d in docs:
        if d.get("cover_i"):
            return d["cover_i"]
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--local", help="mappe med lydbøker; bruker .jpg/.png derfra hvis den finnes")
    a = ap.parse_args()
    books = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))["books"]
    COVERS.mkdir(parents=True, exist_ok=True)
    failed = []
    for b in books:
        dest = COVERS / f"{b['id']}.jpg"
        if dest.exists() and not a.force:
            print(f"= {b['id']}: har allerede forside")
            continue
        if a.local:
            want = b["title"].lower().replace("the ", "")
            imgs = [f for f in Path(a.local).expanduser().rglob("*")
                    if f.suffix.lower() in (".jpg", ".jpeg") and want in f.stem.lower().replace("the ", "")]
            if imgs:
                shutil.copyfile(imgs[0], dest)
                print(f"+ {b['id']}: lokal forside {imgs[0].name}")
                continue
        try:
            cid = search_cover_id(b["title"], b["author"])
            if not cid:
                raise RuntimeError("ingen treff")
            data = get(f"https://covers.openlibrary.org/b/id/{cid}-L.jpg")
            if len(data) < 2000:
                raise RuntimeError("bildet er for lite")
            dest.write_bytes(data)
            print(f"+ {b['id']}: {b['title']} ({len(data)//1024} KB)")
        except Exception as e:
            print(f"! {b['id']}: {b['title']}: {e}", file=sys.stderr)
            failed.append(b["id"])
    if failed:
        print("\nMangler forside for: " + ", ".join(failed) +
              "\nLegg egne bilder som public/covers/<id>.jpg og kjør build_books.py på nytt.")
    print("\nKjør nå: python3 tools/build_books.py --root ~/Dokumenter   og   wrangler deploy")

if __name__ == "__main__":
    main()
