# GitHub 侧：把代码整理进仓库

## 一、仓库从零到可用

```bash
cd "项目目录"
git init
git add .
git commit -m "init: 项目初始化"
git branch -M main
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

`-u` 建立追踪关系，之后这个分支只要 `git push` / `git pull`，不用带分支名。

### 仓库名和分支名

- 仓库名用小写短横线：`shootlab`、`my-site`
- 分支名同理：`feat/rope-counter`、`fix/video-play`
- 中文分支名在某些系统上会出问题，别用

## 二、SSH 一次配好，永久免密

### 生成与添加

```bash
ssh-keygen -t rsa -b 3072 -C "you@example.com"   # 一路回车
cat ~/.ssh/id_rsa.pub                            # 贴到 GitHub → Settings → SSH keys
```

### 国内网络必须走 443

`github.com:22` 经常被拒。`~/.ssh/config`（**文件名没有扩展名**，写成 `config.txt` 会静默失效）：

```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
```

验证：

```bash
ssh -T git@github.com     # 期望：Hi USER! You've successfully authenticated...
```

> 报 `Permission denied (publickey)` 先查两件事：`~/.ssh/config` 有没有扩展名、公钥有没有真的加到账号。

### 为什么不配 HTTPS 凭据

本机如果没装 git credential helper，`git push https://...` 每次都要密码，
自动化脚本里直接卡死。SSH 一次配好，长期省事。

## 三、什么不该进仓库

先量体积，再决定：

```bash
du -sh * | sort -h | tail -10
```

`.gitignore` 常见项：

```gitignore
node_modules/
dist/
.DS_Store
Thumbs.db
*.log

# 大素材（视频、模型、原始素材）
*.mp4
*.mov
*.psd

# 临时产物
.shots/
_probe*
_bench*
*.tmp
.env
```

**为什么视频必须排除**：

| 限制 | 数值 | 后果 |
|---|---|---|
| Cloudflare Pages 单文件 | 25 MiB | 超了**整站**部署失败 |
| GitHub 单文件建议 | 50 MiB 警告 / 100 MiB 拒绝 | 仓库永久变胖 |

已实测的案例：一段 42.9MB 的原始视频，压到 640×360 / 21.3MB 才能传。
**历史里已经提交过的大文件删不掉**（只删文件不瘦历史），只能 `filter-repo` 重写历史，
代价很大。所以第一次 `git add` 之前就要把 `.gitignore` 写对。

### 已经误提交了大文件怎么办

```bash
git rm --cached 大文件.mp4          # 从索引移除，保留本地文件
echo "大文件.mp4" >> .gitignore
git commit -m "chore: 移出大文件"
```

这样后续提交不再带它，但**历史对象仍在**。仓库体积敏感时才需要重写历史，且要通知所有协作者重新 clone。

## 四、远端已有内容时怎么接

**动手前永远先 fetch**：

```bash
git fetch origin --prune
git log --oneline origin/main -5
git rev-list --left-right --count HEAD...origin/main   # 左=本地领先 右=远端领先
```

多人协作最常见的白干：本地落后好几个提交还在改同一批文件，最后冲突一大片。

标准动作：

```bash
git switch -c feat/xxx          # 从当前 HEAD 开分支
# 改代码
git add -A && git commit -m "feat: xxx"
git rebase origin/main          # 把自己的提交接到远端最新之上
git push -u origin feat/xxx
```

用 `rebase` 不用 `merge`：分支历史是直线，合并回 main 时干净、好回滚。

### 冲突处理

```bash
git status                      # 看哪些文件冲突
# 手工改文件，删掉 <<<<<<< ======= >>>>>>> 三段标记
git add 冲突文件
git rebase --continue
```

想整体放弃：`git rebase --abort`，回到操作前。

**解冲突的原则：以线上版本为骨架，把新增叠上去。**
不要整段保留自己那份——那等于把同学的改动回退了。

**解完必做三件事**（本项目踩过的坑）：

1. `grep -rn '^<<<<<<<\|^=======$\|^>>>>>>>' 改动文件` 确认标记清干净
2. `node --check js/app.js` 之类的语法检查
3. **CSS 要数括号**：

```bash
node -e "
const fs=require('fs');
let s=fs.readFileSync('css/style.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
let d=0,line=1,bad=[];
for(const c of s){ if(c==='\n')line++; if(c==='{')d++; if(c==='}'){d--; if(d<0){bad.push('line '+line);d=0;}} }
console.log('深度='+d+' 多余右括号='+(bad.length?bad.join(','):'无'));
"
```

> 多一个 `}` 会让**后面整条规则被浏览器静默丢弃**——不报错、其他样式全正常，
> 只有那一条失效。症状是「某个组件样式突然没了」，极难看出来。

## 五、协作者

### 权限

Settings → Collaborators 添加对方 GitHub 用户名，权限给 **Write** 就够（能推分支、能开 PR）。
Admin 权限可以改仓库设置和 Secrets，一般不需要。

### 协作者怎么部署

三种情况：

| 部署方式 | 协作者需要什么 |
|---|---|
| Cloudflare **Git 集成** | 什么都不需要，push 就自动部署 |
| **Actions + Token**（本仓库） | 什么都不需要，Secret 在仓库级，工作流替他跑 |
| 本机 `wrangler deploy` | 需要自己的 Cloudflare 账号并加入同一团队 |

这就是当初选 Actions 的原因：**四个协作者 push 都能上线，不必谁本机登录 wrangler。**

### 分支保护要不要开

- 开：所有改动必须走 PR，`main` 干净，但**自己也必须走 PR**，多一步。
- 不开：直接 push 就上线，快，但**没有「试一下不行再撤回」的缓冲**。

开了之后如果别人仍能直接 push，检查 Settings → Rules 里那条规则集的
`enforcement` 是不是 `Disabled`——disabled 状态等于没开。

## 六、PR（Pull Request）

```bash
git push -u origin feat/xxx
```

推送成功后 GitHub 仓库首页会出现黄色提示条和 `Compare & pull request` 按钮，
或者直接打开：

```
https://github.com/USER/REPO/pull/new/feat/xxx
```

点 **Create pull request** → 看 diff → **Merge pull request**。

### 关于「让 AI 帮你建 PR」

本机没有 `gh` CLI、没有 `GITHUB_TOKEN`、没有 `.git-credentials` 时，
SSH 密钥只能推代码、**调不了 GitHub API**，所以创建不了 PR。
这时只能推分支 + 给出上面那个链接，由人点一下确认。

**这反而是更安全的默认行为**：合并到 main 会立刻触发部署，让本人把关一次值得。
