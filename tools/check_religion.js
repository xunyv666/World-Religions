#!/usr/bin/env node
/* =========================================================
   宗教专题数据自检（Node，无第三方依赖）
   检查 data.js / spread.js / arrival.js 三份新数据是否自洽：
     - FAITH_DIST：四个宗教的统计、简史、重点地区是否齐全
     - SPREAD：事件年份是否在时间轴范围内、是否按时间排序、坐标是否合法
     - ARRIVAL：传入年份表里的国名是否真的存在于底图
   用法：node tools/check_religion.js
   退出码非 0 表示不合格。
   ========================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function loadScript(name) {
  const p = path.join(ROOT, "assets", "js", name);
  vm.runInContext(fs.readFileSync(p, "utf8"), sandbox, { filename: p });
}

loadScript("data.js");
loadScript("spread.js");
loadScript("arrival.js");

const W = sandbox.window;
const errors = [];
const warns = [];
function err(msg) { errors.push(msg); }
function warn(msg) { warns.push(msg); }

/* ---------- 底图国名 ---------- */
function geoNames() {
  const p = path.join(ROOT, "data", "countries.geo.json");
  if (!fs.existsSync(p)) { return null; }
  const geo = JSON.parse(fs.readFileSync(p, "utf8"));
  const set = new Set();
  for (const f of geo.features || []) {
    const pr = f.properties || {};
    set.add(pr.name || pr.NAME || f.name);
  }
  return set;
}
const NAMES = geoNames();

/* ---------- FAITH_DIST ---------- */
const DENSITY_KEYS = ["bud", "chr", "isl", "tao"];
const FAITHS = W.FAITH_DIST || {};
if (!FAITHS.tao) { err("FAITH_DIST.tao 缺失（旧的 window.TAOISM 兼容层依赖它）"); }

for (const key of DENSITY_KEYS) {
  const info = FAITHS[key];
  if (!info) { err("FAITH_DIST." + key + " 缺失"); continue; }
  if (!info.title || !info.intro || !info.note) { err(key + "：缺 title / intro / note"); }
  if (!Array.isArray(info.stats) || info.stats.length < 3) { err(key + "：stats 至少要有 3 条"); }
  if (!Array.isArray(info.history) || info.history.length < 6) { err(key + "：history 至少要有 6 条"); }
  if (!Array.isArray(info.places) || info.places.length < 8) { err(key + "：places 至少要有 8 个重点地区"); }
  const seen = new Set();
  (info.places || []).forEach((p, i) => {
    if (!p.name) { err(key + "：places[" + i + "] 没有 name"); }
    if (seen.has(p.name)) { err(key + "：places 里有重名 " + p.name); }
    seen.add(p.name);
    if (!(p.lat >= -90 && p.lat <= 90)) { err(key + "：" + p.name + " 纬度非法 " + p.lat); }
    if (!(p.lon >= -180 && p.lon <= 360)) { err(key + "：" + p.name + " 经度非法 " + p.lon); }
    if (!(p.followers > 0)) { err(key + "：" + p.name + " 信众数应为正数"); }
  });
  /* 名称必须带「中国」前缀的地区 */
  ["中国台湾", "中国香港", "中国澳门"].forEach((nm) => {
    const hit = (info.places || []).filter((p) => p.name === nm);
    if (key === "tao" || key === "bud" || key === "chr") {
      if (!hit.length) { warn(key + "：重点地区里没有 " + nm); }
    }
  });
}

