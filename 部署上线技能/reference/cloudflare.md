# Cloudflare Pages 侧

## 一、两种项目模式，选错要重来

| 模式 | 建的时候怎么选 | 自动部署 | 能不能改 |
|---|---|---|---|
| **Git 集成** | 连接 GitHub 仓库，授权 | 原生，push 即构建 | 可改绑定分支 |
| **Direct Upload** | 不连仓库，wrangler 直传 | ❌ 不支持 | **不能改成 Git 集成** |

> Cloudflare 官方不支持把已创建的 Direct Upload 项目转为 Git 集成。
> 要自动部署只有两条路：新建 Git 项目（换域名），或 Actions + API Token（保域名）。

### Git 集成的构建参数

| 字段 | 纯静态站 | 有构建步骤 |
|---|---|---|
| Framework preset | None | 按需选 |
| Build command | 留空 | `npm run build` / `node tools/build.mjs` |
| Build output directory | 源码目录，如 `prototype` | 产物目录，如 `dist` / `.` |
| Root directory | 一般留空 | monorepo 时填子目录 |

**Build output directory 填 `.`（仓库根）是合法的**，用于构建脚本把文件摊平到根目录的场景。

> 改了 output directory 但页面 404，第一个要怀疑的就是这里：Cloudflare 找不到 `index.html` 会回退，
> 看起来像"部署成功但内容不对"。

### 常见误判：直接传子目录 vs 传仓库根

纯静态项目上传 `prototype/` 时，**`prototype/index.html` 会成为站点根 `/`**。
不要期望线上是 `/prototype/index.html`——这个目录只是本地组织方式，不体现在 URL 上。

## 二、wrangler 命令

```bash
wrangler login                          # 浏览器授权，凭据存本机
wrangler whoami                         # 看账号和 Account ID
wrangler pages project list             # 列出所有项目

wrangler pages project create mysite --production-branch main
wrangler pages deploy prototype --project-name mysite --branch main

# 工作区有未提交改动也允许部署（个人站图快时用）
wrangler pages deploy prototype --project-name mysite --branch main --commit-dirty=true

# 部署预览环境（不覆盖生产）
wrangler pages deploy prototype --project-name mysite --branch preview
```

**增量上传**：只传有变化的文件。改 2 个文件就只传 2 个，日常更新通常几秒完成。
所以「多站同步」也不会很贵——只是多跑一次命令。

### 凭据存在哪

Windows 上 OAuth 凭据在：

```
C:\Users\<user>\AppData\Roaming\xdg.config\.wrangler\config\default.toml
```

需要重新授权时跑 `wrangler login`，会开浏览器点 Allow。**不需要手动准备 API Token**。

> 环境里配了 `HTTP(S)_PROXY` 时 wrangler 会打警告，但通常仍能正常工作。
> 真失败时再考虑 `NO_PROXY`。

## 三、`_headers`

纯文本，放在**部署目录根部**（如 `prototype/_headers`），只有 Cloudflare 读，GitHub Pages 忽略。

### 语法要点

```
/*                          ← 路径模式，支持 * 通配
  Header-Name: value        ← 两个空格缩进
  Another: value

/具体路径
  Cache-Control: public, max-age=0
```

- 一个块内多条头，**每条单独一行、两空格缩进**
- 匹配是前缀/通配，**不支持正则**
- 同一路径可以被多个块命中，靠后的补充/覆盖
- 注释用 `#`

### 一份能直接用的配置

见 [../templates/_headers](../templates/_headers)。核心几组：

```
/*                                          安全头，全站
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/                                           页面本体不缓存
  Cache-Control: public, max-age=0, must-revalidate

/assets/*                                   带 hash 的产物，永久
  Cache-Control: public, max-age=31536000, immutable

/models/*                                   模型权重，一年
  Cache-Control: public, max-age=31536000, immutable

/vendor/*                                   运行时跟版本走，30 天
  Cache-Control: public, max-age=2592000
```

### 什么时候必须在 `_headers` 里写 Content-Type

Cloudflare 按扩展名猜 MIME，猜错时靠这里纠正。已知会出问题的：

| 扩展名 | 正确类型 | 不写会怎样 |
|---|---|---|
| `.wasm` | `application/wasm` | 流式编译失败，`instantiateStreaming` 报错 |
| `.mjs` | `text/javascript` | ES module 加载被拒 |
| `.ico` | `image/x-icon` | 图标不显示 |
| `.task` / 自定义二进制 | `application/octet-stream` | 被当文本猜、内容损坏 |

**`nosniff` 是双刃剑**：它保证浏览器不瞎猜类型（安全），但也意味着类型错了就彻底不工作，
不会侥幸能用。安全头和正确 MIME 必须同时到位。

## 四、SPA 回退：最容易骗人的一个行为

没有 `404.html` 时，**任意不存在的路径都会回退到 `index.html`，并且返回 200**。

```
$ curl -I https://site.pages.dev/favicon.ico
HTTP/2 200                          ← 看起来正常
content-type: text/html             ← 实际返回的是整页 HTML
```

后果：

- 图标永远空白（HTML 不会被当图标解析）
- 脚本 404 变成「拿到一页 HTML 然后语法报错」
- 用状态码做健康检查会全部误判为正常

**正确判断方式**：

```bash
curl -sI URL | grep -i content-type          # 类型对不对
curl -s URL | head -c 80                     # 内容对不对
curl -s URL -o /tmp/x && stat -c %s /tmp/x   # 字节数对不对
```

要修就两步：放真正的文件，或者提供 `404.html`。

## 五、限额与行为

| 项 | 值 | 影响 |
|---|---|---|
| 单文件大小 | **25 MiB** | 超了**整站**部署失败 |
| 删除的文件 | 边缘缓存仍可能命中，最长约 7 天 | 「删了还能访问」是缓存，不是没删掉 |
| 部署并发 | 一次 push 部署多个项目会产出多条 run | 全部 success 才算都上线 |

### 删除文件后的缓存残留

删掉整个目录后，旧路径仍返回 200、`CF-Cache-Status: HIT`、`Age: 15507`、`s-maxage=604800`。
**这是边缘缓存里上一版的孤儿文件，到期自然消失，无害。**
别拿「还能访问到」当成删除失败，也别为此反复重新部署。

### 缓存导致的「改了没生效」

排查顺序：

1. `Ctrl+F5` / 隐私窗口打开
2. 看响应头 `CF-Cache-Status`：`HIT` = 还在发缓存
3. 确认 `index.html` 是 `max-age=0`
4. 只有确认真的是缓存问题，才去 Dashboard 清缓存

> 大部分「没生效」其实是浏览器本地缓存，不是 Cloudflare。

## 六、一个仓库部署多个站

两种组织方式：

| 方式 | 优点 | 代价 |
|---|---|---|
| 一个 Pages 项目 + 子路径（`/shootlab/`） | 共用域名，一个项目 | 子路径下相对路径/`<base>` 容易出错，代码可能被迫复制两份 |
| 多个 Pages 项目 + 各自域名 | 互相独立，互不影响 | 要维护多条部署命令/步骤 |

**别让同一个页面存在两份源码。** 曾经主站放了一份 53MB 副本，结果两边代码不同步。
正确做法是代码只在一个仓库，另一个位置放跳转页：

```html
<script>location.replace('https://主站地址/')</script>
<meta http-equiv="refresh" content="0;url=https://主站地址/">
```

老链接不 404，代码不再有两份。
