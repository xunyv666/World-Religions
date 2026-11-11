#!/usr/bin/env python3
"""用 Chrome DevTools Protocol 连续执行若干步骤并逐步截图。

比 cdp_shot.py 适合「连续交互 + 连续取证」的场景：只启动一次浏览器，
按顺序执行 JS 表达式，每一步之后等待指定秒数再截图。

用法：
    python tools/cdp_flow.py --url "http://127.0.0.1:8123/index.html" \
        --steps steps.json

steps.json 是一个数组，每项：
    { "expr": "js", "wait": 1.0, "out": "shot.png", "label": "说明" }
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.parse

import requests
import websocket

# Windows 控制台默认 GBK，输出中文与日文标点会直接抛 UnicodeEncodeError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9334


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
    ap.add_argument("--steps", required=True, help="步骤 JSON 文件")
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--initial-wait", type=float, default=1.6)
    ap.add_argument("--edge", default=EDGE)
    args = ap.parse_args()

    with open(os.path.expandvars(os.path.expanduser(args.steps)), "r", encoding="utf-8") as f:
        steps = json.load(f)

    profile = os.path.join(os.environ.get("TEMP", "."), "edge-cdp-flow-profile")
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
    results = []
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
            cdp.drain(args.initial_wait)

            for idx, step in enumerate(steps):
                label = step.get("label", f"step{idx}")
                value = None
                if step.get("expr"):
                    res = cdp.call("Runtime.evaluate", {
                        "expression": step["expr"],
                        "returnByValue": True,
                    })
                    value = res.get("result", {}).get("value")
                cdp.drain(float(step.get("wait", 0.6)))
                out = step.get("out")
                if out:
                    shot_params = {"format": "png"}
                    if step.get("clip"):
                        c = step["clip"]
                        shot_params["clip"] = {
                            "x": c[0], "y": c[1], "width": c[2], "height": c[3],
                            "scale": c[4] if len(c) > 4 else 1,
                        }
                    shot = cdp.call("Page.captureScreenshot", shot_params)
                    path = os.path.abspath(os.path.expandvars(os.path.expanduser(out)))
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(shot["data"]))
                results.append({"label": label, "value": value, "out": out})

            logs = []
            for ev in cdp.events:
                if ev.get("method") == "Runtime.consoleAPICalled":
                    text = " ".join(str(a.get("value", a.get("description", "")))
                                    for a in ev["params"].get("args", []))
                    logs.append(f"[{ev['params'].get('type')}] {text}")
                elif ev.get("method") == "Runtime.exceptionThrown":
                    det = ev["params"]["exceptionDetails"]
                    logs.append("[exception] " +
                                (det.get("exception", {}).get("description") or det.get("text", "")))
            print(json.dumps({"steps": results, "console": logs[:60]},
                             ensure_ascii=False, indent=2))
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
