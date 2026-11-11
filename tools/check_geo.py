#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上线前的数据自检：几何与数据是否一一对应、宗教比例是否成立、历史是否都有出处。"""
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

# ---------- 宗教比例总和 ----------
print("\n---------- 宗教比例 ----------")
bad = 0
for name in stats:
    m = re.search(r'add\("%s",.*?\n?(.*?)\);' % re.escape(name), data_js, re.S)
    if not m:
        continue
    body = m.group(1)
    rel = re.search(r'\{([^{}]*)\}', body)
    if not rel:
        continue
    total = 0.0
    for k, v in re.findall(r'(\w+):\s*([\d.]+)', rel.group(1)):
        total += float(v)
    if abs(total - 100) > 2.5:
        bad += 1
        print("  比例总和异常: %-28s %.1f" % (name, total))
print("  比例总和异常的国家数:", bad)

# ---------- 历史与区域模板 ----------
print("\n---------- 历史与区域 ----------")
hist = set(re.findall(r'hist\("([^"]+)"', data_js))
marks = re.findall(r'mark\("([^"]+)",\s*\[(.*?)\]\);', data_js, re.S)
region_of = {}
for key, body in marks:
    for n in re.findall(r'"([^"]+)"', body):
        region_of[n] = key

no_hist = [s for s in stats if s not in hist]
missing = [s for s in no_hist if s not in region_of]
ghost = [n for n in region_of if n not in set(stats)]
tpl_keys = set(re.findall(r'tpl\("([^"]+)"', data_js))
region_keys = set(k for k, _ in marks)

print("  有专属历史: %d / %d" % (len(hist), len(stats)))
print("  其余国家走区域模板: %d" % len(no_hist))
print("  无历史也无区域归类（会退回通用模板）:", missing)
print("  区域表里不存在的国家:", ghost)
print("  没有模板的区域:", sorted(region_keys - tpl_keys))
print("  没有国家的区域:", sorted(tpl_keys - region_keys - {"default"}))

for key, body in re.findall(r'tpl\("([^"]+)",\s*\[(.*?)\n  \]\);', data_js, re.S):
    unknown = set(re.findall(r'\{(\w+)\}', body)) - {"zh", "rel", "pct", "now"}
    if unknown:
        print("  模板 %s 含未知占位符: %s" % (key, sorted(unknown)))

# ---------- 中国要素 ----------
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
