/* =========================================================
   地图引擎 · 平面地图 + 3D 地球（纯 Canvas，无第三方依赖）
   ========================================================= */
(function () {
  "use strict";

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function normalizeLon(l) { l = ((l + 180) % 360 + 360) % 360 - 180; return l; }

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," +
      Math.round(a[1] + (b[1] - a[1]) * t) + "," +
      Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }
  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  /* ---------- 配色 ---------- */
  var TAO_STOPS = [
    [0.00, "#151c25"],
    [0.18, "#2a2a22"],
    [0.40, "#5d4a1f"],
    [0.62, "#9c7a2e"],
    [0.82, "#d8b25f"],
    [1.00, "#fff2c4"]
  ];
  function taoColor(vMillions) {
    if (!vMillions || vMillions <= 0.0005) { return "#151c25"; }
    var t = clamp((Math.log10(vMillions * 1000 + 1) - 0.9) / 3.6, 0, 1);
    for (var i = 0; i < TAO_STOPS.length - 1; i++) {
      var a = TAO_STOPS[i], b = TAO_STOPS[i + 1];
      if (t >= a[0] && t <= b[0]) {
        return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return TAO_STOPS[TAO_STOPS.length - 1][1];
  }

  function pointInRings(lon, lat, rings) {
    var inside = false;
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r], n = ring.length;
      if (n < 3) { continue; }
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = ring[i][0], yi = ring[i][1];
        var xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
    }
    return inside;
  }
  function inBbox(lon, lat, b) {
    if (lat < b[1] || lat > b[3]) { return false; }
    if (b[2] - b[0] >= 359.5) { return true; }
    return (lon >= b[0] && lon <= b[2]) ||
      (lon + 360 >= b[0] && lon + 360 <= b[2]) ||
      (lon - 360 >= b[0] && lon - 360 <= b[2]);
  }

  /* ---------- 经度展开 ---------- */
  /* 原始数据里跨 ±180° 的多边形（俄罗斯楚科奇半岛、斐济等）直接投影会被拉成
     横贯全图的一条直线。这里把环内经度展开成连续序列：相邻点经度差超过 180°
     时补足 360°，环就不会在日界线上断开。之后由 drawFlat 按 ±360° 副本绘制，
     跨日界线的部分会同时出现在地图左右两侧。

     例外：贴着极点的环段（南极洲沿 lat≈-90° 从 -180° 扫到 +180°）本身长度就
     超过 180°，按上面的规则回绕会被折成锯齿，南极洲的填充就会整个翻到
     海岸线以北。两端都在极点附近时保持原方向，让它沿极点边缘扫过去。 */
  function isPolarEdge(a, b) {
    var P = 89.5;
    return (a[1] <= -P && b[1] <= -P) || (a[1] >= P && b[1] >= P);
  }

  function unwrapRing(raw) {
    var out = new Array(raw.length);
    var prev = raw[0][0];
    out[0] = [prev, raw[0][1]];
    for (var i = 1; i < raw.length; i++) {
      var lon = raw[i][0];
      var d = lon - prev;
      if (!isPolarEdge(out[i - 1], raw[i])) {
        if (d > 180) { lon -= 360; }
        else if (d < -180) { lon += 360; }
      }
      prev = lon;
      out[i] = [lon, raw[i][1]];
    }
    return out;
  }

  /* 环内与目标点最接近的顶点序号（超出容差返回 -1） */
  function nearestIndex(ring, target, tol) {
    var best = -1, bd = tol * tol;
    for (var i = 0; i < ring.length; i++) {
      var dx = ring[i][0] - target[0], dy = ring[i][1] - target[1];
      var d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------- 领土归属调整 ---------- */
  /* 按 window.TERRITORY 的设置重排多边形：
       absorb —— 某些国家的多边形并入目标国家（台湾并入中国）；
       borders —— 用指定折线替换两国之间的一段边界（中印东段按中国主张线）。
     几何操作放在这里，政治口径的数据放在 data.js。 */
  function finalizeFeature(f) {
    var mainIdx = 0, mainLen = -1;
    for (var r = 0; r < f.rings.length; r++) {
      if (f.rings[r].length > mainLen) { mainLen = f.rings[r].length; mainIdx = r; }
      var sp = f.spans[r];
      if (sp.min < f.minLon) { f.minLon = sp.min; }
      if (sp.max > f.maxLon) { f.maxLon = sp.max; }
    }
    f.main = f.spans[mainIdx];
    f.center = [
      normalizeLon((f.main.min + f.main.max) / 2),
      (f.main.minLat + f.main.maxLat) / 2
    ];
    f.bbox = [f.minLon, f.minLat, f.maxLon, f.maxLat];
    f.area = (f.main.max - f.main.min) *
      Math.cos((f.center[1]) * RAD) * (f.main.maxLat - f.main.minLat);
    return f;
  }

  /* 在一个国家的环里找到与另一国共享的那段边界，用新折线替换 */
  function replaceBorderArc(feature, spec) {
    var A = spec.anchors[0], B = spec.anchors[1];
    var box = spec.box || [A[0] - 1.5, Math.min(A[1], B[1]) - 4, B[0] + 1.5, Math.max(A[1], B[1]) + 4];
    var line = spec.line;

    for (var r = 0; r < feature.rings.length; r++) {
      var ring = feature.rings[r];
      var closed = ring.length > 1 &&
        Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-9 &&
        Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-9;
      var pts = closed ? ring.slice(0, ring.length - 1) : ring.slice();
      var n = pts.length;
      if (n < 3) { continue; }

      var iA = nearestIndex(pts, A, spec.tol || 0.05);
      var iB = nearestIndex(pts, B, spec.tol || 0.05);
      if (iA < 0 || iB < 0) { continue; }

      /* 两条候选弧：正向 iA→iB 与反向 iB→iA，取完全落在分界带内的那条 */
      function inside(idx) {
        var p = pts[idx % n];
        return p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];
      }
      function arcOk(from, to) {
        var idx = from, guard = 0;
        while (guard++ <= n) {
          if (!inside(idx)) { return false; }
          if (idx === to) { return true; }
          idx = (idx + 1) % n;
        }
        return false;
      }
      var forward = arcOk(iA, iB), backward = arcOk(iB, iA);
      if (!forward && !backward) { continue; }

      var head, tail, mid;
      if (forward) {
        head = pts.slice(0, iA + 1);
        tail = pts.slice(iB);
        mid = line.slice(1, line.length - 1);
      } else {
        head = pts.slice(0, iB + 1);
        tail = pts.slice(iA);
        mid = line.slice(1, line.length - 1).reverse();
      }
      var outPts = head.concat(mid, tail);
      if (closed) { outPts.push(outPts[0].slice()); }

      feature.rings[r] = outPts;
      var sp = feature.spans[r];
      var mn = outPts[0][0], mx = outPts[0][0];
      for (var k = 0; k < outPts.length; k++) {
        if (outPts[k][0] < mn) { mn = outPts[k][0]; }
        if (outPts[k][0] > mx) { mx = outPts[k][0]; }
      }
      sp.min = mn; sp.max = mx;
    }
  }

  function applyTerritory(features) {
    var spec = window.TERRITORY || {};
    var byName = {};
    for (var i = 0; i < features.length; i++) { byName[features[i].name] = features[i]; }

    if (spec.absorb) {
      for (var host in spec.absorb) {
        var h = byName[host];
        if (!h) { continue; }
        var sources = spec.absorb[host] || [];
        for (var s = 0; s < sources.length; s++) {
          var src = byName[sources[s]];
          if (!src || src === h) { continue; }
          for (var r = 0; r < src.rings.length; r++) {
            h.rings.push(src.rings[r]);
            h.spans.push(src.spans[r]);
          }
          features.splice(features.indexOf(src), 1);
          delete byName[sources[s]];
        }
      }
    }

    if (spec.borders) {
      for (var b = 0; b < spec.borders.length; b++) {
        var bs = spec.borders[b];
        var fa = byName[bs.a], fb = byName[bs.b];
        if (!fa || !fb) { continue; }
        replaceBorderArc(fa, bs);
        replaceBorderArc(fb, bs);
      }
    }

    for (var k = 0; k < features.length; k++) {
      features[k].idx = k;
      finalizeFeature(features[k]);
    }
    return features;
  }

  function parseGeo(geo) {
    var out = [];
    var feats = geo.features || [];
    for (var fi = 0; fi < feats.length; fi++) {
      var f = feats[fi];
      var g = f.geometry;
      if (!g) { continue; }
      var polysRaw;
      if (g.type === "Polygon") { polysRaw = [g.coordinates]; }
      else if (g.type === "MultiPolygon") { polysRaw = g.coordinates; }
      else { continue; }

      var rings = [], spans = [], closures = [];
      var minLat = 90, maxLat = -90, count = 0;
      for (var pi = 0; pi < polysRaw.length; pi++) {
        var poly = polysRaw[pi];
        for (var ri = 0; ri < poly.length; ri++) {
          var raw = poly[ri];
          if (!raw || raw.length < 3) { continue; }
          var ring = unwrapRing(raw);
          var mn = ring[0][0], mx = ring[0][0], rmn = 90, rmx = -90;
          for (var k = 0; k < ring.length; k++) {
            var lon = ring[k][0], lat = ring[k][1];
            if (lon < mn) { mn = lon; }
            if (lon > mx) { mx = lon; }
            if (lat < rmn) { rmn = lat; }
            if (lat > rmx) { rmx = lat; }
            if (lat < minLat) { minLat = lat; }
            if (lat > maxLat) { maxLat = lat; }
            count++;
          }
          rings.push(ring);
          spans.push({ min: mn, max: mx, minLat: rmn, maxLat: rmx });
          closures.push(markClosureEdges(ring));
        }
      }
      if (!rings.length) { continue; }

      var stats = (window.COUNTRY_STATS && window.COUNTRY_STATS[f.properties.name]) || null;
      out.push({
        idx: out.length,
        name: f.properties.name,
        zh: stats ? stats.zh : f.properties.name,
        stats: stats,
        rings: rings,
        spans: spans,
        closures: closures,
        minLon: 180, maxLon: -180,
        minLat: minLat, maxLat: maxLat,
        count: count
      });
    }
    return applyTerritory(out);
  }

  /* ---------- 闭合边 ---------- */
  /* 极地多边形（南极洲）沿 ±180° 经线闭合到极点，这段是几何闭合用的，
     不是真实国界。填充时必须保留，否则大陆填不出来；描边时要跳过，
     否则地球上会多出一条从海岸拉到极点的竖线。

     判定：连续的一段日界线边，且这一段碰到了极点边缘。
     俄罗斯楚科奇也有一段贴着日界线的海岸，但它不接极点，所以照常描边。 */
  var DATELINE_EPS = 179.9995;
  var POLE_EPS = 89.5;

  function onDateline(a, b) {
    return (a[0] >= DATELINE_EPS || a[0] <= -DATELINE_EPS) &&
      (b[0] >= DATELINE_EPS || b[0] <= -DATELINE_EPS) &&
      (a[0] > 0) === (b[0] > 0);
  }

  function markClosureEdges(ring) {
    var n = ring.length;
    var flags = new Array(n);
    var i = 0;
    while (i < n) {
      if (!onDateline(ring[i], ring[(i + 1) % n])) { flags[i] = false; i++; continue; }
      var j = i;
      while (j < n && onDateline(ring[j], ring[(j + 1) % n])) { j++; }
      var pole = false;
      for (var k = i; k <= j && k < n; k++) {
        if (Math.abs(ring[k][1]) >= POLE_EPS) { pole = true; break; }
      }
      for (var m = i; m < j; m++) { flags[m] = pole; }
      i = j;
    }
    return flags;
  }

  /* 在闭合边处把环拆成若干开放折线 */
  function splitClosure(ring, flags) {
    var n = ring.length;
    var polys = [];
    var cur = [ring[0]];
    for (var i = 1; i < n; i++) {
      if (flags[i - 1]) {
        if (cur.length > 1) { polys.push(cur); }
        cur = [ring[i]];
      } else {
        cur.push(ring[i]);
      }
    }
    if (cur.length > 1) { polys.push(cur); }
    return polys.length ? polys : [ring];
  }

  /* ---------- 主类 ---------- */
  function ReligionMap(canvas, geo, options) {
    options = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.features = parseGeo(geo);
    this.byName = {};
    for (var i = 0; i < this.features.length; i++) {
      this.byName[this.features[i].name] = this.features[i];
    }

    this.mode = "flat";
    this.layer = "dominant";
    this.highlight = null;
    this.selected = null;
    this.hover = null;

    this.view = { lon: 8, lat: 12, zoom: 1 };
    this.rot = { lon: 16, lat: 18 };
    this.globeZoom = 1;
    this.autoRotate = true;

    this.regions = (window.REGIONS || []).slice();
    this.taoPlaces = (window.TAOISM && window.TAOISM.places) || [];
    this.lines = (window.MAP_LINES || []).slice();

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.dirty = true;
    this.dragging = false;
    this.pointers = new Map();
    this.vel = { x: 0, y: 0 };
    this.lastMove = null;
    this._lastTs = 0;
    this._oceanGradCache = null;
    this._hoverPoint = null;

    this._prepareColors();
    this._bindEvents();
    this.resize();

    var self = this;
    this._loop = function (ts) { self._tick(ts); };
    requestAnimationFrame(this._loop);
  }

  ReligionMap.prototype._prepareColors = function () {
    this.dominantCounts = {};
    for (var i = 0; i < this.features.length; i++) {
      var f = this.features[i];
      var stats = f.stats;
      var best = null, bestV = -1;
      if (stats) {
        for (var key in stats.rel) {
          if (stats.rel[key] > bestV) { bestV = stats.rel[key]; best = key; }
        }
      }
      f.dominant = best || "oth";
      f.color = (window.RELIGIONS[best] || window.RELIGIONS.oth).color;
      f.taoValue = stats ? (stats.pop || 0) * ((stats.rel.tao || 0) / 100) : 0;
      f.taoColor = taoColor(f.taoValue);
      this.dominantCounts[f.dominant] = (this.dominantCounts[f.dominant] || 0) + 1;
    }
  };

  ReligionMap.prototype._currentColor = function (f) {
    if (this.layer === "taoism") { return f.taoColor; }
    if (this.highlight && f.dominant !== this.highlight) {
      return mix(f.color, "#0a1017", 0.86);
    }
    return f.color;
  };

  /* ---------- 尺寸 ---------- */
  ReligionMap.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.width && h === this.height && dpr === this.dpr) { return; }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._oceanGradCache = null;
    this.stars = null;
    this._ensureInitialView();
    this.dirty = true;
    this.draw();
    this.dirty = false;
  };

  ReligionMap.prototype._ensureInitialView = function () {
    var portrait = this.width / this.height < 1.15;
    var target = portrait ? 1.7 : 1.02;
    if (!this._viewInitialized) {
      this.view.zoom = target;
      this._viewInitialized = true;
    }
  };

  /* ---------- 投影 ---------- */
  ReligionMap.prototype.flatScale = function () {
    return (this.width / 360) * this.view.zoom;
  };
  ReligionMap.prototype.flatXY = function (lon, lat) {
    var s = this.flatScale();
    return [
      this.width / 2 + (lon - this.view.lon) * s,
      this.height / 2 - (lat - this.view.lat) * s
    ];
  };
  ReligionMap.prototype.screenToGeo = function (x, y) {
    var s = this.flatScale();
    return {
      lon: normalizeLon(this.view.lon + (x - this.width / 2) / s),
      lat: this.view.lat - (y - this.height / 2) / s
    };
  };

  /* 限制视野，保证世界不会滑出画布 */
  ReligionMap.prototype._clampView = function () {
    var z = this.view.zoom;
    var half = 180 / z;
    var min = -180 + half;
    var max = 180 - half;
    if (max < min) { min = max = 0; }
    this.view.lon = clamp(this.view.lon, min, max);
    this.view.lat = clamp(this.view.lat, -82, 82);
  };

  /* ---------- 渲染 ---------- */
  ReligionMap.prototype._tick = function (ts) {
    if (!this._lastTs) { this._lastTs = ts; }
    var dt = Math.min(64, ts - this._lastTs);
    this._lastTs = ts;

    var need = this.dirty;

    if (this.mode === "globe" && this.autoRotate &&
      !this.dragging && this.pointers.size === 0) {
      this.rot.lon = normalizeLon(this.rot.lon + dt * 0.0023);
      need = true;
    }

    if (!this.dragging && this.pointers.size === 0 &&
      (Math.abs(this.vel.x) > 0.015 || Math.abs(this.vel.y) > 0.015)) {
      this._applyInertia(dt);
      need = true;
    }

    if (need) {
      this.draw();
      this.dirty = false;
    }
    requestAnimationFrame(this._loop);
  };

  ReligionMap.prototype._applyInertia = function (dt) {
    var k = Math.pow(0.9, dt / 16);
    this.vel.x *= k;
    this.vel.y *= k;
    if (Math.abs(this.vel.x) < 0.015) { this.vel.x = 0; }
    if (Math.abs(this.vel.y) < 0.015) { this.vel.y = 0; }
    if (!this.vel.x && !this.vel.y) { return; }

    var dx = this.vel.x * dt;
    var dy = this.vel.y * dt;
    if (this.mode === "flat") {
      var s = this.flatScale();
      this.view.lon = normalizeLon(this.view.lon - dx / s);
      this.view.lat = clamp(this.view.lat + dy / s, -82, 82);
      this._clampView();
    } else {
      var R = Math.min(this.width, this.height) * 0.40 * this.globeZoom;
      this.rot.lon = normalizeLon(this.rot.lon - (dx / R) * DEG);
      this.rot.lat = clamp(this.rot.lat + (dy / R) * DEG, -85, 85);
    }
  };

  ReligionMap.prototype.draw = function () {
    if (!this.width || !this.height) { return; }
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (this.mode === "flat") { this.drawFlat(); }
    else { this.drawGlobe(); }
  };

  ReligionMap.prototype._ocean = function () {
    if (this._oceanGradCache) { return this._oceanGradCache; }
    var w = this.width, h = this.height;
    var g = this.ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a1826");
    g.addColorStop(0.55, "#07111c");
    g.addColorStop(1, "#050b12");
    this._oceanGradCache = g;
    var rg = this.ctx.createRadialGradient(w * 0.42, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    rg.addColorStop(0, "rgba(40,84,120,.22)");
    rg.addColorStop(1, "rgba(6,12,20,0)");
    this._oceanGlowCache = rg;
    return g;
  };

  ReligionMap.prototype.drawFlat = function () {
    var ctx = this.ctx, w = this.width, h = this.height;
    var self = this;
    var s = this.flatScale();
    var viewLon = this.view.lon;

    ctx.fillStyle = this._ocean();
    ctx.fillRect(0, 0, w, h);
    if (this._oceanGlowCache) {
      ctx.fillStyle = this._oceanGlowCache;
      ctx.fillRect(0, 0, w, h);
    }

    /* 标记点用「归一化经度」定位，跨日界线的点会自动落到正确的一侧 */
    var px = function (lon) { return w / 2 + normalizeLon(lon - viewLon) * s; };
    var py = function (lat) { return h / 2 - (lat - self.view.lat) * s; };

    /* 经纬网：按当前视野取整条经纬线，避免被归一化经度掐断 */
    ctx.save();
    ctx.strokeStyle = "rgba(132,168,204,.075)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    var halfSpan = (w / 2) / s;
    var lonFrom = Math.ceil((viewLon - halfSpan) / 30) * 30;
    var lonTo = viewLon + halfSpan;
    for (var lon = lonFrom; lon <= lonTo; lon += 30) {
      var mx = w / 2 + (lon - viewLon) * s;
      ctx.moveTo(mx, py(90));
      ctx.lineTo(mx, py(-90));
    }
    for (var lat = -60; lat <= 60; lat += 30) {
      ctx.moveTo(0, py(lat));
      ctx.lineTo(w, py(lat));
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(216,178,95,.14)";
    ctx.beginPath();
    ctx.moveTo(0, py(0));
    ctx.lineTo(w, py(0));
    ctx.stroke();
    ctx.restore();

    /* 国家 */
    for (var i = 0; i < this.features.length; i++) {
      var f = this.features[i];
      ctx.beginPath();
      if (!this._pathFlatFeature(ctx, f)) { continue; }
      ctx.fillStyle = this._currentColor(f);
      ctx.fill("evenodd");
      /* 描边单独走一条路径：闭合边（南极洲沿日界线闭合到极点的那段）不算国界 */
      ctx.beginPath();
      this._pathFlatFeature(ctx, f, true);
      ctx.strokeStyle = "rgba(5,10,16,.72)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    /* 悬停 / 选中描边 */
    if (this.hover && this.hover.type === "country" && this.hover.feature) {
      this._strokeFeature(ctx, this.hover.feature, "rgba(255,255,255,.55)", 1);
    }
    if (this.selected) {
      var sel = this.byName[this.selected];
      if (sel) { this._strokeFeature(ctx, sel, "#e6c879", 1.7); }
    }

    this._drawFlatLines();
    this._drawFlatLabels(px, py);
    this._drawMarkers(px, py, 0);

    /* 边缘暗角 */
    var vg = ctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, "rgba(3,7,12,.35)");
    vg.addColorStop(0.12, "rgba(3,7,12,0)");
    vg.addColorStop(0.9, "rgba(3,7,12,0)");
    vg.addColorStop(1, "rgba(3,7,12,.4)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  };

  /* 把一个国家所有环的「可见副本」加入当前路径。
     环的经度已展开成连续序列，这里按 ±360° 平移，取落在画布内的那些副本，
     跨日界线的部分就会同时出现在地图左右两侧。返回是否画到了东西。
     skipClosure 为真时断开闭合边（只在描边时用，填充必须闭合）。 */
  ReligionMap.prototype._pathFlatFeature = function (ctx, f, skipClosure) {
    var w = this.width, h = this.height;
    var s = this.flatScale();
    var viewLon = this.view.lon;
    var viewLat = this.view.lat;
    var vlo = viewLon - (w / 2) / s;
    var vhi = viewLon + (w / 2) / s;
    var drew = false;

    for (var r = 0; r < f.rings.length; r++) {
      var ring = f.rings[r];
      var span = f.spans[r];
      var flags = skipClosure ? (f.closures && f.closures[r]) : null;
      var kFrom = Math.floor((vlo - span.max) / 360);
      var kTo = Math.ceil((vhi - span.min) / 360);
      for (var k = kFrom; k <= kTo; k++) {
        var off = k * 360;
        var x0 = w / 2 + (span.min + off - viewLon) * s;
        var x1 = w / 2 + (span.max + off - viewLon) * s;
        if (x1 < -40 || x0 > w + 40) { continue; }
        drew = true;
        for (var i = 0; i < ring.length; i++) {
          var x = w / 2 + (ring[i][0] + off - viewLon) * s;
          var y = h / 2 - (ring[i][1] - viewLat) * s;
          if (i === 0 || (flags && flags[i - 1])) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
      }
    }
    return drew;
  };

  /* 线要素（如中国南海海域断续线）：平面视图按虚线画出 */
  ReligionMap.prototype._drawFlatLines = function () {
    if (!this.lines.length) { return; }
    var ctx = this.ctx, w = this.width, h = this.height;
    var s = this.flatScale();
    var viewLon = this.view.lon;
    ctx.save();
    ctx.strokeStyle = "rgba(235,217,166,.72)";
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.setLineDash([5, 4]);
    for (var i = 0; i < this.lines.length; i++) {
      var segs = this.lines[i].coords || [];
      for (var k = 0; k < segs.length; k++) {
        var seg = segs[k];
        ctx.beginPath();
        for (var j = 0; j < seg.length; j++) {
          var x = w / 2 + normalizeLon(seg[j][0] - viewLon) * s;
          var y = h / 2 - (seg[j][1] - this.view.lat) * s;
          if (j === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* 线要素：球面视图，按经度加密后投影，背面不画 */
  ReligionMap.prototype._drawGlobeLines = function () {
    if (!this.lines.length || !this.R) { return; }
    var ctx = this.ctx, cx = this.gcx, cy = this.gcy, R = this.R;
    ctx.save();
    ctx.strokeStyle = "rgba(235,217,166,.8)";
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    ctx.setLineDash([4, 3]);
    for (var i = 0; i < this.lines.length; i++) {
      var segs = this.lines[i].coords || [];
      for (var k = 0; k < segs.length; k++) {
        var seg = segs[k];
        ctx.beginPath();
        var pen = false;
        for (var j = 0; j < seg.length - 1; j++) {
          var a = seg[j], b = seg[j + 1];
          var steps = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 2));
          for (var t = 0; t <= steps; t++) {
            var lon = a[0] + (b[0] - a[0]) * t / steps;
            var lat = a[1] + (b[1] - a[1]) * t / steps;
            var p = this.project(lat, lon);
            if (p[2] < 0) { pen = false; continue; }
            var x = cx + R * p[0], y = cy - R * p[1];
            if (!pen) { ctx.moveTo(x, y); pen = true; } else { ctx.lineTo(x, y); }
          }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  ReligionMap.prototype._strokeFeature = function (ctx, f, color, width) {
    ctx.beginPath();
    if (!this._pathFlatFeature(ctx, f, true)) { return; }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  ReligionMap.prototype._drawFlatLabels = function (px, py) {
    if (this.view.zoom < 1.25) { return; }
    var ctx = this.ctx, w = this.width, h = this.height;
    var s = this.flatScale();
    var list = [];
    for (var i = 0; i < this.features.length; i++) {
      var f = this.features[i];
      var bw = (f.main.max - f.main.min) * s;
      var bh = (f.main.maxLat - f.main.minLat) * s;
      if (bw < 26 || bh < 12) { continue; }
      var p = [px(f.center[0]), py(f.center[1])];
      if (p[0] < 10 || p[0] > w - 10 || p[1] < 10 || p[1] > h - 10) { continue; }
      list.push({ f: f, x: p[0], y: p[1], score: bw * bh, big: bw > 180 && bh > 90 });
    }
    list.sort(function (a, b) { return b.score - a.score; });
    var placed = [];
    var max = 70;
    for (var j = 0; j < list.length && j < max; j++) {
      var it = list[j];
      var label = it.f.zh;
      var fs = it.big ? 12 : 10.5;
      ctx.font = "600 " + fs + 'px "PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
      var tw = ctx.measureText(label).width;
      var rect = [it.x - tw / 2 - 3, it.y - fs, tw + 6, fs + 4];
      /* 文字放不下就整条不画：半截字既难看，也会压到地图工具按钮上 */
      if (rect[0] < 2 || rect[0] + rect[2] > w - 2 || rect[1] < 2 || rect[1] + rect[3] > h - 2) { continue; }
      var clash = false;
      for (var q = 0; q < placed.length; q++) {
        var rr = placed[q];
        if (rect[0] < rr[0] + rr[2] && rect[0] + rect[2] > rr[0] &&
          rect[1] < rr[1] + rr[3] && rect[1] + rect[3] > rr[1]) { clash = true; break; }
      }
      if (clash) { continue; }
      placed.push(rect);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(5,10,16,.85)";
      ctx.strokeText(label, it.x, it.y);
      ctx.fillStyle = "rgba(235,232,222,.8)";
      ctx.fillText(label, it.x, it.y);
    }
  };

  /* ---------- 标记点 ---------- */
  ReligionMap.prototype._markerList = function () {
    if (this.layer === "taoism") {
      return this.taoPlaces.map(function (p) {
        return { kind: "tao", name: p.name, lat: p.lat, lon: p.lon, weight: p.followers || 1, data: p };
      });
    }
    return this.regions.map(function (r) {
      return { kind: "region", name: r.name, lat: r.lat, lon: r.lon, weight: 1, data: r };
    });
  };

  ReligionMap.prototype._drawMarkers = function (px, py, mode) {
    var list = this._markerList();
    var ctx = this.ctx, w = this.width, h = this.height;
    var showLabels = this.view.zoom >= 2.6 || (this.mode === "globe" && this.globeZoom >= 2.1);
    if (this.view.zoom < 1.9 && this.mode === "flat") { return; }
    if (this.mode === "globe" && this.globeZoom < 1.45) { return; }

    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var p;
      if (mode === "globe") {
        var pr = this.project(it.lat, it.lon);
        if (pr[2] <= 0.02) { continue; }
        p = [this.gcx + this.R * pr[0], this.gcy - this.R * pr[1]];
      } else {
        p = px(it.lon, it.lat);
      }
      if (p[0] < -40 || p[0] > w + 40 || p[1] < -40 || p[1] > h + 40) { continue; }

      var gold = it.kind === "tao";
      var baseR = gold ? clamp(2.2 + Math.log10((it.weight || 1) + 1) * 1.1, 2.6, 5.4) : 2.6;
      var rr = baseR + 3.4;

      ctx.beginPath();
      ctx.arc(p[0], p[1], rr, 0, TAU);
      ctx.fillStyle = gold ? "rgba(216,178,95,.13)" : "rgba(216,178,95,.10)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p[0], p[1], baseR, 0, TAU);
      ctx.fillStyle = gold ? "#e9c977" : "#d8b25f";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(10,15,22,.85)";
      ctx.stroke();

      if (showLabels) {
        ctx.font = '600 10px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(5,10,16,.9)";
        ctx.strokeText(it.name, p[0] + rr + 3, p[1]);
        ctx.fillStyle = gold ? "rgba(240,217,164,.92)" : "rgba(230,226,214,.85)";
        ctx.fillText(it.name, p[0] + rr + 3, p[1]);
      }
      it._x = p[0];
      it._y = p[1];
    }
  };

  /* ---------- 3D 地球 ---------- */
  ReligionMap.prototype.project = function (lat, lon) {
    var phi = lat * RAD;
    var lam = (lon - this.rot.lon) * RAD;
    var phi0 = this.rot.lat * RAD;
    var cp = Math.cos(phi), sp = Math.sin(phi);
    var x1 = cp * Math.sin(lam);
    var y1 = sp;
    var z1 = cp * Math.cos(lam);
    var cp0 = Math.cos(phi0), sp0 = Math.sin(phi0);
    var y2 = y1 * cp0 - z1 * sp0;
    var z2 = z1 * cp0 + y1 * sp0;
    return [x1, y2, z2];
  };

  ReligionMap.prototype.unproject = function (x, y) {
    var R = this.R;
    if (!R) { return null; }
    var sx = (x - this.gcx) / R;
    var sy = -(y - this.gcy) / R;
    var r2 = sx * sx + sy * sy;
    if (r2 > 1) { return null; }
    var z2 = Math.sqrt(1 - r2);
    var phi0 = this.rot.lat * RAD;
    var cp0 = Math.cos(phi0), sp0 = Math.sin(phi0);
    var y1 = sy * cp0 + z2 * sp0;
    var z1 = z2 * cp0 - sy * sp0;
    return {
      lon: normalizeLon(Math.atan2(sx, z1) * DEG + this.rot.lon),
      lat: Math.asin(clamp(y1, -1, 1)) * DEG
    };
  };

  ReligionMap.prototype._makeStars = function () {
    var n = 170;
    this.stars = [];
    var seed = 20261111;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    for (var i = 0; i < n; i++) {
      this.stars.push({
        x: rnd() * this.width,
        y: rnd() * this.height,
        r: rnd() * 1.15 + 0.15,
        a: rnd() * 0.5 + 0.08
      });
    }
  };

  ReligionMap.prototype.drawGlobe = function () {
    var ctx = this.ctx, w = this.width, h = this.height;
    var R = Math.min(w, h) * 0.40 * this.globeZoom;
    this.R = R;
    var cx = this.gcx = w / 2;
    var cy = this.gcy = h / 2;

    var bg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    bg.addColorStop(0, "#08131f");
    bg.addColorStop(1, "#03070c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!this.stars) { this._makeStars(); }
    for (var i = 0; i < this.stars.length; i++) {
      var st = this.stars[i];
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fillStyle = "rgba(210,225,245," + st.a + ")";
      ctx.fill();
    }

    /* 大气光晕 */
    var glow = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.26);
    glow.addColorStop(0, "rgba(70,135,200,0)");
    glow.addColorStop(0.45, "rgba(76,146,215,.18)");
    glow.addColorStop(0.72, "rgba(70,130,190,.07)");
    glow.addColorStop(1, "rgba(60,110,170,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.27, 0, TAU);
    ctx.fillStyle = glow;
    ctx.fill();

    /* 海洋球面 */
    var og = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.38, R * 0.05, cx, cy, R * 1.06);
    og.addColorStop(0, "#23485f");
    og.addColorStop(0.42, "#143246");
    og.addColorStop(0.78, "#0a1b28");
    og.addColorStop(1, "#040b12");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = og;
    ctx.fill();

    /* 经纬网 */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = "rgba(130,172,212,.13)";
    ctx.lineWidth = 0.75;
    this._drawGraticule(ctx, false);
    ctx.restore();

    /* 国家 */
    var self = this;
    for (var fi = 0; fi < this.features.length; fi++) {
      var f = this.features[fi];
      var any = false;
      ctx.beginPath();
      for (var r = 0; r < f.rings.length; r++) {
        var ring = f.rings[r];
        var pts = new Array(ring.length);
        for (var k = 0; k < ring.length; k++) {
          pts[k] = this.project(ring[k][1], ring[k][0]);
        }
        var clipped = this._clipRing(pts);
        if (clipped.length < 3) { continue; }
        ctx.moveTo(cx + R * clipped[0][0], cy - R * clipped[0][1]);
        for (var q = 1; q < clipped.length; q++) {
          ctx.lineTo(cx + R * clipped[q][0], cy - R * clipped[q][1]);
        }
        any = true;
      }
      if (!any) { continue; }
      ctx.fillStyle = this._currentColor(f);
      ctx.fill("evenodd");
      /* 描边单独走一条路径：闭合边（南极洲沿日界线闭合到极点的那段）不算国界 */
      this._strokeGlobeFeature(ctx, f, "rgba(4,9,14,.72)", 0.55);
    }

    /* 光照 */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    var sh = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.46, R * 0.05, cx, cy, R * 1.08);
    sh.addColorStop(0, "rgba(255,255,255,.16)");
    sh.addColorStop(0.34, "rgba(255,255,255,.04)");
    sh.addColorStop(0.62, "rgba(0,0,0,.05)");
    sh.addColorStop(0.86, "rgba(0,0,0,.38)");
    sh.addColorStop(1, "rgba(0,0,0,.68)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* 边缘 */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = "rgba(150,196,240,.32)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (this.selected) {
      var sel = this.byName[this.selected];
      if (sel) { this._strokeGlobeFeature(ctx, sel, "rgba(233,201,119,.9)", 1.4); }
    }
    if (this.hover && this.hover.type === "country" && this.hover.feature) {
      this._strokeGlobeFeature(ctx, this.hover.feature, "rgba(255,255,255,.5)", 1);
    }

    this._drawGlobeLabels(ctx, cx, cy, R);
    this._drawGlobeLines();
    this._drawMarkers(function (lon, lat) {
      var p = self.project(lat, lon);
      return [cx + R * p[0], cy - R * p[1]];
    }, null, "globe");
  };

  ReligionMap.prototype._clipRing = function (pts) {
    var out = [];
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i];
      var b = pts[(i + 1) % n];
      var ain = a[2] >= 0;
      var bin = b[2] >= 0;
      if (ain) { out.push([a[0], a[1]]); }
      if (ain !== bin) {
        var t = a[2] / (a[2] - b[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };

  /* 开放折线的球面裁剪：与 _clipRing 相同，但不把末点接回首点 */
  ReligionMap.prototype._clipOpen = function (pts) {
    var out = [];
    var n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var a = pts[i];
      var b = pts[i + 1];
      var ain = a[2] >= 0;
      var bin = b[2] >= 0;
      if (ain) { out.push([a[0], a[1]]); }
      if (ain !== bin) {
        var t = a[2] / (a[2] - b[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (n && pts[n - 1][2] >= 0) { out.push([pts[n - 1][0], pts[n - 1][1]]); }
    return out;
  };

  /* 开放折线裁剪（避免经纬线闭合产生穿过球面的假线） */
  ReligionMap.prototype._clipLine = function (pts) {
    var segs = [], cur = [];
    function interp(a, b) {
      var t = a[2] / (a[2] - b[2]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var ain = a[2] >= 0, bin = b[2] >= 0;
      if (ain && bin) {
        if (!cur.length) { cur.push([a[0], a[1]]); }
        cur.push([b[0], b[1]]);
      } else if (ain && !bin) {
        if (!cur.length) { cur.push([a[0], a[1]]); }
        cur.push(interp(a, b));
        segs.push(cur); cur = [];
      } else if (!ain && bin) {
        if (cur.length) { segs.push(cur); cur = []; }
        cur.push(interp(a, b));
        cur.push([b[0], b[1]]);
      } else if (cur.length) {
        segs.push(cur); cur = [];
      }
    }
    if (cur.length > 1) { segs.push(cur); }
    return segs;
  };

  ReligionMap.prototype._strokeGlobeFeature = function (ctx, f, color, width) {
    var cx = this.gcx, cy = this.gcy, R = this.R, any = false;
    ctx.beginPath();
    for (var r = 0; r < f.rings.length; r++) {
      var flags = f.closures ? f.closures[r] : null;
      var polys = flags ? splitClosure(f.rings[r], flags) : [f.rings[r]];
      for (var pi = 0; pi < polys.length; pi++) {
        var ring = polys[pi];
        var pts = new Array(ring.length);
        for (var k = 0; k < ring.length; k++) {
          pts[k] = this.project(ring[k][1], ring[k][0]);
        }
        var clipped = this._clipOpen(pts);
        if (clipped.length < 3) { continue; }
        ctx.moveTo(cx + R * clipped[0][0], cy - R * clipped[0][1]);
        for (var q = 1; q < clipped.length; q++) {
          ctx.lineTo(cx + R * clipped[q][0], cy - R * clipped[q][1]);
        }
        any = true;
      }
    }
    if (!any) { return; }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  ReligionMap.prototype._drawGraticule = function (ctx) {
    var cx = this.gcx, cy = this.gcy, R = this.R;
    var k, s, seg, segs;
    function paint(segs) {
      for (var q = 0; q < segs.length; q++) {
        var seg = segs[q];
        if (seg.length < 2) { continue; }
        ctx.beginPath();
        ctx.moveTo(cx + R * seg[0][0], cy - R * seg[0][1]);
        for (var m = 1; m < seg.length; m++) {
          ctx.lineTo(cx + R * seg[m][0], cy - R * seg[m][1]);
        }
        ctx.stroke();
      }
    }
    for (var lon = -180; lon < 180; lon += 30) {
      var pts = [];
      for (var lat = -90; lat <= 90; lat += 4) {
        pts.push(this.project(lat, lon));
      }
      paint(this._clipLine(pts));
    }
    for (var lat2 = -60; lat2 <= 60; lat2 += 30) {
      var pts2 = [];
      for (var lon2 = -180; lon2 <= 180; lon2 += 4) {
        pts2.push(this.project(lat2, lon2));
      }
      paint(this._clipLine(pts2));
    }
  };

  ReligionMap.prototype._drawGlobeLabels = function (ctx, cx, cy, R) {
    if (this.globeZoom < 1.6) { return; }
    var placed = [];
    var list = [];
    for (var i = 0; i < this.features.length; i++) {
      var f = this.features[i];
      var best = null;
      var bestZ = -2;
      var m = f.main;
      for (var lon = m.min; lon <= m.max; lon += Math.max(5, (m.max - m.min) / 6)) {
        for (var lat = m.minLat; lat <= m.maxLat; lat += Math.max(5, (m.maxLat - m.minLat) / 5)) {
          var p = this.project(lat, lon);
          if (p[2] > bestZ) { bestZ = p[2]; best = p; }
        }
      }
      if (!best || best[2] < 0.15) { continue; }
      var area = f.area || 1;
      list.push({
        f: f, x: cx + R * best[0], y: cy - R * best[1],
        score: area * best[2]
      });
    }
    list.sort(function (a, b) { return b.score - a.score; });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (var j = 0; j < list.length && j < 40; j++) {
      var it = list[j];
      var label = it.f.zh;
      var fs = it.score > 800 ? 12 : 10.5;
      ctx.font = "600 " + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      var tw = ctx.measureText(label).width;
      var rect = [it.x - tw / 2 - 3, it.y - fs, tw + 6, fs + 4];
      if (rect[0] < 0 || rect[1] < 0 || rect[0] + rect[2] > this.width || rect[1] + rect[3] > this.height) { continue; }
      var clash = false;
      for (var q = 0; q < placed.length; q++) {
        var rr = placed[q];
        if (rect[0] < rr[0] + rr[2] && rect[0] + rect[2] > rr[0] &&
          rect[1] < rr[1] + rr[3] && rect[1] + rect[3] > rr[1]) { clash = true; break; }
      }
      if (clash) { continue; }
      placed.push(rect);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(3,7,12,.9)";
      ctx.strokeText(label, it.x, it.y);
      ctx.fillStyle = "rgba(235,232,222,.78)";
      ctx.fillText(label, it.x, it.y);
    }
  };

  /* ---------- 命中检测 ---------- */
  ReligionMap.prototype.markerAt = function (x, y) {
    if (this.mode === "flat" && this.view.zoom < 1.9) { return null; }
    if (this.mode === "globe" && this.globeZoom < 1.45) { return null; }
    var list = this._markerList();
    var best = null, bd = 15 * 15;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var p;
      if (this.mode === "globe") {
        var pr = this.project(it.lat, it.lon);
        if (pr[2] <= 0.02) { continue; }
        p = [this.gcx + this.R * pr[0], this.gcy - this.R * pr[1]];
      } else {
        p = this.flatXY(it.lon, it.lat);
      }
      var dx = p[0] - x, dy = p[1] - y;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  };

  ReligionMap.prototype.countryAt = function (x, y) {
    var geo;
    if (this.mode === "flat") {
      geo = this.screenToGeo(x, y);
    } else {
      geo = this.unproject(x, y);
      if (!geo) { return null; }
    }
    for (var i = this.features.length - 1; i >= 0; i--) {
      var f = this.features[i];
      if (!inBbox(geo.lon, geo.lat, f.bbox) &&
        !inBbox(geo.lon + 360, geo.lat, f.bbox) &&
        !inBbox(geo.lon - 360, geo.lat, f.bbox)) { continue; }
      if (pointInRings(geo.lon, geo.lat, f.rings) ||
        pointInRings(geo.lon + 360, geo.lat, f.rings) ||
        pointInRings(geo.lon - 360, geo.lat, f.rings)) {
        return f;
      }
    }
    return null;
  };

  ReligionMap.prototype.hit = function (x, y) {
    var m = this.markerAt(x, y);
    if (m) {
      if (m.kind === "tao") { return { type: "tao-place", place: m.data, x: x, y: y }; }
      return { type: "region", region: m.data, x: x, y: y };
    }
    var f = this.countryAt(x, y);
    if (f) {
      return { type: "country", feature: f, name: f.name, zh: f.zh, x: x, y: y };
    }
    return null;
  };

  /* ---------- 交互 ---------- */
  ReligionMap.prototype._bindEvents = function () {
    var self = this;
    var canvas = this.canvas;

    canvas.addEventListener("pointerdown", function (e) {
      canvas.setPointerCapture(e.pointerId);
      self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      self.vel.x = self.vel.y = 0;
      self.lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (self.pointers.size === 1) {
        self.dragging = true;
        self.moved = 0;
        canvas.classList.add("is-grabbing");
      } else if (self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        self.pinch = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          mx: (pts[0].x + pts[1].x) / 2,
          my: (pts[0].y + pts[1].y) / 2
        };
      }
    });

    canvas.addEventListener("pointermove", function (e) {
      if (self.pointers.has(e.pointerId)) {
        var prev = self.pointers.get(e.pointerId);
        self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (self.pointers.size === 2) {
          var pts = Array.from(self.pointers.values());
          var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          var mx = (pts[0].x + pts[1].x) / 2;
          var my = (pts[0].y + pts[1].y) / 2;
          if (self.pinch && self.pinch.dist > 0) {
            var rect = canvas.getBoundingClientRect();
            var factor = dist / self.pinch.dist;
            self.zoomAt(factor, mx - rect.left, my - rect.top);
            self.panBy(mx - self.pinch.mx, my - self.pinch.my);
          }
          self.pinch = { dist: dist, mx: mx, my: my };
          self.moved += 10;
          return;
        }

        if (!self.dragging) { return; }
        var dx = e.clientX - prev.x;
        var dy = e.clientY - prev.y;
        self.moved += Math.abs(dx) + Math.abs(dy);
        self.panBy(dx, dy);

        var now = performance.now();
        if (self.lastMove) {
          var dt = Math.max(1, now - self.lastMove.t);
          self.vel.x = (e.clientX - self.lastMove.x) / dt;
          self.vel.y = (e.clientY - self.lastMove.y) / dt;
        }
        self.lastMove = { x: e.clientX, y: e.clientY, t: now };
      } else if (e.pointerType === "mouse") {
        var r = canvas.getBoundingClientRect();
        self._hoverAt(e.clientX - r.left, e.clientY - r.top);
      }
    });

    function endPointer(e) {
      if (!self.pointers.has(e.pointerId)) { return; }
      var wasSingle = self.pointers.size === 1;
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) { self.pinch = null; }
      if (self.pointers.size === 0) {
        self.dragging = false;
        canvas.classList.remove("is-grabbing");
        if (wasSingle && self.moved < 6) {
          var rect = canvas.getBoundingClientRect();
          var hx = e.clientX - rect.left, hy = e.clientY - rect.top;
          var hit = self.hit(hx, hy);
          if (hit) {
            self.selected = hit.type === "country" ? hit.name : self.selected;
            self.dirty = true;
            canvas.dispatchEvent(new CustomEvent("mapselect", { detail: hit, bubbles: true }));
          } else {
            canvas.dispatchEvent(new CustomEvent("mapselect", { detail: null, bubbles: true }));
          }
        }
        var now = performance.now();
        if (self.lastMove && now - self.lastMove.t > 90) {
          self.vel.x = self.vel.y = 0;
        }
      }
    }

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);

    canvas.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse" && !self.dragging) {
        self.hover = null;
        self.dirty = true;
        canvas.dispatchEvent(new CustomEvent("maphover", { detail: null, bubbles: true }));
      }
    });

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
      self.zoomAt(factor, x, y);
    }, { passive: false });

    canvas.addEventListener("dblclick", function (e) {
      var rect = canvas.getBoundingClientRect();
      self.zoomAt(1.7, e.clientX - rect.left, e.clientY - rect.top, true);
    });
  };

  ReligionMap.prototype._hoverAt = function (x, y) {
    var hit = this.hit(x, y);
    var same = false;
    if (!hit && !this.hover) { same = true; }
    else if (hit && this.hover) {
      same = (hit.type === this.hover.type) &&
        (hit.type === "country" ? hit.name === this.hover.name :
          (hit.type === "region" ? hit.region.id === this.hover.region.id : hit.place === this.hover.place));
    }
    if (same) { return; }
    this.hover = hit;
    this.dirty = true;
    this.canvas.dispatchEvent(new CustomEvent("maphover", { detail: hit, bubbles: true }));
  };

  ReligionMap.prototype.panBy = function (dx, dy) {
    if (this.mode === "flat") {
      var s = this.flatScale();
      this.view.lon = normalizeLon(this.view.lon - dx / s);
      this.view.lat = clamp(this.view.lat + dy / s, -82, 82);
      this._clampView();
    } else {
      var R = Math.min(this.width, this.height) * 0.40 * this.globeZoom;
      this.rot.lon = normalizeLon(this.rot.lon - (dx / R) * DEG);
      this.rot.lat = clamp(this.rot.lat + (dy / R) * DEG, -85, 85);
    }
    this.dirty = true;
  };

  ReligionMap.prototype.zoomAt = function (factor, x, y, absolute) {
    if (this.mode === "flat") {
      var before = this.screenToGeo(x, y);
      var minZ = 1, maxZ = 42;
      var z = clamp(this.view.zoom * factor, minZ, maxZ);
      if (z === this.view.zoom) { return; }
      this.view.zoom = z;
      var after = this.screenToGeo(x, y);
      var dLon = normalizeLon(before.lon - after.lon);
      this.view.lon = normalizeLon(this.view.lon + dLon);
      this.view.lat = clamp(this.view.lat + (before.lat - after.lat), -82, 82);
    } else {
      this.globeZoom = clamp(this.globeZoom * factor, 0.85, 14);
    }
    this.dirty = true;
  };

  /* 供 UI 调用 */
  ReligionMap.prototype.zoomIn = function () {
    this.zoomAt(1.45, this.width / 2, this.height / 2);
  };
  ReligionMap.prototype.zoomOut = function () {
    this.zoomAt(1 / 1.45, this.width / 2, this.height / 2);
  };

  ReligionMap.prototype.getZoom = function () {
    return this.mode === "flat" ? this.view.zoom : this.globeZoom;
  };

  ReligionMap.prototype.resetView = function () {
    if (this.mode === "flat") {
      this.view.lon = 16;
      this.view.lat = 18;
      this.view.zoom = this.width / this.height < 1.15 ? 1.7 : 1.02;
    } else {
      this.rot.lon = 16;
      this.rot.lat = 18;
      this.globeZoom = 1;
    }
    this.selected = null;
    this.dirty = true;
  };

  ReligionMap.prototype.setMode = function (mode) {
    if (mode === this.mode) { return; }
    this.mode = mode;
    this.hover = null;
    this.dirty = true;
  };

  ReligionMap.prototype.setLayer = function (layer) {
    this.layer = layer;
    this.hover = null;
    this.dirty = true;
  };

  ReligionMap.prototype.setHighlight = function (religion) {
    this.highlight = religion;
    this.dirty = true;
  };

  ReligionMap.prototype.setSelected = function (name) {
    this.selected = name;
    this.dirty = true;
  };

  ReligionMap.prototype.focusCountry = function (name) {
    var f = this.byName[name];
    if (!f) { return false; }
    var b = f.bbox;
    var lon = (b[0] + b[2]) / 2;
    var lat = (b[1] + b[3]) / 2;
    if (b[2] - b[0] > 200) { lon = 100; }
    if (this.mode === "flat") {
      var spanLon = Math.max(8, (b[2] - b[0]) * 1.9);
      var spanLat = Math.max(8, (b[3] - b[1]) * 2.4);
      var zLon = 0.66 * 360 / spanLon;
      var zLat = 0.66 * 360 * (this.height / this.width) / spanLat;
      var z = clamp(Math.min(zLon, zLat), 1.6, 14);
      this.view.lon = normalizeLon(lon);
      this.view.lat = clamp(lat, -78, 78);
      this.view.zoom = z;
    } else {
      this.rot.lon = normalizeLon(lon);
      this.rot.lat = clamp(lat, -72, 72);
      this.globeZoom = Math.max(this.globeZoom, 2.6);
    }
    this.selected = name;
    this.dirty = true;
    return true;
  };

  ReligionMap.prototype.focusRegion = function (lat, lon) {
    if (this.mode === "flat") {
      this.view.lon = normalizeLon(lon);
      this.view.lat = clamp(lat, -78, 78);
      this.view.zoom = Math.max(this.view.zoom, 5.2);
    } else {
      this.rot.lon = normalizeLon(lon);
      this.rot.lat = clamp(lat, -72, 72);
      this.globeZoom = Math.max(this.globeZoom, 5);
    }
    this.dirty = true;
  };

  ReligionMap.prototype.toScreen = function (lat, lon) {
    if (this.mode === "flat") { return this.flatXY(lon, lat); }
    var p = this.project(lat, lon);
    if (p[2] <= 0) { return null; }
    return [this.gcx + this.R * p[0], this.gcy - this.R * p[1]];
  };

  window.ReligionMap = ReligionMap;
  window.MAP_UTIL = { normalizeLon: normalizeLon, clamp: clamp };
})();
