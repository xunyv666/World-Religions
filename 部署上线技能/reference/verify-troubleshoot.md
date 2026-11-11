# 上线核对与排错

## 一、推完之后的三步核对

```bash
# ① 等部署完成（API 查，别盲等）
curl -s --ssl-no-revoke \
  "https://api.github.com/repos/OWNER/REPO/actions/runs?per_page=3" \
  | python -c "
import sys,json
for r in json.load(sys.stdin)['workflow_runs']:
    print(r['head_sha'][:7], r['status'], r.get('conclusion'))
"

# ② 页面里有没有新内容
curl -s https://mysite.pages.dev/ | grep -c '新元素的特征字符串'

# ③ 静态资源内容对不对
curl -s https://mysite.pages.dev/js/app.js | grep -o "PROJECTS = \[[^]]*\]"
```

需要轮询等待时（部署通常几十秒到两分钟）：

```bash
python -c "
import json,subprocess,time
sha='你的提交短hash'
for i in range(15):
    out=subprocess.run(['curl','-s','--ssl-no-revoke',
        'https://api.github.com/repos/OWNER/REPO/actions/runs?per_page=4'],
        capture_output=True,text=True).stdout
    rs=json.loads(out).get('workflow_runs',[])
    mine=[r for r in rs if r['head_sha'].startswith(sha)]
    if mine and all(r['status']=='completed' for r in mine):
        for r in mine: print('完成:', r['head_sha'][:7], r['conclusion']); break
    print('第%d次:'%(i+1), [(r['head_sha'][:7],r['status']) for r in mine] or '还没出现')
    time.sleep(10)
"
```

### 三条铁律

1. **一次 push 可能产出多条 run**（部署多个项目），全部 success 才算都上线。
2. **请求根路径 `/`，不要请求 `/index.html`**。
   Cloudflare 对它回 308 跳转、body 为空，md5 是 `d41d8cd9…`（空串），会被误读成「线上没更新」。
3. **状态码 200 不代表内容对**。不存在的路径也回 200 + 首页 HTML。必须看 `content-type`、字节数或 md5。

## 二、症状 → 原因 → 处理

### 部署相关

| 症状 | 原因 | 处理 |
|---|---|---|
| Actions 红叉，Cloudflare 侧没有新 deployment | 鉴权没过：Secret 没配 / 名字拼错 / token 权限不够 | 看 step 列表哪一步红；本地用同一 token 跑一次 wrangler 验证 |
| 「检查密钥」步骤红 | `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_ACCOUNT_ID` 为空 | Settings → Secrets 补上，注意名字完全一致 |
| 「部署到 xxx」红，报 401/403 | token 缺 `Pages: Edit` | 重新生成 token |
| 部署失败，提示文件过大 | 单文件超 **25 MiB** | 压缩该文件或移出部署目录 |
| 部署成功但站点没变化 | 传错目录 / 缓存 | 确认 `--project-name` 和目录；再看 `CF-Cache-Status` |
| 部署成功但页面 404 | Build output directory 配错 | 检查是否指向真正包含 `index.html` 的目录 |
| 两条 run 一绿一红 | 只成功部署了一个项目 | 看红的那个项目的 step |

### 内容不对

| 症状 | 原因 | 处理 |
|---|---|---|
| `/favicon.ico` 返回 200 但图标空白 | SPA 回退返 HTML，`nosniff` 拒绝当图标解析 | 放真实 `.ico` 文件；确认 `content-type: image/x-icon` |
| 任意不存在的路径都返回 200 + 首页 | 没有 `404.html`，Pages 回退 | 提供 `404.html`，或用真文件占位 |
| 脚本/样式报「Unexpected token '<'」 | 请求 404 拿到 HTML | 检查路径；确认文件真的上传了 |
| 线上文件字节数比本地少，差值 = 行数 | CI 在 Linux 上把 CRLF 归一化成 LF | 不是故障。比对用 `tr -d '\r' < file \| md5sum` |
| wasm 加载失败、`instantiateStreaming` 报类型错 | MIME 不是 `application/wasm` | 在 `_headers` 里显式指定 |
| ES module 加载被拒 | `.mjs` 的 MIME 不对 | `_headers` 指定 `text/javascript` |
| 删掉的文件仍能访问 | 边缘缓存里的孤儿文件，最长约 7 天 | 忽略，到期自然消失；别反复重部署 |

