# 世界宗教地图 · World Religion Atlas

一张可以缩放到细节的宗教分布地图：平面投影与 3D 地球共用同一套数据，
点击任意国家查看宗教构成与历史脉络，另附道教全球分布专题。

纯静态站点，无构建步骤、无第三方运行时依赖，断网可用（PWA）。

## 功能

| | |
|---|---|
| 平面地图 | 自研 Canvas 渲染引擎，滚轮/双指缩放、拖动平移 |
| 3D 地球 | 同一份几何数据，正交投影 + 昼夜大气效果 |
| 国家详情 | 宗教构成占比条、逐条时间线、相关热点地区 |
| 宗教热点地区 | 44 个地区级条目，可放大定位 |
| 道教专题 | 全球道教信众密度排行 + 20 个重点地区的传播史 |
| 搜索 | 中文名 / 英文名 / 别名（如「台湾」→ 中国） |
| PWA | 可安装到主屏，Service Worker 离线缓存 |

## 目录

```
index.html                  页面本体
assets/
  css/style.css             全部样式
  js/world-geo.js           底图几何（构建产物，勿手改）
  js/data.js                宗教统计、历史、热点地区、道教专题
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
python tools/check_geo.py
```

核对三件事：统计表与底图几何是否一一对应、各国宗教比例总和是否接近 100%、
每个未单独撰写历史的国家是否都有区域归类（否则会退回通用模板）。

## 数据来源

宗教比例取自 Pew Research Center、CIA World Factbook、World Religion Database
(Brill) 与各国人口普查；地图几何来自 `@surbowl/world-geo-json-zh`。
不同调查对「民间信仰」「无宗教」「文化性宗教身份」的定义差异很大，
中国、日本、越南等尤甚——数字用于呈现量级与结构，不作精确统计用。

## 部署

完整流程见 [`部署上线技能/SKILL.md`](部署上线技能/SKILL.md)（四阶段：
代码进 GitHub → Cloudflare Pages 建项目 → 接通自动部署 → 上线核对）。

仓库已备好 `_headers`、`404.html`、`.github/workflows/deploy.yml`
与 `tools/build_dist.py`。两条路：

- **Git 集成**（新项目首选）：Dashboard 连好仓库，Build command 留空，
  Build output directory 填 `dist`。
- **Direct Upload**：仓库 Secrets 配 `CLOUDFLARE_API_TOKEN`、
  `CLOUDFLARE_ACCOUNT_ID`，Variables 配 `CF_PROJECT_NAME`，推送 `main` 即部署。

静态资源文件名不带内容哈希，所以 `_headers` 里除图标外一律
`max-age=0, must-revalidate`——缓存一年会让改完的前端永远发不出去。

## 许可

代码以 MIT 许可发布。底图数据版权归原来源仓库所有。
