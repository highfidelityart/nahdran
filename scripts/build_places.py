#!/usr/bin/env python3
"""Pull places for Berlin from OpenStreetMap (Overpass) into a compact places.json."""
import json, os, sys, time, urllib.request, urllib.parse
CACHE = os.environ.get("CACHE_DIR")
BBOX = "52.24,12.93,52.77,13.91"  # Berlin + ~10 km ring (Potsdam, Oranienburg, Bernau...)
CATS = {
    "pharmacy": '["amenity"="pharmacy"]',
    "cafe": '["amenity"="cafe"]',
    "supermarket": '["shop"="supermarket"]',
    "bakery": '["shop"="bakery"]',
    "drugstore": '["shop"="chemist"]',
    "restaurant": '["amenity"="restaurant"]',
    "atm": '["amenity"="atm"]',
    "toilets": '["amenity"="toilets"]',
    "kiosk": '["shop"~"^(kiosk|convenience)$"]',
    "bar": '["amenity"~"^(bar|pub)$"]',
}
ENDPOINTS = ["https://overpass.openstreetmap.fr/api/interpreter",
             "https://overpass.private.coffee/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter",
             "https://overpass-api.de/api/interpreter",
             "https://z.overpass-api.de/api/interpreter"]

def tiles(n=3):
    s_, w, n_, e = [float(x) for x in BBOX.split(",")]
    for i in range(n):
        for j in range(n):
            yield "%.4f,%.4f,%.4f,%.4f" % (s_ + (n_ - s_) * i / n, w + (e - w) * j / n,
                                             s_ + (n_ - s_) * (i + 1) / n, w + (e - w) * (j + 1) / n)

def query(q):
    last = None
    for attempt in range(4):
        for u in ENDPOINTS:
            try:
                req = urllib.request.Request(u, data=urllib.parse.urlencode({"data": q}).encode(),
                                             headers={"User-Agent": "nahdran-places-build/1.0"})
                with urllib.request.urlopen(req, timeout=75) as r:
                    return json.load(r)["elements"]
            except Exception as e:
                last = e; print("retry", u, e, file=sys.stderr, flush=True)
        time.sleep(15)
    raise last

def fetch(sel):
    seen = {}
    for t in tiles():
        for e in query(f"[out:json][timeout:60];nwr{sel}({t});out center tags;"):
            seen[(e["type"], e["id"])] = e
    return list(seen.values())

ONLY = os.environ.get("ONLY")
out = []
for cat, sel in CATS.items():
    if ONLY and cat not in ONLY.split(","): continue
    cf = f"{CACHE}/{cat}.json" if CACHE else None
    if cf and os.path.exists(cf):
        els = json.load(open(cf))
    else:
        els = fetch(sel)
        if cf:
            os.makedirs(CACHE, exist_ok=True); json.dump(els, open(cf, "w"))
    n = 0
    for e in els:
        t = e.get("tags", {})
        lat = e.get("lat", (e.get("center") or {}).get("lat")); lon = e.get("lon", (e.get("center") or {}).get("lon"))
        if lat is None: continue
        addr = " ".join(x for x in [t.get("addr:street"), t.get("addr:housenumber")] if x)
        out.append([cat, round(lat, 5), round(lon, 5), t.get("name") or t.get("brand") or "", addr, t.get("opening_hours") or ""])
        n += 1
    print(cat, n, file=sys.stderr, flush=True)
if not ONLY and len(out) < 15000:
    sys.exit("suspiciously few places, not writing")
if not ONLY:
    gen = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    os.makedirs("data", exist_ok=True)
    parts = [out[i:i + 5000] for i in range(0, len(out), 5000)]
    for n, p in enumerate(parts):
        json.dump(p, open(f"data/places-{n}.json", "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"generated": gen, "bbox": BBOX, "count": len(out), "parts": len(parts),
               "fields": ["cat", "lat", "lon", "name", "addr", "opening_hours"]},
              open("data/index.json", "w"), separators=(",", ":"))
    print("total", len(out), "in", len(parts), "parts", file=sys.stderr)
