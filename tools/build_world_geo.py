#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用中国口径的世界地图数据源重建 assets/js/world-geo.js 与 data/countries.geo.json。

数据源：data/world.zh.json
        来自 @surbowl/world-geo-json-zh（npm 包，简体中文世界地图 GeoJSON），
        台湾、藏南均按中国主张线划分，南海诸岛列入中国名下。
        重新获取：
            npm pack @surbowl/world-geo-json-zh
            tar -xzf surbowl-world-geo-json-zh-*.tgz
            cp package/world.zh.json data/

产出与原来的 Natural Earth 文件保持同样的结构：
    window.WORLD_GEO = { type, features:[ {type,id,properties:{name},geometry} ] }
    window.WORLD_GEO_META = { source, resolution }
    data/countries.geo.json 同样的内容（纯 JSON）

用法：
    python tools/build_world_geo.py data/world.zh.json
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- ISO3 -> 英文名
# 与 data.js 里 COUNTRY_STATS 的 key 保持一致
ISO3 = {
    # 亚洲
    "AFG": "Afghanistan", "ARM": "Armenia", "AZE": "Azerbaijan", "BGD": "Bangladesh",
    "BTN": "Bhutan", "BRN": "Brunei", "KHM": "Cambodia", "CHN": "China", "CYP": "Cyprus",
    "TLS": "East Timor", "GEO": "Georgia", "IND": "India", "IDN": "Indonesia", "IRN": "Iran",
    "IRQ": "Iraq", "ISR": "Israel", "JPN": "Japan", "JOR": "Jordan", "KAZ": "Kazakhstan",
    "KWT": "Kuwait", "KGZ": "Kyrgyzstan", "LAO": "Laos", "LBN": "Lebanon", "MYS": "Malaysia",
    "MNG": "Mongolia", "MMR": "Myanmar", "NPL": "Nepal", "PRK": "North Korea", "OMN": "Oman",
    "PAK": "Pakistan", "PHL": "Philippines", "QAT": "Qatar", "SAU": "Saudi Arabia",
    "KOR": "South Korea", "LKA": "Sri Lanka", "SYR": "Syria", "TJK": "Tajikistan",
    "THA": "Thailand", "TUR": "Turkey", "TKM": "Turkmenistan", "ARE": "United Arab Emirates",
    "UZB": "Uzbekistan", "VNM": "Vietnam", "YEM": "Yemen", "PSE": "West Bank",
    # 欧洲
    "ALB": "Albania", "AUT": "Austria", "BLR": "Belarus", "BEL": "Belgium",
    "BIH": "Bosnia and Herzegovina", "BGR": "Bulgaria", "HRV": "Croatia", "CZE": "Czech Republic",
    "DNK": "Denmark", "EST": "Estonia", "FIN": "Finland", "FRA": "France", "DEU": "Germany",
    "GRC": "Greece", "HUN": "Hungary", "ISL": "Iceland", "IRL": "Ireland", "ITA": "Italy",
    "LVA": "Latvia", "LTU": "Lithuania", "LUX": "Luxembourg", "MKD": "Macedonia", "MLT": "Malta",
    "MDA": "Moldova", "MNE": "Montenegro", "NLD": "Netherlands", "NOR": "Norway", "POL": "Poland",
    "PRT": "Portugal", "SRB": "Republic of Serbia", "ROU": "Romania", "RUS": "Russia",
    "SVK": "Slovakia", "SVN": "Slovenia", "ESP": "Spain", "SWE": "Sweden", "CHE": "Switzerland",
    "UKR": "Ukraine", "GBR": "United Kingdom",
    # 非洲
    "DZA": "Algeria", "AGO": "Angola", "BEN": "Benin", "BWA": "Botswana", "BFA": "Burkina Faso",
    "BDI": "Burundi", "CMR": "Cameroon", "CAF": "Central African Republic", "TCD": "Chad",
    "COD": "Democratic Republic of the Congo", "DJI": "Djibouti", "EGY": "Egypt",
    "GNQ": "Equatorial Guinea", "ERI": "Eritrea", "ETH": "Ethiopia", "GAB": "Gabon", "GMB": "Gambia",
    "GHA": "Ghana", "GIN": "Guinea", "GNB": "Guinea Bissau", "CIV": "Ivory Coast", "KEN": "Kenya",
    "LSO": "Lesotho", "LBR": "Liberia", "LBY": "Libya", "MDG": "Madagascar", "MWI": "Malawi",
    "MLI": "Mali", "MRT": "Mauritania", "MAR": "Morocco", "MOZ": "Mozambique", "NAM": "Namibia",
    "NER": "Niger", "NGA": "Nigeria", "COG": "Republic of the Congo", "RWA": "Rwanda",
    "SEN": "Senegal", "SLE": "Sierra Leone", "SOM": "Somalia", "ZAF": "South Africa",
    "SSD": "South Sudan", "SDN": "Sudan", "SWZ": "Swaziland", "TGO": "Togo", "TUN": "Tunisia",
    "UGA": "Uganda", "TZA": "United Republic of Tanzania", "ESH": "Western Sahara",
    "ZMB": "Zambia", "ZWE": "Zimbabwe",
    # 美洲
    "ARG": "Argentina", "BLZ": "Belize", "BMU": "Bermuda", "BOL": "Bolivia", "BRA": "Brazil",
    "CAN": "Canada", "CHL": "Chile", "COL": "Colombia", "CRI": "Costa Rica", "CUB": "Cuba",
    "DOM": "Dominican Republic", "ECU": "Ecuador", "SLV": "El Salvador", "FLK": "Falkland Islands",
    "GRL": "Greenland", "GTM": "Guatemala", "GUY": "Guyana", "HTI": "Haiti", "HND": "Honduras",
    "JAM": "Jamaica", "MEX": "Mexico", "NIC": "Nicaragua", "PAN": "Panama", "PRY": "Paraguay",
    "PER": "Peru", "SUR": "Suriname", "BHS": "The Bahamas", "TTO": "Trinidad and Tobago",
    "USA": "United States of America", "URY": "Uruguay", "VEN": "Venezuela",
    "PRI": "Puerto Rico", "NCL": "New Caledonia",
    # 大洋洲与极地
    "AUS": "Australia", "FJI": "Fiji", "NZL": "New Zealand", "PNG": "Papua New Guinea",
    "SLB": "Solomon Islands", "VUT": "Vanuatu", "ATA": "Antarctica",
    "ATF": "French Southern and Antarctic Lands",
}

