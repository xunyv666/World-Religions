#!/usr/bin/env python3
"""用 Chrome DevTools Protocol 截取页面截图并读取控制台输出。

用于离线验证本项目的渲染效果（headless 截图与浏览器行为一致）。
用法：
    python tools/cdp_shot.py --url "file:///E:/桌面/手机电脑/index.html" --out shot.png
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.parse

import requests
import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9333


def wait_for_devtools(timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"http://127.0.0.1:{PORT}/json/version", timeout=1)
            if r.ok:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(0.2)
    raise RuntimeError("无法连接 Edge DevTools")


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, max_size=None)
        self.next_id = 1
        self.events = []

    def call(self, method, params=None, timeout=30):
        mid = self.next_id
        self.next_id += 1
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                msg = json.loads(self.ws.recv())
            except websocket.WebSocketTimeoutException:
                continue
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if "method" in msg:
                self.events.append(msg)
        raise TimeoutError(method)

    def drain(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            try:
                self.ws.settimeout(max(0.05, end - time.time()))
                msg = json.loads(self.ws.recv())
                if "method" in msg:
                    self.events.append(msg)
            except websocket.WebSocketTimeoutException:
                break

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", default=os.path.join(os.environ.get("TEMP", "."), "cdp-shot.png"))
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--wait", type=float, default=1.6)
    ap.add_argument("--after", type=float, default=0.0,
                    help="表达式执行后、截图前额外等待的秒数（等动画/重绘）")
    ap.add_argument("--expr", default="")
    ap.add_argument("--edge", default=EDGE)
    args = ap.parse_args()

    profile = os.path.join(os.environ.get("TEMP", "."), "edge-cdp-profile")
    cmd = [
        args.edge,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--hide-scrollbars",
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={profile}",
        f"--window-size={args.width},{args.height}",
        "--force-device-scale-factor=1",
        "about:blank",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_devtools()
        target_url = urllib.parse.quote(args.url, safe=":/?#=&%")
        r = requests.put(f"http://127.0.0.1:{PORT}/json/new?{target_url}", timeout=10)
        target = r.json()
        cdp = CDP(target["webSocketDebuggerUrl"])
        try:
            cdp.call("Page.enable")
            cdp.call("Runtime.enable")
            cdp.call("Page.bringToFront")
            cdp.drain(args.wait)

            logs = []
            for ev in cdp.events:
                if ev.get("method") == "Runtime.consoleAPICalled":
                    text = " ".join(str(a.get("value", a.get("description", ""))) for a in ev["params"].get("args", []))
                    logs.append(f"[{ev['params'].get('type')}] {text}")
                elif ev.get("method") == "Runtime.exceptionThrown":
                    det = ev["params"]["exceptionDetails"]
                    logs.append("[exception] " + (det.get("exception", {}).get("description") or det.get("text", "")))

            expr = args.expr
            if not expr:
                expr = """(() => {
                  const m = window.__map;
                  const c = document.querySelector('#map');
                  let nz = 0, colored = 0, total = 0;
                  if (c.width && c.height) {
                    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                    for (let i = 0; i < d.length; i += 4 * 53) {
                      total++;
                      if (d[i] || d[i + 1] || d[i + 2]) nz++;
                      if (Math.abs(d[i]-d[i+1]) > 10 || Math.abs(d[i+1]-d[i+2]) > 10) colored++;
                    }
                  }
                  return {
                    iw: innerWidth, ih: innerHeight,
                    scrollX: scrollX, scrollY: scrollY,
                    canvas: [c.width, c.height],
                    rect: [c.getBoundingClientRect().width, c.getBoundingClientRect().height],
                    nz, colored, total,
                    hasMap: !!m, mapSize: m ? [m.width, m.height] : null,
                    loading: document.querySelector('#loading').className,
                    welcome: document.querySelector('#welcome').className
                  };
                })()"""
            res = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if args.after > 0:
                cdp.drain(args.after)
            shot = cdp.call("Page.captureScreenshot", {"format": "png"})
            with open(args.out, "wb") as f:
                f.write(base64.b64decode(shot["data"]))
            print(json.dumps({"out": args.out, "result": res.get("result", {}).get("value"), "console": logs[:40]}, ensure_ascii=False, indent=2))
        finally:
            cdp.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
