#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把要上线的静态文件收集到 dist/，供 Cloudflare Pages 部署。

只收运行时真正需要的文件：页面本体、脚本样式、图标、PWA 三件套。
data/ 里的 json 是底图构建的中间产物（见 tools/build_world_geo.py），
运行时不会请求，不进部署包。

用法：
    python tools/build_dist.py          # 生成 dist/
    python tools/build_dist.py --clean  # 先清空 dist/ 再生成
"""
import io
import os
import shutil
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

FILES = ["index.html", "404.html", "sw.js", "manifest.webmanifest", "_headers"]
DIRS = ["assets"]


def main():
    if "--clean" in sys.argv and os.path.isdir(DIST):
        shutil.rmtree(DIST)
        print("已清空 dist/")

    os.makedirs(DIST, exist_ok=True)
    for name in FILES:
        src = os.path.join(ROOT, name)
        if not os.path.exists(src):
            print("跳过（不存在）：", name)
            continue
        shutil.copy2(src, os.path.join(DIST, name))
        print("复制", name)

    for name in DIRS:
        src = os.path.join(ROOT, name)
        if not os.path.isdir(src):
            print("跳过（不存在）：", name + "/")
            continue
        dst = os.path.join(DIST, name)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        print("复制", name + "/")

    total = 0
    for dirpath, _, filenames in os.walk(DIST):
        for fn in filenames:
            total += os.path.getsize(os.path.join(dirpath, fn))
    print("\ndist/ 就绪：%d 个文件，合计 %.2f MB" % (sum(len(f) for _, _, f in os.walk(DIST)), total / 1024 / 1024))


if __name__ == "__main__":
    main()
