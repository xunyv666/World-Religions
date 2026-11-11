# 部署上线技能

从本地代码到线上可访问，一整条链路的操作手册：
**整理进 GitHub 仓库 → 在 Cloudflare Pages 建站 → 接通自动部署 → 核对真的生效了**。

所有命令都在这个项目上真跑过，数字都是实测值，不是示例。

## 先看这个

| 你现在的情况 | 打开哪份 |
|---|---|
| 不知道从哪开始 | [SKILL.md](SKILL.md) ← 主流程，四个阶段 |
| 代码还没进过 GitHub | [SKILL.md · 阶段一](SKILL.md#阶段一代码进-github) |
| 有仓库，没上过线 | [SKILL.md · 阶段二](SKILL.md#阶段二在-cloudflare-建项目) |
| 每次都要手动传，想自动化 | [SKILL.md · 阶段三](SKILL.md#阶段三接通自动部署) |
| 刚推完，想确认真的生效了 | [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md) |
| 部署红了 / 页面还是旧的 | [reference/verify-troubleshoot.md](reference/verify-troubleshoot.md) |

## 目录

```
部署上线技能/
├── SKILL.md                        主流程（含技能声明，可直接安装）
├── README.md                       本文件：索引
├── reference/
│   ├── github.md                   仓库初始化、SSH 443、大文件、分支、PR
│   ├── cloudflare.md               项目模式、_headers、缓存、限额
│   ├── ci.md                       Token 权限、Secrets、工作流、排查红叉
│   └── verify-troubleshoot.md       上线核对命令 + 症状对照表
└── templates/
    ├── deploy.yml                   多站自动部署工作流，改名即用
    ├── _headers                     响应头与缓存配置
    └── gitignore                    静态站常见忽略项
```

## 和项目文档怎么分工

| | 仓库根目录 | 这里 |
|---|---|---|
| 面向 | 这个地图本身 | 换个项目照样能用 |
| 内容 | 目录结构、底图重建、数据口径、上线清单 | 步骤、命令、模板、排错表 |
| 举例 | 「底图怎么重建」 | 「新建项目时该选哪种模式」 |

两边互相引用，不重复抄。地图本身怎么改见 [../README.md](../README.md)。

## 怎么在别的项目里用

**直接复制文件夹**（大部分情况够了）：

```bash
cp -r "部署上线技能" "其他项目/"
```

**装成全局技能**（任意项目都能被 AI 调用）：

```bash
cp -r "部署上线技能" ~/.workbuddy/skills/deploy-cloudflare
```

> 装到全局时**建议改成英文目录名**（如上）。技能名本身来自 `SKILL.md` 里的
> frontmatter（`name: deploy-cloudflare-pages`），和文件夹叫什么无关，
> 但英文路径在各类工具链里更省事。

之后在任意会话里说「帮我部署上线」，读的就是这套流程。

## 三条最容易翻车的

1. **状态码 200 不能当证据**。没有 `404.html` 时，Cloudflare 对任意不存在的路径都回退成首页 HTML 并返回 200。判断资源对不对要看 `content-type`、字节数或 md5。
2. **单文件超 25 MiB 会让整站部署失败**。不是那个文件传不上去，是全站都上不去。
3. **Direct Upload 项目不能改成 Git 集成**。想要自动部署只能 Actions + Token，重建项目会换域名。