# 附属地：几何并入母国（数据源里这些是独立要素，统计表里也是独立国家，
# 这里保留独立，改由统计表合并进母国）
ABSORB = {}

ROUND = 4


def round_coords(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], ROUND), round(coords[1], ROUND)]
    return [round_coords(c) for c in coords]


def merge_geometry(a, b):
    """把 b 的多边形并进 a 的几何（Polygon 与 MultiPolygon 互转）。"""
    def to_multi(g):
        if g["type"] == "Polygon":
            return [g["coordinates"]]
        return g["coordinates"]

    polys = to_multi(a) + to_multi(b)
    if len(polys) == 1:
        return {"type": "Polygon", "coordinates": polys[0]}
    return {"type": "MultiPolygon", "coordinates": polys}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src_path = sys.argv[1]

    with open(src_path, encoding="utf-8") as f:
        src = json.load(f)

    feats = []
    absorbed = []
    skipped = []
    for f in src["features"]:
        props = f.get("properties") or {}
        iso = props.get("iso_a3")
        geom = f.get("geometry")
        if not iso or not geom or geom["type"] not in ("Polygon", "MultiPolygon"):
            skipped.append(props.get("name", "?"))
            continue
        if iso in ABSORB:
            absorbed.append((props.get("name"), ABSORB[iso]))
            continue
        en = ISO3.get(iso)
        if en is None:
            skipped.append(props.get("name", "?"))
            continue
        feats.append({
            "type": "Feature",
            "id": iso,
            "properties": {"name": en},
            "geometry": {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])},
        })

    feats.sort(key=lambda x: x["id"])

    # 附属地并入母国
    by_iso = {f["id"]: f for f in feats}
    for f in src["features"]:
        props = f.get("properties") or {}
        iso = props.get("iso_a3")
        if iso not in ABSORB:
            continue
        host = by_iso.get(ISO3.get(ABSORB[iso]))
        if host is None:
            continue
        host["geometry"] = merge_geometry(host["geometry"], {
            "type": f["geometry"]["type"],
            "coordinates": round_coords(f["geometry"]["coordinates"]),
        })

    coll = {
        "type": "FeatureCollection",
        "features": feats,
    }

    # ---- 与 data.js 的 COUNTRY_STATS 对齐检查
    data_js = open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
    want = set(re.findall(r'add\("([^"]+)",', data_js))
    got = {f["properties"]["name"] for f in feats}
    missing = sorted(want - got)
    extra = sorted(got - want)
    out_dir = os.path.join(ROOT, "data")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "countries.geo.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(coll, ensure_ascii=False, separators=(",", ":")))
        f.write("\n")

    js_path = os.path.join(ROOT, "assets", "js", "world-geo.js")
    lines = ["window.WORLD_GEO=" + json.dumps(coll, ensure_ascii=False, separators=(",", ":")),
             "window.WORLD_GEO_META={source:'@surbowl/world-geo-json-zh (中国口径世界地图)',"
             " resolution:'1:110m', countries:%d};" % len(feats)]
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("国家要素:", len(feats))
    print("并入母国的附属地:", absorbed)
    print("未收录要素:", len(skipped))
    print("  ", "、".join(skipped))
    print("统计表里缺几何:", missing if missing else "无")
    print("多出的几何:", extra if extra else "无")
    print("world-geo.js 体积:", os.path.getsize(js_path), "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