/* ---------- SPREAD ---------- */
const SPREAD = W.SPREAD || {};
for (const key of DENSITY_KEYS) {
  const S = SPREAD[key];
  if (!S) { err("SPREAD." + key + " 缺失"); continue; }
  if (!S.origin || !(S.origin.lat >= -90 && S.origin.lat <= 90)) { err(key + "：发源地坐标非法"); }
  if (!(S.max > S.min)) { err(key + "：max 必须大于 min"); }

  let last = -Infinity;
  (S.events || []).forEach((e, i) => {
    if (e.y < S.min || e.y > S.max) { err(key + "：事件 " + e.place + " 年份 " + e.y + " 超出 [" + S.min + "," + S.max + "]"); }
    if (e.y < last) { err(key + "：事件未按时间排序（" + e.place + "）"); }
    last = e.y;
    if (!(e.lat >= -90 && e.lat <= 90)) { err(key + "：事件 " + e.place + " 纬度非法"); }
    if (!(e.lon >= -180 && e.lon <= 360)) { err(key + "：事件 " + e.place + " 经度非法"); }
    if (!e.t) { err(key + "：事件 " + e.place + " 没有说明文字"); }
    if (!e.place) { err(key + "：第 " + i + " 个事件没有地点名"); }
  });
  if ((S.events || []).length < 15) { warn(key + "：事件偏少（" + (S.events || []).length + " 条）"); }

  (S.routes || []).forEach((r) => {
    if (!Array.isArray(r.path) || r.path.length < 2) { err(key + "：路线 " + r.label + " 的 path 不合法"); return; }
    if (r.y < S.min || r.y > S.max) { err(key + "：路线 " + r.label + " 的年份超出范围"); }
    r.path.forEach((pt) => {
      if (!(pt[0] >= -90 && pt[0] <= 90) || !(pt[1] >= -180 && pt[1] <= 360)) {
        err(key + "：路线 " + r.label + " 有非法坐标");
      }
    });
  });

  /* 阶段必须首尾相接并覆盖整个时间轴（相邻阶段允许共用同一个年份） */
  let cursor = S.min;
  (S.phases || []).forEach((p) => {
    if (p.from < cursor - 1) { err(key + "：阶段 " + p.name + " 起点应为 " + cursor + "，实际 " + p.from); }
    if (p.to < p.from) { err(key + "：阶段 " + p.name + " 起止倒置"); }
    cursor = Math.max(cursor, p.to + 1);
  });
  if (cursor <= S.max) { err(key + "：阶段没有覆盖到 " + S.max + "（停在 " + (cursor - 1) + "）"); }
}

/* ---------- ARRIVAL ---------- */
const ARRIVAL = W.ARRIVAL || {};
for (const key of DENSITY_KEYS) {
  const table = ARRIVAL[key];
  if (!table) { err("ARRIVAL." + key + " 缺失"); continue; }
  let n = 0;
  for (const k in table) {
    n++;
    if (NAMES && !NAMES.has(k)) { err("ARRIVAL." + key + " 里的 " + k + " 不是底图里的国家"); }
    if (typeof table[k] !== "number" || !isFinite(table[k])) { err("ARRIVAL." + key + "." + k + " 年份不是数字"); }
  }
  if (n < 30) { err("ARRIVAL." + key + " 条目太少（" + n + "）"); }
  /* 传入年份不应晚于时间轴末端 */
  const S = SPREAD[key];
  if (S) {
    for (const k in table) {
      if (table[k] > S.max) { err("ARRIVAL." + key + "." + k + " 的传入年份 " + table[k] + " 晚于时间轴末端 " + S.max); }
    }
  }
}

/* ---------- 汇总 ---------- */
console.log("FAITH_DIST: " + DENSITY_KEYS.filter((k) => FAITHS[k]).length + " / 4 个宗教");
console.log("SPREAD: " + DENSITY_KEYS.filter((k) => SPREAD[k]).length + " / 4 个宗教");
console.log("ARRIVAL: " + DENSITY_KEYS.filter((k) => ARRIVAL[k]).length + " / 4 个宗教");
if (NAMES) { console.log("底图国家数: " + NAMES.size); }

if (warns.length) {
  console.log("\n提示：");
  warns.forEach((w) => console.log("  · " + w));
}
if (errors.length) {
  console.log("\n不通过：");
  errors.forEach((e) => console.log("  ✗ " + e));
  process.exit(1);
}
console.log("\n全部通过。");
