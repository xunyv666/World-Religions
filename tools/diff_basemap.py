#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对比换底图前后的国家集合：新底图是否丢了旧底图里有的国家。"""
import io
import json
import os
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_json(text):
    return json.loads(text)

old = load_json(subprocess.run(
    ["git", "-C", ROOT, "show", "f9f10da^:data/countries.geo.json"],
    capture_output=True, check=True).stdout.decode("utf-8"))

new = load_json(open(os.path.join(ROOT, "data", "countries.geo.json"), encoding="utf-8"))

old_names = {f["properties"]["name"] for f in old["features"]}
new_names = {f["properties"]["name"] for f in new["features"]}

print("旧底图要素: %d, 新底图要素: %d" % (len(old["features"]), len(new["features"])))
print("\n旧有新无（换底图后丢了）:")
for n in sorted(old_names - new_names):
    print("  ", n)
print("\n新有旧无（换底图后新增）:")
for n in sorted(new_names - old_names):
    print("  ", n)

# 面积变化明显的国家（用经纬度包围盒粗算）
def bbox(f):
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    xs, ys = [], []
    for poly in polys:
        for ring in poly:
            for x, y in ring:
                xs.append(x)
                ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)

old_by = {f["properties"]["name"]: f for f in old["features"]}
new_by = {f["properties"]["name"]: f for f in new["features"]}
print("\n边界框变化较大的国家（可能涉及边界调整）:")
for n in sorted(old_names & new_names):
    ob, nb = bbox(old_by[n]), bbox(new_by[n])
    dx = abs((ob[0] + ob[1]) - (nb[0] + nb[1]))
    dy = abs((ob[2] + ob[3]) - (nb[2] + nb[3]))
    if dx > 0.6 or dy > 0.6:
        print("   %-32s 经度中心 %.2f -> %.2f  纬度中心 %.2f -> %.2f"
              % (n, (ob[0] + ob[1]) / 2, (nb[0] + nb[1]) / 2, (ob[2] + ob[3]) / 2, (nb[2] + nb[3]) / 2))
