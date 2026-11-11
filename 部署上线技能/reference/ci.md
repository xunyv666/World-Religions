# CI：GitHub Actions 自动部署

只用于 **Direct Upload 模式**的项目。Git 集成项目不需要这一套。

## 一、Token 权限

Cloudflare Dashboard → My Profile → API Tokens → Create Token → **Custom token**：

| 项 | 值 |
|---|---|
| 权限 | `Account` → `Cloudflare Pages` → **Edit** |
| Account Resources | Include → 你的账号 |
| Zone Resources | 不需要（没有自定义域也可留空） |
| TTL | 按需，长期项目可不设 |

生成后**只显示一次**。丢了只能重新生成（旧的即刻失效）。

> 常见错误：只给了 `Pages: Read`。表现是部署时 401/403，报错文字不一定直白说权限不足。

## 二、Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| 名字 | 从哪拿 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上一步 |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler whoami` / Dashboard URL 里的 32 位十六进制 |

特点：

- **单向加密，配完读不回来**，只能覆盖
- 仓库级 Secret 对所有协作者的工作流可用，**协作者不需要自己的 Cloudflare 账号**
- GitHub 不会把 Secret 打进日志（日志里显示 `***`）

## 三、工作流写法

完整模板见 [../templates/deploy.yml](../templates/deploy.yml)。

关键点逐条说明：

### 触发条件

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:      # 允许在 Actions 页面手动点一次重跑
```

`workflow_dispatch` 很有用：Secrets 配错时不用空提交，直接手动重跑验证。

### 并发锁

```yaml
concurrency:
  group: pages-deploy
  cancel-in-progress: true
```

两个人同时合并时排队，后一次取消前一次未完成的运行，避免两次部署互相覆盖。

### 不用第三方 action

```yaml
# 不要这样
- uses: cloudflare/wrangler-action@v3

# 这样
- run: npx --yes wrangler@4 pages deploy prototype --project-name mysite --branch main
```

第三方 action 会自己猜包管理器、自己装 wrangler，**真正的报错被包了一层**，
日志里只看到"action failed"。直跑 npx，原始错误原样输出。

### 单独一步检查密钥

```yaml
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
```

原因：**GitHub 的 job 日志接口要 admin 权限**（`/logs` 返回 403 `Must have admin rights`），
协作者身份读不到日志。把密钥检查拆成独立 step 之后，
**哪一步挂了在 step 列表里一眼可见**，不需要读日志就能判断。

`::error::` 是 GitHub 的注解语法，会把这句话直接显示在文件变更行上。

### 多项目部署

```yaml
- name: 部署到 A
  run: npx --yes wrangler@4 pages deploy prototype --project-name site-a --branch main

- name: 部署到 B
  run: npx --yes wrangler@4 pages deploy prototype --project-name site-b --branch main
```

同一份代码传两次，**每次 push 产出两条 workflow run，两条都 success 才算都上线**。
只看一条绿就宣布上线，可能只有一个站更新了。

## 四、排查红叉：照这个顺序，别乱猜

```
1. Cloudflare 侧有没有出现新 deployment？
   ├─ 有  → 鉴权通过，问题在构建/上传，看 step 列表
   └─ 没有 → 卡在鉴权：Secret 没配 / 名字拼错 / token 权限不够

2. step 列表里哪一步红了？
   ├─ 「检查密钥」   → Secret 名字或值不对
   ├─ 「部署到 xxx」 → 看报错原文，常见是 token 缺 Pages:Edit
   └─ 「checkout」   → 仓库权限或触发分支问题
```

### 最高效的一招：本地验证凭据

```bash
CLOUDFLARE_API_TOKEN=xxx wrangler pages deploy prototype --project-name mysite --branch main
```

| 结果 | 结论 |
|---|---|
| 本地成功 | **凭据没问题，问题在 CI**（Secrets 没配上 / 名字拼错 / 工作流没读到） |
| 本地失败 | 凭据本身失效或权限不足，重新生成 token |

一次就能分清方向，比反复看日志快得多。

### 实战记录

本项目曾经连续红叉十几次，最后定位过程：

1. 看 Cloudflare 有没有新 deployment → **没有**，说明根本没走到上传
2. 看 step 列表 → **「检查密钥」红** → 说明 Secret 一条都没配上
3. 用用户给的 token 本地跑一次部署 → **成功**，证明 token 没问题
4. 结论：问题在 GitHub 侧 Secrets，不是 Cloudflare、不是工作流

**这个顺序的价值**：它把「凭据坏了」和「自动化配置漏了」彻底分开，
避免在两边来回怀疑。

## 五、几个容易误读的信号

| 日志/现象 | 真实含义 |
|---|---|
| `remote: Changes must be made through a pull request.` | **提示，不是拒绝**。看有没有 `abc..def main -> main` |
| 平局日志里 `Retrying...` | 网络重试，正常 |
| `os.environ.get('CLOUDFLARE_API_TOKEN')` 为空 | Secret 没配，或 step 没在 `env` 里引用 |
| 部署成功但页面旧 | 缓存问题，不是 CI 问题 |
| 工作流文件改了但没触发 | 改的是 `.github/workflows/` 下的文件才触发，且默认分支上的改动才影响后续运行 |

## 六、安全

- **Token 只放 Secrets，不要写进代码、不要提交到仓库**
- 聊天记录里发过的 token 建议用完立刻轮换
- 协作者离职后：移除仓库权限 → 轮换 token（他的历史 PR 里可能留有痕迹）
- 定期在 Cloudflare 后台看 API Tokens 列表，删掉不用的
