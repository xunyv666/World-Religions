# 世界宗教地图 · World Religion Atlas

一张可以缩放到细节的宗教分布地图：平面投影与 3D 地球共用同一套数据，
点击任意国家查看宗教构成与历史脉络，另附四大宗教的全球信众分布专题，
以及一条可以拖动、回放全球传播过程的「时间轴」。

纯静态站点，无构建步骤、无第三方运行时依赖，断网可用（PWA）。

## 功能

| | |
|---|---|
| 平面地图 | 自研 Canvas 渲染引擎，滚轮/双指缩放、拖动平移 |
| 3D 地球 | 同一份几何数据，正交投影 + 昼夜大气效果 |
| 国家详情 | 宗教构成占比条、逐条时间线、相关热点地区 |
| 宗教热点地区 | 44 个地区级条目，可放大定位 |
| 信众分布 | 佛教 / 基督教 / 伊斯兰教 / 道教四套专题：密度着色 + 重点地区排行 + 简史 |
| 传播时间轴 | 拖动滑杆看某个宗教逐年「点亮」世界，路线带流动粒子，可自动播放 |
| 搜索 | 中文名 / 英文名 / 别名（如「台湾」→ 中国） |
| PWA | 可安装到主屏，Service Worker 离线缓存 |

## 目录

```
index.html                  页面本体
升级清单.md / .docx          升级项目清单（改完用 tools/md2docx.py 重新生成 Word）
assets/
  css/style.css             全部样式
  js/world-geo.js           底图几何（构建产物，勿手改）
  js/data.js                宗教统计、历史、热点地区、四大宗教分布专题
  js/spread.js              四大宗教的传播时间轴：发源地、阶段、关键事件、传播路线
  js/arrival.js             各宗教传入各国年份（时间轴着色用）
  js/map-engine.js          投影与渲染引擎
  js/app.js                 界面逻辑
  icons/                    应用图标
data/
  world.zh.json             底图原始数据（来源仓库）
  countries.geo.json        规范化后的底图（中间产物）
tools/
  build_world_geo.py        底图构建：world.zh.json → countries.geo.json → world-geo.js
  build_dist.py             收集静态文件到 dist/，供 Cloudflare Pages 部署
  check_geo.py              数据与几何的覆盖自检
  check_religion.js         四大宗教专题 / 时间轴 / 传入表的数据自检（Node）
  md2docx.py                把升级清单.md 转成 Word 文档
  diff_basemap.py           换底图前后国家集合对比
  cdp_shot.py / cdp_flow.py 无头浏览器截图与交互取证
部署上线技能/                从本地到上线的完整操作手册
```

## 本地运行

必须走 HTTP，双击 `index.html` 跑不起来（`file://` 下 Service Worker 与模块加载会被拦）：

```bash
python dev-server.py 8123      # 打开 http://127.0.0.1:8123/
```

改动静态资源后刷新即可（Service Worker 是网络优先，不会卡住更新）。
若要改缓存策略，同步升 `sw.js` 里的 `CACHE` 版本号。

## 底图重建

```bash
python tools/build_world_geo.py
```

流程：`data/world.zh.json` → 同名要素合并 → `data/countries.geo.json` → 压缩成
`assets/js/world-geo.js`（`window.WORLD_GEO` + `window.WORLD_GEO_META`）。

边界口径：按中国官方标准地图绘制，台湾地区并入中国，中印东段（藏南地区）
按中国主张线划归中国，南海诸岛列入中国名下。

## 自检

```bash
python tools/check_geo.py      # 统计表 ↔ 底图几何 ↔ 历史模板
node tools/check_religion.js   # 四大宗教专题、时间轴、传入年份表
```

`check_geo.py` 核对三件事：统计表与底图几何是否一一对应、各国宗教比例总和是否接近 100%、
每个未单独撰写历史的国家是否都有区域归类（否则会退回通用模板）。

`check_religion.js` 核对四件事：专题数据是否齐全、传播事件是否按时间排序且落在时间轴范围内、
阶段是否首尾相接、传入年份表里的国名是否真的存在于底图。

## 口径说明

地图上「信众密度」按 **人口 × 自报比例** 估算，用对数刻度着色（信众规模跨好几个数量级，
线性刻度会把所有小国压成同一种颜色）；专题排行用的是研究机构的另一套口径，
两套数字不应直接相加。

「传播时间轴」里的传入年份为学界估计值，个别国家（尤其南美、部分非洲与东南亚）
存在争议；地图表达的是「这个宗教已经进入过这个国家」，不是「此刻此地的信仰格局」。

## 数据来源

宗教比例取自 Pew Research Center、CIA World Factbook、World Religion Database
(Brill) 与各国人口普查；地图几何来自 `@surbowl/world-geo-json-zh`。
不同调查对「民间信仰」「无宗教」「文化性宗教身份」的定义差异很大，
中国、日本、越南等尤甚——数字用于呈现量级与结构，不作精确统计用。

## 部署

完整流程见 [`部署上线技能/SKILL.md`](部署上线技能/SKILL.md)（四阶段：
代码进 GitHub → Cloudflare Pages 建项目 → 接通自动部署 → 上线核对）。

本项目用 **Git 集成**：Cloudflare 直接连 GitHub 仓库，`main` 一推送就重新
构建上线，仓库里不需要放任何部署工作流（Direct Upload 才需要）。

线上地址 <https://world-religions-555.pages.dev>。

Dashboard 建项目时按下面填：

| 字段 | 值 |
|---|---|
| Project name | `world-religions`（线上域名 `world-religions-555.pages.dev`） |
| Framework preset | None |
| Build command | `python3 tools/build_dist.py \|\| python tools/build_dist.py` |
| Build output directory | `dist` |
| Root directory | 留空（仓库根） |

`tools/build_dist.py` 只把运行时真正需要的文件收进 `dist/`（页面、脚本、
图标、PWA 三件套），`data/` 下的底图中间产物不上传。

静态资源文件名不带内容哈希，所以 `_headers` 里除图标外一律
`max-age=0, must-revalidate`——缓存一年会让改完的前端永远发不出去。

## 许可

代码以 MIT 许可发布。底图数据版权归原来源仓库所有。
