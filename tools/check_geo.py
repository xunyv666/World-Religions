#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对统计表与底图几何的覆盖情况：哪些国家有数据没形状、哪些有形状没数据。"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

data_js = open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
stats = re.findall(r'add\("([^"]+)",', data_js)
geo = json.load(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))
got = {f["properties"]["name"] for f in geo["features"]}

print("统计表国家数:", len(stats))
print("底图要素数:", len(got))
print("\n有数据、缺几何:", sorted(set(stats) - got))
print("\n有几何、缺数据:", sorted(got - set(stats)))

# 中国要素包含哪些环（台湾/南海诸岛/断续线是否在内）
for f in geo["features"]:
    if f["properties"]["name"] != "China":
        continue
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    n = 0
    for poly in polys:
        n += len(poly)
    print("\n中国要素: %s, 多边形 %d, 环 %d" % (g["type"], len(polys), n))

    def ring_box(ring):
        lons = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        return min(lons), max(lons), min(lats), max(lats)

    tw = [p for p in polys if 119 <= ring_box(p[0])[0] <= 122 and 21.5 <= ring_box(p[0])[3] <= 25.5]
    print("  含台湾范围的环:", len(tw))
    dash = 0
    for poly in polys:
        for ring in poly:
            lo, hi, la, lb = ring_box(ring)
            w = hi - lo
            h = lb - la
            if 0.02 < w < 2 and 0.1 < h < 2.5 and 3 <= la <= 25:
                dash += 1
    print("  南海方向细小环（断续线/岛礁）:", dash)
