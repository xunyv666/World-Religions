/* =========================================================
   界面逻辑 · 世界宗教地图
   ========================================================= */
(function () {
  "use strict";

  var REL = window.RELIGIONS;
  var ORDER = window.RELIGION_ORDER;
  var STATS = window.COUNTRY_STATS;
  var HISTORY = window.COUNTRY_HISTORY;
  var REGIONS = window.REGIONS;
  var FAITHS = window.FAITH_DIST || {};
  var SPREAD = window.SPREAD || {};
  var ARRIVAL = window.ARRIVAL || {};
  var DENSITY_KEYS = ["bud", "chr", "isl", "tao"];

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtPct(v) {
    if (v == null) { return "—"; }
    var s = v.toFixed(1);
    return (s.indexOf(".0") > -1 ? s.slice(0, -2) : s) + "%";
  }
  function fmtPop(m) {
    if (!m) { return "—"; }
    if (m >= 100) { return (m / 100).toFixed(2).replace(/\.?0+$/, "") + " 亿"; }
    if (m >= 1) { return Math.round(m * 100).toLocaleString("zh-CN") + " 万"; }
    if (m >= 0.01) { return Math.round(m * 100).toLocaleString("zh-CN") + " 万"; }
    return Math.round(m * 1000000).toLocaleString("zh-CN") + " 人";
  }
  function fmtFollowers(m) {
    if (!m) { return "—"; }
    if (m >= 100) { return (m / 100).toFixed(2).replace(/\.?0+$/, "") + " 亿"; }
    if (m >= 1) { return Math.round(m * 100).toLocaleString("zh-CN") + " 万"; }
    if (m >= 0.1) { return (m * 100).toFixed(1).replace(/\.0$/, "") + " 万"; }
    return Math.round(m * 1000).toLocaleString("zh-CN") + " 千";
  }
  /* 年份显示：负数为公元前 */
  function fmtYear(y) {
    y = Math.round(y);
    if (y < 0) { return "公元前 " + Math.abs(y) + " 年"; }
    return "公元 " + y + " 年";
  }
  function normRel(rel) {
    var sum = 0, k;
    for (k in rel) { sum += rel[k] || 0; }
    if (!sum) { sum = 1; }
    var out = {};
    for (k in rel) { out[k] = (rel[k] || 0) / sum * 100; }
    return out;
  }
  function sortedRel(rel) {
    return Object.keys(rel)
      .filter(function (k) { return rel[k] > 0; })
      .sort(function (a, b) { return rel[b] - rel[a]; });
  }
  function topKey(rel) {
    return sortedRel(rel)[0] || "irr";
  }

  /* ---------- 状态 ---------- */
  var state = {
    layer: "dominant",
    densityKey: "tao",
    mode: "flat",
    selectedCountry: null,
    detailMode: null,
    detailFaith: null,
    highlight: null,
    spreadKey: null,
    spreadYear: 0,
    playing: false
  };

  var stage = $("#stage");
  var tooltip = $("#tooltip");
  var detail = $("#detail");
  var detailInner = $("#detailInner");

  /* ---------- 初始化地图 ---------- */
  var map = null;
  var mapReady = false;

  function boot() {
    var canvas = $("#map");
    try {
      map = new window.ReligionMap(canvas, window.WORLD_GEO);
    } catch (err) {
      console.error("地图初始化失败", err);
      $("#loading").innerHTML = '<p style="color:#e08a8a">地图初始化失败：' + esc(err.message) + "</p>";
      return;
    }
    mapReady = true;
    window.__map = map;

    var ro = new ResizeObserver(function () { map.resize(); });
    ro.observe(canvas);

    buildLegend();
    buildDensityChips();
    buildRegionList();
    buildSpreadTabs();
    bindUI();
    bindMapEvents();
    applyLayer("dominant", true);
    applyMode("flat", true);

    var skipIntro = /[?&](skipintro|nostart)/.test(location.search);
    if (skipIntro) { hideWelcome(); }

    var finishLoading = function () {
      var el = $("#loading");
      if (el) { el.classList.add("is-done"); }
    };
    requestAnimationFrame(function () {
      requestAnimationFrame(finishLoading);
    });
    setTimeout(finishLoading, 1500);

    applyHash();
    setTimeout(updateZoomReadout, 80);
    setInterval(updateZoomReadout, 240);
    registerSW();
    validateData();
  }

  /* ---------- 数据自检 ---------- */
  function validateData() {
    var missing = 0, bad = 0;
    map.features.forEach(function (f) {
      var s = STATS[f.name];
      if (!s) { missing++; return; }
      var sum = 0;
      for (var k in s.rel) { sum += s.rel[k]; }
      if (Math.abs(sum - 100) > 2.5) {
        bad++;
        if (window.console) { console.warn("宗教比例总和异常：" + f.name + " = " + sum.toFixed(1)); }
      }
    });
    if (missing) { console.warn("缺少宗教数据的国家：" + missing); }
    if (bad) { console.warn("比例总和异常的国家数：" + bad); }
  }

  /* ---------- 图例 ---------- */
  function buildLegend() {
    var counts = {};
    map.features.forEach(function (f) {
      counts[f.dominant] = (counts[f.dominant] || 0) + 1;
    });
    var max = 1;
    ORDER.forEach(function (k) { if ((counts[k] || 0) > max) { max = counts[k] || 0; } });
    var wrap = $("#legend");
    wrap.innerHTML = "";
    ORDER.forEach(function (key) {
      var r = REL[key];
      if (!r) { return; }
      var n = counts[key] || 0;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "legend-item";
      b.dataset.key = key;
      b.style.setProperty("--c", r.color);
      b.innerHTML = '<span class="legend-swatch"></span>' +
        '<span class="legend-name">' + esc(r.name) + "</span>" +
        '<span class="legend-stat"><i style="width:' + (n / max * 100).toFixed(1) + '%"></i>' +
        "<b>" + n + "</b></span>";
      b.addEventListener("click", function () {
        var next = state.highlight === key ? null : key;
        if (next) { applyLayer("dominant"); }
        state.highlight = next;
        map.setHighlight(next);
        $$(".legend-item").forEach(function (el) {
          el.classList.toggle("is-active", el.dataset.key === state.highlight);
          el.classList.toggle("is-dim", !!state.highlight && el.dataset.key !== state.highlight);
        });
      });
      wrap.appendChild(b);
    });
  }

  /* ---------- 信众密度切换 ---------- */
  function buildDensityChips() {
    var wrap = $("#densityChips");
    if (!wrap) { return; }
    wrap.innerHTML = "";
    DENSITY_KEYS.forEach(function (key) {
      var info = FAITHS[key];
      if (!info) { return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "faith-chip";
      b.dataset.key = key;
      b.style.setProperty("--c", REL[key].color);
      b.innerHTML = '<i class="dot"></i><span>' + esc(REL[key].name) + "</span>";
      b.addEventListener("click", function () { setDensity(key); });
      wrap.appendChild(b);
    });
  }

  function setDensity(key) {
    if (!FAITHS[key]) { return; }
    state.densityKey = key;
    clearHighlight();
    applyLayer("density");
    map.setDensity(key);
    map.focusFaith(key);
    openFaith(key);
    closeDrawer();
  }

  function updateDensityLegend() {
    var grad = $("#densityGrad");
    if (grad && map.densityGradient) {
      var css = map.densityGradient(state.densityKey);
      if (css) { grad.style.background = css; }
    }
    var legend = $("#taoismLegend");
    if (legend) {
      var label = legend.querySelector("span");
      if (label) { label.textContent = REL[state.densityKey].name + "信众密度"; }
    }
  }

  /* ---------- 热点地区列表 ---------- */
  function buildRegionList() {
    var list = $("#regionList");
    list.innerHTML = "";
    REGIONS.slice(0, 18).forEach(function (r) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = '<span class="r-dot"></span><span class="r-name">' + esc(r.name) +
        '</span><span class="r-country">' + esc(r.nameEn) + "</span>";
      b.addEventListener("click", function () {
        map.focusRegion(r.lat, r.lon);
        openRegion(r);
        closeDrawer();
      });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  /* ---------- 图层与视图 ---------- */
  function applyLayer(layer) {
    state.layer = layer;
    map.setLayer(layer);
    $("#layerDominant").classList.toggle("is-active", layer === "dominant");
    $$("#densityChips .faith-chip").forEach(function (el) {
      el.classList.toggle("is-active", layer === "density" && el.dataset.key === state.densityKey);
    });
    $("#spreadBtn").classList.toggle("is-active", !!state.spreadKey);
    $("#taoismLegend").hidden = layer !== "density";
    $("#taoismBtn").classList.toggle("is-active", layer === "density");
    if (layer === "density") { updateDensityLegend(); }
  }

  function clearHighlight() {
    state.highlight = null;
    if (mapReady) { map.setHighlight(null); }
    $$(".legend-item").forEach(function (el) {
      el.classList.remove("is-active", "is-dim");
    });
  }

  function applyMode(mode, silent) {
    state.mode = mode;
    if (mapReady) { map.setMode(mode); }
    $$(".seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === mode);
    });
    $("#spinBtn").hidden = mode !== "globe";
    $("#spinBtn").classList.toggle("is-on", map ? map.autoRotate : true);
    if (!silent) { updateZoomReadout(); }
  }

  function updateZoomReadout() {
    if (!mapReady) { return; }
    var z = map.getZoom();
    $("#zoomReadout").textContent = z.toFixed(z < 10 ? 1 : 0) + "×";
  }

  /* ---------- 地图事件 ---------- */
  function bindMapEvents() {
    var canvas = $("#map");

    canvas.addEventListener("mapselect", function (e) {
      hideWelcome();
      var hit = e.detail;
      if (!hit) { return; }
      if (hit.type === "country") {
        openCountry(hit.name, true);
      } else if (hit.type === "region") {
        openRegion(hit.region);
      } else if (hit.type === "faith-place") {
        openFaith(state.densityKey, hit.place);
      } else if (hit.type === "tao-place") {
        openFaith("tao", hit.place);
      }
    });

    canvas.addEventListener("maphover", function (e) {
      var hit = e.detail;
      if (!hit) {
        tooltip.hidden = true;
        return;
      }
      var label, sub;
      if (hit.type === "country") {
        var st = STATS[hit.name];
        var rel = st ? normRel(st.rel) : null;
        var dk = rel ? topKey(rel) : "oth";
        label = hit.zh || hit.name;
        sub = rel ? REL[dk].name + " " + fmtPct(rel[dk]) : "查看宗教构成";
      } else if (hit.type === "region") {
        label = hit.region.name;
        sub = "宗教热点地区 · 点击查看";
      } else if (hit.type === "faith-place") {
        label = hit.place.name;
        sub = REL[state.densityKey].name + "信众 约 " + fmtFollowers(hit.place.followers / 1000);
      } else {
        label = hit.place.name;
        sub = "道教信众 约 " + fmtFollowers(hit.place.followers / 1000);
      }
      $("#ttName").textContent = label;
      $("#ttRel").textContent = sub;
      tooltip.style.left = hit.x + "px";
      tooltip.style.top = hit.y + "px";
      tooltip.hidden = false;
    });

    canvas.addEventListener("pointerdown", function () { hideWelcome(); });
  }

  /* ---------- 详情：国家 ---------- */
  function openCountry(name, quiet) {
    var f = map.byName[name];
    if (!f) { return; }
    var st = STATS[name];
    state.selectedCountry = name;
    state.detailMode = "country";
    map.setSelected(name);
    map.selected = name;
    if (!st) {
      detailInner.innerHTML = '<button class="detail-close" data-close-detail>✕</button>' +
        '<div class="d-eyebrow">国家 / COUNTRY</div>' +
        '<h2 class="d-title">' + esc(name) + '</h2>' +
        '<div class="card"><p class="disclaimer">这个国家暂时没有整理宗教数据。</p></div>';
      openDetail();
      return;
    }
    var rel = normRel(st.rel);
    var keys = sortedRel(rel);
    var dom = keys[0];
    var history = HISTORY[name] || defaultHistory(name, st);
    var related = REGIONS.filter(function (r) { return r.country === name; });

    var html = '<button class="detail-close" data-close-detail aria-label="关闭">✕</button>';
    html += '<div class="d-eyebrow">国家 / COUNTRY</div>';
    html += '<h2 class="d-title">' + esc(st.zh) + "<small>" + esc(name) + "</small></h2>";
    html += '<div class="d-chips">' +
      '<span class="chip">人口 ' + fmtPop(st.pop) + "</span>" +
      '<span class="chip"><i class="dot" style="--c:' + REL[dom].color + '"></i>' + esc(REL[dom].name) + "为主</span>" +
      '<span class="chip">' + (st.special ? esc(st.special) : keys.length + " 种宗教传统") + "</span>" +
      "</div>";

    html += '<div class="card"><h3>宗教构成 <span class="sub">占人口比例</span></h3>' +
      '<div class="stackbar">' + keys.map(function (k) {
        return '<span style="width:' + rel[k] + "%;background:" + REL[k].color + '" title="' + esc(REL[k].name) + " " + fmtPct(rel[k]) + '"></span>';
      }).join("") + "</div>" +
      '<div class="rel-list">' + keys.map(function (k) {
        return '<div class="rel-row" style="grid-template-columns:11px 1fr auto">' +
          '<span class="dot" style="background:' + REL[k].color + '"></span>' +
          '<span class="name">' + esc(REL[k].name) + "<em>" + esc(REL[k].en) + "</em></span>" +
          '<span class="val">' + fmtPct(rel[k]) + "</span>" +
          '<span class="rel-bar"><i style="width:' + Math.min(100, rel[k]) + "%;--c:" + REL[k].color + '"></i></span>' +
          "</div>";
      }).join("") + "</div>" +
      (st.note ? '<p class="disclaimer" style="margin-top:12px"><strong>注：</strong>' + esc(st.note) + "</p>" : "") +
      "</div>";

    /* 当前选中的信众密度宗教 */
    var dk = state.densityKey;
    if (rel[dk] && rel[dk] >= 0.05) {
      var followers = (st.pop || 0) * rel[dk] / 100;
      html += '<div class="card tao-card">' +
        "<h3>" + esc(REL[dk].name) + "在这里</h3>" +
        '<div class="tao-big"><strong>' + fmtPct(rel[dk]) + "</strong><span>占人口 · 约 " + fmtFollowers(followers) + " 人</span></div>" +
        '<p class="tao-note">' + esc(faithBlurb(dk, name)) + "</p>" +
        '<div class="tao-actions">' +
        '<button class="ghost-btn" data-open-spread="' + esc(dk) + '">看 ' + esc(REL[dk].name) + "的传播过程 →</button>" +
        "</div></div>";
    }

    html += '<div class="card"><h3>宗教历史 <span class="sub">TIMELINE</span></h3>' +
      '<ol class="timeline">' + history.map(function (h) {
        return '<li class="tl-item"><div class="tl-year">' + esc(h.y) + "</div><p>" + h.t + "</p></li>";
      }).join("") + "</ol></div>";

    if (related.length) {
      html += '<div class="card"><h3>宗教热点地区</h3><div class="d-chips" style="margin:0">' +
        related.map(function (r) {
          return '<button class="ghost-btn" data-region="' + esc(r.id) + '">' + esc(r.name) + "</button>";
        }).join("") + "</div></div>";
    }

    html += '<div class="card"><h3>关于数据</h3><p class="disclaimer">宗教人口比例来自多源估算，统计口径（自报、登记、实践参与）差异会显著改变结果。点击「数据说明与来源」查看完整说明。</p></div>';

    detailInner.innerHTML = html;
    openDetail();
    bindDetailActions();
    updateHash();
  }

  function faithBlurb(key, name) {
    var specific = {
      "tao": {
        "China": "道教发源于此。全真与正一两大传统、宫观与洞天福地名录共同构成中国宗教地理的重要一层；中国台湾地区宫庙密度居世界前列，正一派道士主持斋醮、建醮与安龙送煞等仪式，佛道界限模糊。",
        "Malaysia": "槟城、吉隆坡的华人宫庙保留九皇爷诞、中元普度等道教色彩浓厚的节庆。",
        "Japan": "道教未形成独立教团，但阴阳道、修验道与养生方术保留了明显的道教元素。",
        "South Korea": "风水、丹学与山神信仰中可见道教影响，现代道教团体规模不大。"
      },
      "bud": {
        "China": "汉传佛教自西域传入后，与本土信仰长期共存；藏传佛教则以青藏高原为核心，影响西南各省的寺院体系。",
        "Thailand": "上座部佛教是国教，僧团与王权互为表里，都市寺院兼作社区中心与学校。",
        "Japan": "神佛习合背景下寺院遍布国土，真言宗与日莲宗信众规模突出，现代新兴宗教色彩浓重。",
        "Myanmar": "自蒲甘起家的上座部传统，僧团在近现代曾深刻影响国家政治。"
      },
      "chr": {
        "China": "天主教、新教与东正教并存，官方登记与实际信众规模差距明显；家庭教会主要分布在农村与城市新兴白领群体。",
        "Brazil": "全球最大的天主教国家之一，同时拥有全球最大的五旬节派信众群体，拉丁美洲的「灵恩派」浪潮源头就在这里。",
        "Philippines": "亚洲最大的天主教国家，西班牙殖民时期的传教遗产至今鲜明，教会主导教育与慈善。",
        "United States of America": "新教各派并存，五旬节派与福音派影响深入政教与社会议题，宗教右翼政治是重要现象。"
      },
      "isl": {
        "China": "回族、维吾尔族等人口约 2,600 万，宁夏与新疆的清真寺网络最密集，多元宗教并存的法律框架下运行。",
        "Indonesia": "全球穆斯林人口最多的国家，信仰与国民身份高度统一，清真寺与伊斯兰学校深入日常生活。",
        "Pakistan": "伊斯兰建国，逊尼派为主体，清真寺、宗教学校与瓦哈比派运动影响社会政治。",
        "Saudi Arabia": "伊斯兰教发源地与两圣守护国，瓦哈比—萨拉菲传统影响全球保守派伊斯兰。"
      }
    };
    var m = specific[key] || {};
    if (m[name]) { return m[name]; }
    var generic = {
      "tao": "道教与华人移民、民间信仰和节庆仪式一同传播，往往以宫庙与祭祀网络的形式存在，而非独立教会。",
      "bud": "佛教常与地方信仰并存，信众比例在不同调查里差异很大，很难用单一数字概括。",
      "chr": "教会形态与登记制度差异很大，实际信众规模往往高于官方统计。",
      "isl": "伊斯兰社群在多数国家以清真寺网络与节庆为纽带，其影响常超出信众比例本身。"
    };
    return generic[key] || "";
  }

  /* 尚未单独撰写历史的国家：用区域模板生成，
     让每个国家的时间线贴合本地实际，而不是同一套空话。 */
  function defaultHistory(name, st) {
    var zh = st.zh || name;
    var rel = normRel(st.rel);
    var faith = topKey(st.rel);
    var r = REL[faith] || REL.oth;
    var pct = fmtPct(rel[faith]);
    var region = (window.COUNTRY_REGION || {})[name] || "default";
    var tpls = window.HISTORY_TEMPLATES || {};
    var arr = tpls[region] || tpls.default || [];
    var now = faith === "irr"
      ? "无宗教认同成为多数（约 " + pct + "）；教会与宗教社群仍在节庆、慈善、丧葬与婚育等场景中发挥作用。"
      : "以" + r.name + "为主（约 " + pct + "）；宗教社群在节庆、教育与慈善中继续发挥作用，世俗化与多元化同时推进。";
    return arr.map(function (h) {
      return {
        y: h.y,
        t: String(h.t)
          .replace(/\{zh\}/g, zh)
          .replace(/\{rel\}/g, r.name)
          .replace(/\{pct\}/g, pct)
          .replace(/\{now\}/g, now)
      };
    });
  }

  /* ---------- 详情：宗教热点地区 ---------- */
  function openRegion(region) {
    if (!region) { return; }
    var rel = normRel(region.rel || {});
    var keys = sortedRel(rel);
    var dom = keys[0] || "oth";
    var countryZh = region.country !== "—" && STATS[region.country] ? STATS[region.country].zh : "";
    state.detailMode = "region";
    map.setSelected(null);
    map.selected = null;

    var html = '<button class="detail-close" data-close-detail aria-label="关闭">✕</button>';
    html += '<div class="d-eyebrow">宗教热点地区 / REGION</div>';
    html += '<h2 class="d-title">' + esc(region.name) + "<small>" + esc(region.nameEn) + (countryZh ? " · " + esc(countryZh) : "") + "</small></h2>";
    html += '<div class="d-chips"><span class="chip"><i class="dot" style="--c:' + REL[dom].color + '"></i>' + esc(REL[dom].name) + "为主</span></div>";
    if (region.note) {
      html += '<div class="card"><p style="font-size:12.5px;line-height:1.9;color:var(--muted)">' + esc(region.note) + "</p></div>";
    }
    html += '<div class="card"><h3>宗教构成 <span class="sub">估算</span></h3>' +
      '<div class="stackbar">' + keys.map(function (k) {
        return '<span style="width:' + rel[k] + "%;background:" + REL[k].color + '"></span>';
      }).join("") + "</div>" +
      '<div class="rel-list">' + keys.map(function (k) {
        return '<div class="rel-row" style="grid-template-columns:11px 1fr auto">' +
          '<span class="dot" style="background:' + REL[k].color + '"></span>' +
          '<span class="name">' + esc(REL[k].name) + "<em>" + esc(REL[k].en) + "</em></span>" +
          '<span class="val">' + fmtPct(rel[k]) + "</span>" +
          '<span class="rel-bar"><i style="width:' + Math.min(100, rel[k]) + "%;--c:" + REL[k].color + '"></i></span>' +
          "</div>";
      }).join("") + "</div></div>";

    var hist = region.history || (region.country !== "—" ? HISTORY[region.country] : null);
    if (hist) {
      html += '<div class="card"><h3>历史脉络</h3><ol class="timeline">' +
        hist.map(function (h) {
          return '<li class="tl-item"><div class="tl-year">' + esc(h.y) + "</div><p>" + h.t + "</p></li>";
        }).join("") + "</ol></div>";
    }

    if (region.country && region.country !== "—" && STATS[region.country]) {
      html += '<div class="tao-actions"><button class="ghost-btn" data-country="' + esc(region.country) + '">查看 ' + esc(STATS[region.country].zh) + " 全境 →</button></div>";
    }
    html += '<div class="card" style="margin-top:14px"><p class="disclaimer">地区数据为示意性估算，用于呈现宗教地理的局部差异，不代表官方统计。</p></div>';

    detailInner.innerHTML = html;
    openDetail();
    bindDetailActions();
    updateHash(region.id);
  }

  /* ---------- 详情：信众分布专题 ---------- */
  function openFaith(key, focusPlace) {
    var info = FAITHS[key];
    if (!info) { return; }
    state.detailMode = "faith";
    state.detailFaith = key;
    clearHighlight();
    map.setSelected(null);
    map.selected = null;
    if (state.layer !== "density" || state.densityKey !== key) {
      state.densityKey = key;
      applyLayer("density");
      map.setDensity(key);
    }

    var places = info.places.slice().sort(function (a, b) { return b.followers - a.followers; });
    var max = places[0].followers;

    var html = '<button class="detail-close" data-close-detail aria-label="关闭">✕</button>';
    html += '<div class="d-eyebrow">宗教专题 / ' + esc(info.en) + "</div>";
    html += '<h2 class="d-title">' + esc(info.title) + "<small>" + esc(info.en) + "</small></h2>";
    html += '<p style="font-size:12.5px;line-height:1.85;color:var(--muted);margin:12px 0 16px">' + esc(info.intro) + "</p>";

    html += '<div class="card"><h3>全球概览</h3><div class="fact-grid">' +
      info.stats.map(function (s) {
        return '<div class="fact"><span>' + esc(s.label) + "</span><strong>" + esc(s.value) +
          "</strong><em>" + esc(s.sub) + "</em></div>";
      }).join("") + "</div>" +
      '<div class="tao-actions">' +
      '<button class="ghost-btn" data-open-spread="' + esc(key) + '">▶ 看它的传播过程</button> ' +
      '<button class="ghost-btn" data-layer-dominant>← 返回主导宗教图层</button></div></div>';

    html += '<div class="card"><h3>信众分布排行 <span class="sub">估算 · 千人</span></h3>' +
      '<div class="tao-rank" id="taoRank">' + places.map(function (p, i) {
        var pct = Math.max(2, p.followers / max * 100);
        return '<button type="button" data-place="' + esc(p.name) + '" data-lat="' + p.lat + '" data-lon="' + p.lon + '"' +
          (focusPlace && focusPlace.name === p.name ? ' class="is-focus"' : "") + ">" +
          '<span class="idx">' + (i + 1) + "</span>" +
          '<span class="nm">' + esc(p.name) + "<em>" + esc(p.en) + "</em></span>" +
          '<span class="num">' + p.followers.toLocaleString("zh-CN") + "</span>" +
          '<span class="rk-bar"><i style="width:' + pct + '%"></i></span>' +
          "</button>";
      }).join("") + "</div>" +
      '<p class="disclaimer" style="margin-top:10px">' + esc(info.note) + "</p></div>";

    html += '<div class="card"><h3>' + esc(REL[key].name) + "简史 <span class=\"sub\">TIMELINE</span></h3><ol class=\"timeline\">" +
      info.history.map(function (h) {
        return '<li class="tl-item"><div class="tl-year">' + esc(h.y) + "</div><p>" + h.t + "</p></li>";
      }).join("") + "</ol></div>";

    html += '<div class="card"><h3>为什么难以统计</h3><p class="disclaimer">' +
      "同一份问卷在不同国家会得到完全不同的结果：「你信什么宗教」可能指教义认同、仪式参与、族裔身份或户口登记。民间信仰、无宗教与文化性宗教身份的边界尤其模糊，中国、日本、越南等地尤甚。" +
      "</p></div>";

    detailInner.innerHTML = html;
    openDetail();
    bindDetailActions();

    var target = $("#taoRank button.is-focus");
    if (target) {
      setTimeout(function () {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 220);
    }
    if (focusPlace) {
      map.focusRegion(focusPlace.lat, focusPlace.lon);
    }
    updateHash("f=" + key + (focusPlace ? ":" + focusPlace.name : ""));
  }

  /* ---------- 详情：传播时间轴 ---------- */
  function openSpreadDetail(key) {
    var S = SPREAD[key];
    if (!S) { return; }
    state.detailMode = "spread";
    state.detailFaith = key;
    clearHighlight();
    map.setSelected(null);
    map.selected = null;

    var html = '<button class="detail-close" data-close-detail aria-label="关闭">✕</button>';
    html += '<div class="d-eyebrow">传播过程 / SPREAD</div>';
    html += '<h2 class="d-title">' + esc(S.name) + "如何走向世界<small>" + esc(S.en) + "</small></h2>";
    html += '<div class="d-chips">' +
      '<span class="chip"><i class="dot" style="--c:' + S.color + '"></i>发源：' + esc(S.origin.label) + "</span>" +
      '<span class="chip">时间跨度 ' + fmtYear(S.min) + " — " + fmtYear(S.max) + "</span>" +
      "</div>";
    html += '<div class="tao-actions"><button class="ghost-btn" data-start-spread="' + esc(key) + '">▶ 在地图上播放传播过程</button></div>';

    html += '<div class="card"><h3>传播阶段 <span class="sub">PHASES</span></h3><ol class="timeline">' +
      S.phases.map(function (p) {
        return '<li class="tl-item"><div class="tl-year">' + fmtYear(p.from) + " — " + fmtYear(p.to) + "</div><p><strong>" +
          esc(p.name) + "</strong>：" + esc(p.note) + "</p></li>";
      }).join("") + "</ol></div>";

    html += '<div class="card"><h3>关键节点 <span class="sub">KEY MOMENTS</span></h3><ol class="timeline">' +
      S.events.map(function (e) {
        return '<li class="tl-item"><div class="tl-year">' + fmtYear(e.y) + "</div><p><strong>" +
          esc(e.place) + "</strong>：" + esc(e.t) + "</p></li>";
      }).join("") + "</ol></div>";

    html += '<div class="card"><h3>怎么读这张图</h3><p class="disclaimer">' +
      "打开传播时间轴后，地图按年份点亮该宗教已经进入的国家，路线上的光点表示当时的传播方向。年份为估计值，个别国家的传入时间存在争议；南美、部分非洲与东南亚的传入年代尤其难有定论。" +
      "</p></div>";

    detailInner.innerHTML = html;
    openDetail();
    bindDetailActions();
    updateHash("s=" + key);
  }

  /* =======================================================
     传播时间轴：滑杆 + 播放
     ======================================================= */

  function buildSpreadTabs() {
    var wrap = $("#tbFaiths");
    if (!wrap) { return; }
    wrap.innerHTML = "";
    DENSITY_KEYS.forEach(function (key) {
      var S = SPREAD[key];
      if (!S) { return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tb-faith";
      b.dataset.key = key;
      b.innerHTML = '<i class="dot" style="background:' + S.color + '"></i>' + esc(S.name);
      b.addEventListener("click", function () { setSpread(key); });
      wrap.appendChild(b);
    });
  }

  function buildTicks(S) {
    var wrap = $("#tbTicks");
    if (!wrap) { return; }
    var ticks = (window.SPREAD_TICKS || {})[S.key] || [];
    wrap.innerHTML = "";
    var span = S.max - S.min || 1;
    ticks.forEach(function (t) {
      if (t < S.min || t > S.max) { return; }
      var d = document.createElement("span");
      d.className = "tb-tick";
      d.style.left = ((t - S.min) / span * 100) + "%";
      d.textContent = t < 0 ? "前" + Math.abs(t) : String(t);
      wrap.appendChild(d);
    });
  }

  function setSpread(key) {
    var S = SPREAD[key];
    if (!S) { return; }
    stopPlay();
    state.spreadKey = key;
    state.detailFaith = key;
    map.setSpread(key);
    var range = $("#tbRange");
    range.min = S.min;
    range.max = S.max;
    range.value = S.min;
    $("#timeBar").hidden = false;
    document.body.classList.add("spread-open");
    $$("#tbFaiths .tb-faith").forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.key === key);
    });
    buildTicks(S);
    state.spreadYear = S.min;
    map.setSpreadYear(S.min);
    updateSpreadInfo();
    /* 地图移到发源地 */
    map._flyTo(S.origin.lat, S.origin.lon, 1.25);
    applyLayer(state.layer);
    /* 详情面板跟着换宗教，否则标题和地图会各说各话 */
    if (state.detailMode === "spread") { openSpreadDetail(key); }
    else { updateHash("s=" + key); }
  }

  function closeSpread() {
    stopPlay();
    state.spreadKey = null;
    map.setSpread(null);
    $("#timeBar").hidden = true;
    document.body.classList.remove("spread-open");
    if (state.detailMode === "spread") { closeDetail(); }
    applyLayer(state.layer);
    updateHash();
  }

  function setSpreadYear(y) {
    var S = SPREAD[state.spreadKey];
    if (!S) { return; }
    y = Math.max(S.min, Math.min(S.max, Math.round(y)));
    state.spreadYear = y;
    map.setSpreadYear(y);
    var range = $("#tbRange");
    if (document.activeElement !== range) { range.value = y; }
    updateSpreadInfo();
  }

  function updateSpreadInfo() {
    var S = SPREAD[state.spreadKey];
    if (!S) { return; }
    var y = state.spreadYear;
    $("#tbYear").textContent = fmtYear(y);

    /* 已传入的国家数（只算地图上真实存在的国家） */
    var table = ARRIVAL[S.key] || {};
    var reached = 0, total = 0;
    for (var k in table) {
      if (!map.byName[k]) { continue; }
      total++;
      if (table[k] <= y) { reached++; }
    }
    /* 当前阶段 */
    var phase = null;
    for (var i = 0; i < S.phases.length; i++) {
      var p = S.phases[i];
      if (y >= p.from && y <= p.to) { phase = p; break; }
      if (y > p.to && !phase) { phase = p; }
    }
    $("#tbPhase").innerHTML = phase
      ? '<strong>' + esc(phase.name) + "</strong><span>" + fmtYear(phase.from) + "—" + fmtYear(phase.to) +
        " · 已传入 " + reached + " 个国家</span>"
      : "<span>已传入 " + reached + " 个国家</span>";

    /* 最近发生的事件 + 下一个事件 */
    var last = null, next = null;
    for (var j = 0; j < S.events.length; j++) {
      var e = S.events[j];
      if (e.y <= y) { last = e; }
      else if (!next) { next = e; }
    }
    var html = "";
    if (last) {
      html += '<b>' + fmtYear(last.y) + "</b> " + esc(last.place) + "：" + esc(last.t);
    }
    if (next) {
      html += (html ? "<br>" : "") + '<span class="tb-next">下一步 · ' + fmtYear(next.y) + " " + esc(next.place) + "</span>";
    }
    $("#tbEvent").innerHTML = html || "拖动滑杆，看看这个宗教如何一步步走向世界。";
  }

  /* ---- 播放 ---- */
  var playRaf = null;
  var playLast = 0;

  function startPlay() {
    var S = SPREAD[state.spreadKey];
    if (!S) { return; }
    if (state.spreadYear >= S.max) { state.spreadYear = S.min; setSpreadYear(S.min); }
    state.playing = true;
    $("#tbPlay").classList.add("is-playing");
    $("#tbPlay").querySelector(".ico-play").hidden = true;
    $("#tbPlay").querySelector(".ico-pause").hidden = false;
    playLast = performance.now();
    playRaf = requestAnimationFrame(playStep);
  }

  function stopPlay() {
    state.playing = false;
    if (playRaf) { cancelAnimationFrame(playRaf); playRaf = null; }
    var btn = $("#tbPlay");
    if (btn) {
      btn.classList.remove("is-playing");
      btn.querySelector(".ico-play").hidden = false;
      btn.querySelector(".ico-pause").hidden = true;
    }
  }

  function playStep(ts) {
    if (!state.playing) { return; }
    var S = SPREAD[state.spreadKey];
    if (!S) { stopPlay(); return; }
    var dt = Math.min(120, ts - playLast);
    playLast = ts;
    /* 全程约 28 秒走完 */
    var speed = (S.max - S.min) / 28000;
    var y = state.spreadYear + dt * speed;
    if (y >= S.max) { y = S.max; setSpreadYear(y); stopPlay(); return; }
    setSpreadYear(y);
    playRaf = requestAnimationFrame(playStep);
  }

  function togglePlay() {
    if (state.playing) { stopPlay(); } else { startPlay(); }
  }

  /* ---------- 详情交互 ---------- */
  function bindDetailActions() {
    $$("[data-close-detail]").forEach(function (b) {
      b.addEventListener("click", closeDetail);
    });
    $$("[data-open-spread]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.dataset.openSpread;
        openSpreadDetail(key);
        setSpread(key);
      });
    });
    $$("[data-start-spread]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = b.dataset.startSpread;
        setSpread(key);
        startPlay();
        /* 让地图露出来，不然动画在面板底下白播 */
        closeDetail();
      });
    });
    $$("[data-layer-dominant]").forEach(function (b) {
      b.addEventListener("click", function () { applyLayer("dominant"); });
    });
    $$("[data-country]").forEach(function (b) {
      b.addEventListener("click", function () { openCountry(b.dataset.country); });
    });
    $$("[data-region]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = REGIONS.filter(function (x) { return x.id === b.dataset.region; })[0];
        if (r) { map.focusRegion(r.lat, r.lon); openRegion(r); }
      });
    });
    $$("#taoRank button[data-place]").forEach(function (b) {
      b.addEventListener("click", function () {
        var lat = parseFloat(b.dataset.lat), lon = parseFloat(b.dataset.lon);
        map.focusRegion(lat, lon);
        $$("#taoRank button").forEach(function (x) { x.classList.remove("is-focus"); });
        b.classList.add("is-focus");
      });
    });
  }

  function openDetail() {
    detail.classList.add("is-open");
    document.body.classList.add("detail-open");
  }
  function closeDetail() {
    detail.classList.remove("is-open");
    document.body.classList.remove("detail-open");
    state.detailMode = null;
    state.selectedCountry = null;
    map.setSelected(null);
    map.selected = null;
    updateHash();
  }

  /* ---------- 搜索 ---------- */
  function bindSearch() {
    var input = $("#searchInput");
    var box = $("#searchResults");
    var items = [];
    /* 别名：某些地区已并入别国，仍可用旧名搜到 */
    var ALIAS = {
      China: ["台湾", "台湾地区", "中国台湾", "Taiwan", "中华人民共和国", "中国大陆"]
    };
    map.features.forEach(function (f) {
      var st = STATS[f.name];
      items.push({
        kind: "country", name: f.name, zh: f.zh || f.name,
        color: st ? REL[f.dominant].color : "#888",
        sub: st ? REL[f.dominant].name : "",
        alias: ALIAS[f.name] || []
      });
    });
    REGIONS.forEach(function (r) {
      items.push({
        kind: "region", id: r.id, name: r.name, zh: r.name, color: "#d8b25f",
        sub: "热点地区 · " + (r.country === "—" ? r.nameEn : r.nameEn), region: r
      });
    });
    DENSITY_KEYS.forEach(function (key) {
      var info = FAITHS[key];
      if (!info) { return; }
      items.push({
        kind: "faith", name: key, zh: REL[key].name + "分布", color: REL[key].color,
        sub: info.en, faith: key
      });
    });

    function render(q) {
      q = q.trim().toLowerCase();
      if (!q) { box.hidden = true; box.innerHTML = ""; return; }
      var res = items.filter(function (it) {
        if (it.name.toLowerCase().indexOf(q) > -1 || it.zh.toLowerCase().indexOf(q) > -1) { return true; }
        var al = it.alias || [];
        for (var i = 0; i < al.length; i++) {
          if (al[i].toLowerCase().indexOf(q) > -1) { return true; }
        }
        return false;
      }).slice(0, 9);
      if (!res.length) {
        box.innerHTML = '<div class="sr-empty">没有找到「' + esc(q) + "」</div>";
      } else {
        box.innerHTML = res.map(function (it) {
          var sub = it.kind === "region" ? "热点地区" : it.name;
          var al = it.alias || [];
          for (var i = 0; i < al.length; i++) {
            if (al[i].toLowerCase().indexOf(q) > -1) { sub = al[i]; break; }
          }
          if (it.kind === "faith") { sub = "专题 · " + it.sub; }
          return '<button type="button" data-kind="' + it.kind + '" data-name="' + esc(it.name) + '"' +
            (it.kind === "region" ? ' data-id="' + esc(it.id) + '"' : "") + ">" +
            '<span class="sr-dot" style="background:' + it.color + '"></span>' +
            '<span class="sr-zh">' + esc(it.zh) + "</span>" +
            '<span class="sr-en">' + esc(sub) + "</span>" +
            "</button>";
        }).join("");
      }
      box.hidden = false;
      $$("#searchResults button").forEach(function (b, i) {
        b.addEventListener("click", function () {
          selectSearch(b, res[i]);
        });
      });
    }

    function selectSearch(btn, item) {
      box.hidden = true;
      input.value = "";
      if (item.kind === "country") {
        map.focusCountry(item.name);
        openCountry(item.name);
      } else if (item.kind === "faith") {
        setDensity(item.faith);
      } else {
        map.focusRegion(item.region.lat, item.region.lon);
        openRegion(item.region);
      }
      closeDrawer();
    }

    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { if (input.value.trim()) { render(input.value); } });
    input.addEventListener("keydown", function (e) {
      var btns = $$("#searchResults button");
      if (!btns.length) { return; }
      var active = btns.filter(function (b) { return b.classList.contains("is-active"); })[0];
      var idx = active ? btns.indexOf(active) : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = (idx + 1) % btns.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = (idx - 1 + btns.length) % btns.length;
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (idx < 0) { idx = 0; }
        btns[idx].click();
        return;
      } else if (e.key === "Escape") {
        box.hidden = true;
        input.blur();
        return;
      } else {
        return;
      }
      btns.forEach(function (b) { b.classList.remove("is-active"); });
      btns[idx].classList.add("is-active");
    });

    document.addEventListener("click", function (e) {
      if (!$("#search").contains(e.target)) { box.hidden = true; }
    });
  }

  /* ---------- UI 绑定 ---------- */
  function bindUI() {
    $$(".seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        applyMode(b.dataset.view);
        hideWelcome();
      });
    });

    $("#zoomIn").addEventListener("click", function () { map.zoomIn(); });
    $("#zoomOut").addEventListener("click", function () { map.zoomOut(); });
    $("#resetView").addEventListener("click", function () {
      map.resetView();
      closeDetail();
    });

    $("#spinBtn").addEventListener("click", function () {
      map.autoRotate = !map.autoRotate;
      $("#spinBtn").classList.toggle("is-on", map.autoRotate);
      map.dirty = true;
    });

    $("#layerDominant").addEventListener("click", function () {
      clearHighlight();
      applyLayer("dominant");
      if (state.detailMode === "faith") { closeDetail(); }
    });
    $("#spreadBtn").addEventListener("click", function () {
      if (state.spreadKey) { closeSpread(); }
      else {
        var key = state.densityKey;
        setSpread(key);
        /* 窄屏上详情面板是底部抽屉，会把地图整个盖住；
           这时只开时间轴，阶段信息在时间轴上本来就写着。 */
        if (!isNarrow()) { openSpreadDetail(key); }
      }
    });
    $("#taoismBtn").addEventListener("click", function () {
      setDensity(state.densityKey);
    });

    /* 时间轴控件 */
    $("#tbRange").addEventListener("input", function (e) {
      stopPlay();
      setSpreadYear(parseFloat(e.target.value));
    });
    $("#tbPlay").addEventListener("click", togglePlay);
    $("#tbClose").addEventListener("click", function () {
      closeSpread();
      if (state.detailMode === "spread") { closeDetail(); }
    });

    $("#brandHome").addEventListener("click", function (e) {
      e.preventDefault();
      map.resetView();
      clearHighlight();
      applyLayer("dominant");
      closeSpread();
      closeDetail();
      updateHash();
    });

    $("#welcomeStart").addEventListener("click", hideWelcome);
    $("#welcome").addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("button")) { return; }
      hideWelcome();
    });
    $("#drawerBtn").addEventListener("click", openDrawer);
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerScrim").addEventListener("click", closeDrawer);

    $("#aboutBtn").addEventListener("click", openAbout);
    $("#infoBtnMobile").addEventListener("click", openAbout);
    $("#modalClose").addEventListener("click", closeModal);
    $$("[data-close-modal]").forEach(function (el) { el.addEventListener("click", closeModal); });

    bindSearch();

    document.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { return; }
      if (e.key === "Escape") {
        if (!$("#modal").hidden) { closeModal(); }
        else if (detail.classList.contains("is-open")) { closeDetail(); }
        else if (document.body.classList.contains("drawer-open")) { closeDrawer(); }
        return;
      }
      if (e.key === " " && state.spreadKey && e.target === document.body) {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (!mapReady) { return; }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); map.zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); map.zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); map.resetView(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); map.panBy(-60, 0); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); map.panBy(60, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); map.panBy(0, 60); }
      else if (e.key === "ArrowDown") { e.preventDefault(); map.panBy(0, -60); }
    });

    window.addEventListener("hashchange", applyHash);

    var lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth !== lastW) {
        lastW = window.innerWidth;
        closeDrawer();
      }
    });

    setupInstall();
  }

  function hideWelcome() {
    var el = $("#welcome");
    if (el && !el.classList.contains("is-hidden")) {
      el.classList.add("is-hidden");
    }
  }

  function openDrawer() { document.body.classList.add("drawer-open"); }
  function closeDrawer() { document.body.classList.remove("drawer-open"); }
  /* 窄屏（手机）布局：详情是底部抽屉，不能挡住地图 */
  function isNarrow() { return window.innerWidth <= 980; }

  /* ---------- 数据说明 ---------- */
  function openAbout() {
    var html = "<h2>关于这份地图</h2>" +
      "<p>世界宗教地图是一个离线可用的宗教地理可视化项目：平面地图与 3D 地球共用同一套数据，支持缩放、点击国家查看宗教构成与历史，并提供佛教、基督教、伊斯兰教、道教四个信众分布专题与全球传播时间轴。</p>" +
      "<h3>数据口径</h3>" +
      "<ul>" +
      "<li>国家宗教比例为占全国人口的百分比估算，主要参考 Pew Research Center、CIA World Factbook、World Religion Database 与各国人口普查。</li>" +
      "<li>地图上的信众密度按「人口 × 自报比例」估算，并对数刻度着色；专题排行用的是研究机构的另一套口径，两者不应直接相加。</li>" +
      "<li>不同调查对「民间信仰」「无宗教」「文化性宗教身份」的定义差异很大，尤其影响中国、日本、越南等地的结果。</li>" +
      "<li>传播时间轴里的传入年份为学界估计值，个别国家（尤其南美、部分非洲与东南亚）存在争议。</li>" +
      "<li>热点地区数据为局部示意性估算，用于呈现差异，不应视为官方统计。</li>" +
      "</ul>" +
      "<h3>边界口径</h3>" +
      "<p>" + esc(window.BOUNDARY_NOTE || "") + "</p>" +
      "<h3>主要来源</h3><ul>" +
      window.SOURCES.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      "</ul>" +
      "<h3>操作</h3>" +
      "<p>拖动平移，滚轮或双指缩放，点击国家查看详情。传播时间轴：拖动滑杆查看各年份的分布，按空格播放/暂停。快捷键：" +
      '<span class="kbd">+</span><span class="kbd">−</span> 缩放，<span class="kbd">0</span> 复位，<span class="kbd">Esc</span> 关闭面板。</p>' +
      "<h3>离线与安卓</h3>" +
      "<p>网页端支持安装到主屏幕（PWA）：Chrome / Edge 菜单里的「安装应用」，装完可离线打开，桌面图标与原生应用一致。仓库不含安卓原生外壳，网页版在手机浏览器里全屏运行即为全屏体验。</p>" +
      "<p class=\"disclaimer\" style=\"margin-top:18px\">地图几何数据：@surbowl/world-geo-json-zh（简体中文世界地图，中国标准地图口径）；代码以 MIT 许可发布。</p>";
    $("#modalBody").innerHTML = html;
    $("#modal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modal").hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------- Hash 路由 ---------- */
  function updateHash(extra) {
    if (!mapReady) { return; }
    var h = "";
    if (state.detailMode === "country" && state.selectedCountry) {
      h = "c=" + encodeURIComponent(state.selectedCountry);
    } else if (state.detailMode === "region") {
      h = "r=" + encodeURIComponent(extra || "");
    } else if (state.detailMode === "faith") {
      h = "f=" + encodeURIComponent(state.detailFaith || "");
    } else if (state.detailMode === "spread") {
      h = "s=" + encodeURIComponent(state.detailFaith || "");
    } else if (state.spreadKey) {
      h = "s=" + encodeURIComponent(state.spreadKey);
    }
    var url = location.pathname + location.search + (h ? "#" + h : "");
    try { history.replaceState(null, "", url); } catch (e) { /* file:// */ }
  }

  function applyHash() {
    if (!mapReady) { return; }
    var raw = (location.hash || "").replace(/^#/, "");
    if (!raw) { return; }
    var parts = raw.split("&");
    var obj = {};
    parts.forEach(function (p) {
      var kv = p.split("=");
      obj[kv[0]] = decodeURIComponent(kv[1] || "");
    });
    if (obj.c && map.byName[obj.c]) {
      map.focusCountry(obj.c);
      openCountry(obj.c, true);
    } else if (obj.r) {
      var r = REGIONS.filter(function (x) { return x.id === obj.r; })[0];
      if (r) { map.focusRegion(r.lat, r.lon); openRegion(r); }
    } else if (obj.f && FAITHS[obj.f]) {
      setDensity(obj.f);
    } else if (obj.s && SPREAD[obj.s]) {
      setSpread(obj.s);
    } else if (obj.t) {
      openFaith("tao");
    }
  }

  /* ---------- PWA ---------- */
  var deferredPrompt = null;
  function setupInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      var foot = $(".sidebar-foot");
      if (!foot || $("#installBtn")) { return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "text-btn";
      b.id = "installBtn";
      b.innerHTML = "＋ 安装到手机主屏幕";
      b.addEventListener("click", function () {
        if (!deferredPrompt) { return; }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { deferredPrompt = null; b.remove(); });
      });
      foot.insertBefore(b, foot.firstChild);
    });
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) { return; }
    if (location.protocol !== "http:" && location.protocol !== "https:") { return; }
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(function () { /* 忽略 */ });
    });
  }

  /* ---------- 启动 ---------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
