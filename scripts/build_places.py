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
ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter",
             "https://overpass.private.coffee/api/interpreter"]

def query(q):
    last = None
    for attempt in range(3):
        for u in ENDPOINTS:
            try:
                req = urllib.request.Request(u, data=urllib.parse.urlencode({"data": q}).encode(),
                                             headers={"User-Agent": "nahdran-places-build/1.0"})
                with urllib.request.urlopen(req, timeout=170) as r:
                    return json.load(r)["elements"]
            except Exception as e:
                last = e; print("retry", u, e, file=sys.stderr)
        time.sleep(10)
    raise last

ONLY = os.environ.get("ONLY")
out = []
for cat, sel in CATS.items():
    if ONLY and cat not in ONLY.split(","): continue
    cf = f"{CACHE}/{cat}.json" if CACHE else None
    if cf and os.path.exists(cf):
        els = json.load(open(cf))
    else:
        els = query(f"[out:json][timeout:170];nwr{sel}({BBOX});out center tags;")
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
    print(cat, n, file=sys.stderr)
data = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "bbox": BBOX,
        "fields": ["cat", "lat", "lon", "name", "addr", "opening_hours"], "places": out}
if not ONLY and len(out) < 1000:
    sys.exit("suspiciously few places, not writing")
if not ONLY: json.dump(data, open("places.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("total", len(out), file=sys.stderr)
