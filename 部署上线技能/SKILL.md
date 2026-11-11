---
name: deploy-cloudflare-pages
description: 把一个本地静态站（或前端构建产物）整理进 GitHub 仓库，并部署到 Cloudflare Pages，包含 Git 集成与 Direct Upload 的取舍、Actions + API Token 自动部署、_headers 配置、上线核对与排错。当用户说到 部署 / 上线 / 发布 / 建站 / 更新网站 / GitHub 仓库 / Cloudflare / Pages / 域名 / 自动部署 时使用。
---

# 部署上线：本地 → GitHub → Cloudflare Pages

一条能跑通的完整链路，全部为实测过的命令，不是教学示例。

## 先用这张表定位你在哪一步

| 你现在的情况 | 去哪一节 |
|---|---|
| 代码还在本地，没进过 GitHub | [阶段一](#阶段一代码进-github) |
| 已有仓库，还没上过线 | [阶段二](#阶段二在-cloudflare-建项目) |
| 已上线，但每次都要手动传 | [阶段三](#阶段三接通自动部署) |
| 刚推完，想确认真的生效了 | [阶段四](#阶段四上线核对) |
| 部署红了 / 页面还是旧的 / 图标不对 | [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md) |

## 三个必须提前做的决定

这三件事**一旦定错，后面要推倒重来**，因为它们决定了域名能不能保留。

### 1. Cloudflare 项目用哪种模式

| 模式 | 自动部署 | 什么时候选 |
|---|---|---|
| **Git 集成** | 原生支持，push 即上线 | **新项目首选**，什么都不用配 |
| **Direct Upload** | ❌ 不支持改造，只能 CI 或手动 | 只在「不想给 Cloudflare 仓库权限」时选 |

> **Direct Upload 项目无法改成 Git 集成**，这是 Cloudflare 的硬限制，不是配置没找到。
> 已经用 Direct Upload 建了、又想要自动部署 → 只能走 Actions + Token（见阶段三）。
> **重建 Git 项目会换域名**，所有已分享的链接作废，所以老项目通常不推倒重来。

### 2. 仓库放哪、公开还是私有

- 私有仓库 + Git 集成：Cloudflare 需要装 GitHub App 并授权该仓库。
- 公开仓库：任何人可读源码，但部署流程一样。
- **一个大仓库部署多个站**（如个人站 + 作品子站）时，想清楚是「一个 Pages 项目 + 子路径」还是「多个项目 + 各自域名」。前者共用域名、后者各自独立，但代码会有两份的风险。

### 3. 部署目录是哪个

Cloudflare Pages 只上传**一个目录**。先把这件事确定下来，后面所有命令都围绕它：

```bash
# 纯静态站：直接传源码目录
wrangler pages deploy prototype --project-name mysite --branch main

# 有构建步骤：先构建，再传产物目录
npm run build && wrangler pages deploy dist --project-name mysite --branch main
```

---

## 阶段一：代码进 GitHub

### 1.1 先清掉不该进仓库的东西

```bash
cd "你的项目目录"
du -sh * | sort -h | tail -10      # 看谁最占地方
```

`.gitignore` 至少包含：

```gitignore
node_modules/
.DS_Store
*.log
# 大素材、临时截图、实验代码
*.mp4
.shots/
_bench*
_probe*
```

**硬规则：单文件超过 25 MiB 的东西不要进仓库。**
理由有两条，任一条都足够：GitHub 对单个文件有硬上限，Cloudflare Pages 也限制单文件 25 MiB，
超了是**整站部署失败**，不是那个文件传不上去。视频一律压缩或放对象存储。

### 1.2 首次初始化并连接远端

```bash
git init
git add .
git commit -m "init: 项目初始化"
git branch -M main
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

用 SSH 而不是 HTTPS：本机没有凭据助手时 HTTPS 会反复要密码，SSH 一次配好永久免密。

**国内网络下 `github.com:22` 常被拒**，`~/.ssh/config` 必须这样写（注意文件名没有扩展名，
写成 `config.txt` 会静默失效）：

```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
```

验证：`ssh -T git@github.com` 应返回 `Hi USER!`。

### 1.3 远端已有内容时不要硬推

```bash
git fetch origin
git log --oneline origin/main -5          # 先看远端有什么
git switch -c feat/xxx                    # 从当前位置开分支
# 改完再 rebase，最后交给 PR
```

如果本地已经是旧历史、远端领先多个提交，`git push` 会被拒。
**不要 `--force`**，先 `git pull --rebase origin main`。

详细协作流程（含冲突处理、PR、多协作者）见
[reference/github.md](reference/github.md)。

---

## 阶段二：在 Cloudflare 建项目

### 2.1 首次部署（先把站立起来）

```bash
wrangler login          # 浏览器点 Allow，凭据存本机，只需一次
wrangler whoami         # 确认看到 Account ID
```

```bash
# 新建项目（只需一次）
wrangler pages project create mysite --production-branch main

# 上传目录
wrangler pages deploy prototype --project-name mysite --branch main --commit-dirty=true
```

`wrangler pages deploy` 是**增量上传**：改了 2 个文件就只传 2 个，日常更新很快。
`--commit-dirty=true` 允许工作区有未提交改动也能部署（个人站常用，正式项目建议干净再传）。

### 2.2 首次部署要顺手配的三样

**① `_headers`（放在部署目录根部，只有 Cloudflare 读）**

最小可用版：

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

/
  Cache-Control: public, max-age=0, must-revalidate

/models/*
  Cache-Control: public, max-age=31536000, immutable
```

规则：
- 页面本体 `max-age=0`，否则改完前端用户看不到新版；
- 带内容哈希的静态资源可以 `immutable` 一年；
- **同一个路径在 `models/`、`vendor/` 下要分别写**，`_headers` 不支持正则。
- MIME 类型错了要在这里显式纠正，例如 `.wasm` 必须 `application/wasm`，否则流式编译失败。

完整示例见 [templates/_headers](templates/_headers)。

**② `404.html`（有就放一个）**

没有 `404.html` 时，Cloudflare Pages 会把**任意不存在的路径回退成 `index.html` 并返回 200**。
这会让「资源缺失」看起来像「一切正常」，最难查。

**③ 缓存策略想清楚**

| 内容 | 建议 |
|---|---|
| `index.html` / 根路径 | `max-age=0, must-revalidate` |
| 带 hash 的 js/css | `max-age=31536000, immutable` |
| 模型权重、字体 | 一年 `immutable` |
| 运行时（第三方 wasm bundle） | 30 天，跟版本走，升级要清缓存 |
| favicon | 1 天，将来换图能较快生效 |

### 2.3 想要好记的域名

Pages 默认给 `项目名.pages.dev`。自定义域名在 Dashboard → 项目 → Custom domains 加，
域名托管在同一账号下会自动配 CNAME。

> **注意**：`项目名.pages.dev` 和自定义域名是同一份部署，不用重复上传。

---

## 阶段三：接通自动部署

### 3.1 如果是 Git 集成项目

**什么都不用做。** Dashboard 里配好一次构建参数即可：

| 字段 | 纯静态站 | 有构建步骤 |
|---|---|---|
| Build command | 留空 | `npm run build`（或 `node tools/build.mjs`） |
| Build output directory | 源码目录，如 `prototype` | 产物目录，如 `dist` |
| 环境变量 | 一般不需要 | 按构建脚本要求加 |

push 到 production 分支（通常是 `main`）就自动构建上线。

### 3.2 如果是 Direct Upload 项目（本项目的情况）

只能走 API Token + GitHub Actions：

```
push main → GitHub Actions → CLOUDFLARE_API_TOKEN → wrangler pages deploy → 上线
```

**第一步，创建 Token**（Cloudflare Dashboard → My Profile → API Tokens → Create Token →
Custom token）：

- 权限：`Account` → `Cloudflare Pages` → **Edit**
- Account Resources：包含你的账号
- 生成后**只显示一次**，立刻复制

**第二步，写进仓库 Secrets**（Settings → Secrets and variables → Actions）：

| 名字 | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上一步的 token |
| `CLOUDFLARE_ACCOUNT_ID` | 32 位十六进制，`wrangler whoami` 能看到 |

> Secret 值**单向加密，配完读不回来**，只能覆盖。删掉就要重新生成。
> 仓库级 Secret 对所有协作者的工作流可用，协作者不需要自己的 Cloudflare 账号。

**第三步，放工作流文件** `.github/workflows/deploy.yml`：

```yaml
name: 部署到 Cloudflare Pages

on:
  push:
    branches: [main]
  workflow_dispatch:            # 允许手动点一次

concurrency:                     # 两个人同时合并时排队，不互相覆盖
  group: pages-deploy
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4

      - name: 检查密钥是否已经配好
        run: |
          missing=0
          if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
            echo "::error::仓库缺少 Secret：CLOUDFLARE_API_TOKEN"; missing=1
          fi
          if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
            echo "::error::仓库缺少 Secret：CLOUDFLARE_ACCOUNT_ID"; missing=1
          fi
          [ "$missing" = "0" ] || exit 1

      - name: 部署到 mysite
        run: npx --yes wrangler@4 pages deploy prototype --project-name mysite --branch main
```

多站部署就再复制一段部署步骤，见 [templates/deploy.yml](templates/deploy.yml)。

**两个刻意的选择，别改回去**：

1. **不用第三方 wrangler action**。它自己猜包管理器、自己装依赖，真正的报错被包了一层。
   `npx --yes wrangler@4` 直跑，失败时原始错误原样打在日志里。
2. **单独一个「检查密钥」步骤**。GitHub 的 job 日志接口要 admin 权限才读得到
   （`/logs` 返回 403 `Must have admin rights`）。把密钥检查拆成独立 step 之后，
   **哪一步挂了在 step 列表里一眼可见**，不用读日志。

---

## 阶段四：上线核对

推完不等于上线。三步确认，全程不打开浏览器。

```bash
# 1. 等部署跑完（用 API 查，别盲等）
curl -s --ssl-no-revoke \
  "https://api.github.com/repos/OWNER/REPO/actions/runs?per_page=3" \
  | python -c "import sys,json;[print(r['head_sha'][:7],r['status'],r.get('conclusion')) for r in json.load(sys.stdin)['workflow_runs']]"

# 2. 页面里有没有新内容
curl -s https://mysite.pages.dev/ | grep -c '你要找的新元素'

# 3. 静态资源内容对不对
curl -s https://mysite.pages.dev/js/app.js | grep -o "PROJECTS = \[[^]]*\]"
```

**几个会骗人的地方：**

- **一次 push 可能产出多条 run**（部署多个项目），**全部 success 才算都上线**。
- **别请求 `/index.html`**：Cloudflare 对它回 308 跳转、body 为空，md5 是全空串，会被误读成没更新。**请求根路径 `/`。**
- **不能只看状态码**：不存在的资源也返回 200 + 首页 HTML（SPA 回退）。要看 `content-type`、字节数或 md5。
- **字节数差正好等于行数** → 是 CRLF 被归一化成 LF，不是部署失败。比对用 `tr -d '\r' < file | md5sum`。

完整排错表见 [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md)。

---

## 日常更新循环（记住这三条就够）

```bash
git fetch origin && git switch -c feat/xxx     # 1. 先 fetch，别在旧代码上干活
# 改代码
git add -A && git commit -m "feat: xxx"        # 2. 提交
git push -u origin feat/xxx                    # 3. 推分支，走 PR 合并
```

合并到 `main` 那一刻才部署。想先看效果用本地预览，不要为了看一眼就推 main：

```bash
python tools/serve.py 8931 prototype           # 打开 http://127.0.0.1:8931/
```

> 纯静态站**双击 html 一定跑不起来**：`file://` 下 ES module 被 CORS 拦、wasm 取不到。
> 这不是 bug，必须走 HTTP。别在这上面浪费时间去"修"。

---

## 参考文件

| 文件 | 内容 |
|---|---|
| [reference/github.md](reference/github.md) | 仓库初始化、SSH 配置、大文件处理、分支与 PR |
| [reference/cloudflare.md](reference/cloudflare.md) | Pages 项目模式、`_headers`、缓存、域名、限额 |
| [reference/ci.md](reference/ci.md) | Token 权限、Secrets、工作流写法、排查红叉的顺序 |
| [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md) | 上线核对命令 + 症状→原因→处理对照表 |
| [templates/deploy.yml](templates/deploy.yml) | 单站 / 多站工作流模板 |
| [templates/_headers](templates/_headers) | 可直接抄的响应头配置 |
| [templates/gitignore](templates/gitignore) | 静态站常见忽略项 |

深度背景（为什么这么选、踩过什么坑）都写在本文件里：
部署取舍在阶段二与阶段三，核对排错在 [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md)。

## 十条硬约束（违反任一条都会出事）

1. **单文件 ≤ 25 MiB**，超了整个部署失败。
2. **Direct Upload 不能改成 Git 集成**，只能 CI。
3. **没有 `404.html` 时任意路径返回 200 + 首页 HTML**，状态码不可信。
4. **`nosniff` 生效后，MIME 类型错的资源彻底不可用**，不会侥幸能跑。
5. **Secret 配完读不回来**，删了要重新生成。
6. **页面本体必须 `max-age=0`**，否则用户看旧版。
7. **直接 push main 就是直接上线**，没有缓冲；大改动走分支 + PR。
8. **`--force` 推送会覆盖别人的提交**，协作仓库禁止。
9. **`.gitignore` 漏了大文件，仓库会永久变胖**（历史里的对象删不掉）。
10. **部署成功 ≠ 用户看到新版**，浏览器缓存和边缘缓存都可能还在发旧内容，先 `Ctrl+F5` 再下结论。