### 「改了没生效」

排查顺序，**别跳步**：

```
1. Ctrl+F5 / 隐私窗口         ← 80% 是这个
2. curl -sI 看 CF-Cache-Status   HIT = 还在发缓存
3. 确认 index.html 是 max-age=0
4. 确认线上文件内容真的变了（grep / md5）
5. 才去 Cloudflare Dashboard 清缓存
```

### Git 相关

| 症状 | 原因 | 处理 |
|---|---|---|
| `remote: Changes must be made through a pull request.` | 提示，不是拒绝 | 看有没有 `abc..def main -> main`，有就成功了 |
| `! [rejected] ... fetch first` | 远端有新提交 | `git pull --rebase origin main` 后再推，**不要 `--force`** |
| `Permission denied (publickey)` | SSH 没配好 | 检查 `~/.ssh/config` 有无扩展名、公钥有没有加到账号 |
| `Connection refused` / 超时 | `github.com:22` 被拒 | 改成 `ssh.github.com:443` |
| 分支推上去了但 PR 列表是空的 | PR 还没创建，只推了分支 | 打开 `/pull/new/<branch>` 点 Create |
| 合并后本地落后 | 没有 pull | `git switch main && git pull --rebase origin main` |

### 网络/环境

| 症状 | 原因 | 处理 |
|---|---|---|
| `curl` 报 `CRYPT_E_NO_REVOCATION_CHECK` | 证书吊销检查被墙 | 加 `--ssl-no-revoke` |
| 大文件下载得到的大小远小于预期 | 代理截断 | **重试到 size 对得上再下结论**，别当成源文件坏了 |
| wrangler 警告 proxy 相关 | 环境有 `HTTP(S)_PROXY` | 通常可忽略；真失败再设 `NO_PROXY` |
| 本地 `http://127.0.0.1` 打不开 | 系统代理拦截了本地请求 | `curl --noproxy '*'`；浏览器里加例外 |

## 三、本地预览

```bash
python tools/serve.py 8931 prototype      # 打开 http://127.0.0.1:8931/
```

自定义 `serve.py` 比标准 `http.server` 多补了几个 MIME 映射，**不加就对不上线上行为**：

```python
mimetypes.add_type('application/wasm', '.wasm')   # 不加 wasm 加载失败
mimetypes.add_type('text/javascript', '.mjs')     # ES module 必须这个类型
mimetypes.add_type('application/octet-stream', '.task')
mimetypes.add_type('image/x-icon', '.ico')        # 不加本地图标不显示
```

写一个这样的脚本，把 `SimpleHTTPRequestHandler` 的 `directory` 指向部署目录即可。
每次改完先本地看一眼，**不要为了看效果就推 main**。

> **双击 html 一定跑不起来**：`file://` 下 ES module 被 CORS 拦、wasm 取不到、fetch 全部失败。
> 这是浏览器安全策略，不是代码 bug。所有测试都必须走 HTTP。

## 四、出事了的第一反应对照表

| 现象 | 第一反应（对的） | 错误的第一反应 |
|---|---|---|
| 页面白屏 | 开控制台看报错、看 Network 里哪个请求失败 | 怀疑部署失败、反复重部署 |
| 图标空白 | 看 `content-type` 是不是 `image/x-icon` | 反复替换图标文件 |
| 改了没生效 | `Ctrl+F5`，再看 `CF-Cache-Status` | 怀疑 Actions 没跑 |
| Actions 红叉 | 看 step 列表哪一步红 | 反复看日志（可能没权限读） |
| 样式突然大面积失效 | 数 CSS 括号 | 怀疑浏览器缓存 |
| 分析/功能不工作 | 先问「你是双击打开还是开的网址」 | 怀疑后台服务挂了（纯静态站没有后台） |
