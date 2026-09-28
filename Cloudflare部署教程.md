# 在 Cloudflare 官网上部署 FlowForge（纯网页操作，不用命令行）

> 全程在浏览器里点，**不需要安装任何东西、不需要敲命令**。
> 你只需要一个 Cloudflare 账号（免费注册即可）。

---

## 先选一条路

Cloudflare Pages 在官网有**两种**创建方式，**只有一种会让你填「部署设置」**：

| 路线 | 有没有「部署设置」 | 适合场景 |
|---|---|---|
| **方案一：拖拽上传（Direct Upload）** | ❌ 没有（上传的就是已构建好的成品） | 想马上上线、代码还没进 GitHub |
| **方案二：连接 Git 仓库** | ✅ **有完整构建设置** | 想 push 自动部署、需要填构建配置 |

👉 **你要的"部署设置"在【方案二】。** 方案一先讲最快上线，方案二详列全部设置项。

---

# 准备：注册 / 登录 Cloudflare

打开 [dash.cloudflare.com](https://dash.cloudflare.com/) 登录。没有账号点 **Sign up** 免费注册，邮箱验证即可，**不需要绑信用卡、不需要买域名**。

---

# 方案一：拖拽上传（最快上线，无部署设置）

## 第 1 步：进入 Workers & Pages

登录后，左侧导航栏点 **Workers & Pages**（中文界面可能是「计算 (Workers)」）。

直达链接：[dash.cloudflare.com/?to=/:account/workers-and-pages](https://dash.cloudflare.com/?to=/%3Aaccount/workers-and-pages)

## 第 2 步：点创建

页面右上角点 **Create application**（创建应用程序）。

## 第 3 步：选 Pages 标签

弹窗顶部有两个标签：**Workers** 和 **Pages**。点 **Pages** → 再点 **Get started**（开始使用）。

## 第 4 步：选拖拽上传

Pages 给出三个选项：

| 选项 | 说明 |
|---|---|
| Import an existing Git repository | 连接 GitHub 自动部署（→ 方案二） |
| **Drag and drop your files** | 直接拖文件上传 ← **选这个** |
| Use direct upload | 用命令行上传 |

## 第 5 步：填项目名

**Project name** 填：`flowforge`

> 决定网址：没被占用就是 `https://flowforge.pages.dev`；被占用则自动加后缀（以页面显示为准）。

## 第 6 步：拖入 zip

把 **`flowforge-site.zip`** 拖进虚线框（也支持拖整个 `dist` 文件夹）。上传后应显示 **4 个条目**（1 个 index.html + 1 个 assets 目录 + 2 个资源文件）。

## 第 7 步：点 Deploy site

点 **Deploy site**（部署站点），等 10~30 秒出现绿色 **Success**。

## 第 8 步：访问

打开 `https://flowforge.pages.dev`，看到编辑器画布即成功 ✅

---

# 方案二：连接 Git 仓库（有完整部署设置）★

> **这就是你要的「部署设置」。** 这条路 Cloudflare 会自动帮你构建，所以要填构建命令、输出目录等。

## 前置条件

代码已在 GitHub 仓库里（你的仓库：`POTATO-creater/flowforge`）。

## 第 1~4 步：同方案一，但第 4 步选不同

进入 **Workers & Pages** → **Create application** → **Pages** 标签 → **Get started** → 这次选 **Import an existing Git repository**（连接 Git 仓库）。

## 第 5 步：授权并选仓库

1. 点 **Connect GitHub**，在弹窗里授权 Cloudflare 访问你的 GitHub
2. 可以选 **All repositories** 或只授权 `flowforge` 这一个
3. 回到页面，在仓库列表里选中 **`POTATO-creater/flowforge`**
4. 点 **Begin setup**（开始设置）

---

## 第 6 步：部署设置（重点，逐项填）

这一步页面叫 **Set up builds and deployments**，字段如下——**请严格照下表填**：

| 设置项 | 填什么 | 说明 |
|---|---|---|
| **Project name** | `flowforge` | 项目名，决定 `xxx.pages.dev` 网址 |
| **Production branch** | `main` | 只有这个分支的 push 才会正式发布 |
| **Framework preset** | `React (Vite)` | 选中后会自动带出下面两项；选不到就选 `Vite` 或 `None` |
| **Build command** | `npm run build` | ⚠️ **不要加 `--mode pages`**，原因见下方「关键坑」 |
| **Build output directory** | `dist` | 你的 Vite 产物目录 |
| **Root directory** | *（留空）* | 仓库根就是项目根，不用填 |
| **Environment variables** | 见下表 | 至少加一个 `NODE_VERSION` |

### 环境变量（点 Add variable 逐条加）

| 变量名 | 值 | 为什么 |
|---|---|---|
| `NODE_VERSION` | `20` | 你项目用 Vite 5 + TS 5，Node 20 最稳；不设可能默认到过旧版本导致构建失败 |
| `NPM_FLAGS` | `--legacy-peer-deps` | **可选**。若构建报 peer dependency 冲突就加上 |

> 加环境变量的位置：如果创建时没看到，之后可在 **项目 → Settings → Environment variables** 补加，然后重新部署。

---

## 第 7 步：保存并部署

点 **Save and Deploy**（保存并部署）。

Cloudflare 会：拉取代码 → 装依赖 → 执行 `npm run build` → 把 `dist` 发布到全球 CDN。
首次构建约 **1~2 分钟**，页面会实时显示构建日志。

## 第 8 步：访问

构建成功后打开 `https://flowforge.pages.dev`。

---

## 关键坑：为什么 Build command 不能加 `--mode pages`？

你的 `vite.config.ts` 里有这段：

```ts
base: mode === 'pages' ? '/flowforge/' : '/',
```

- `--mode pages` 会把资源路径改写成 `/flowforge/`，**那是给 GitHub Pages 用的**（因为 GitHub 项目站点在 `/<repo>/` 子路径下）。
- Cloudflare Pages 部署在**域名根路径**，必须用默认的 `/`。
- 所以 Cloudflare 的 Build command 只能是 **`npm run build`**（不带参数）。填错会导致页面白屏、JS/CSS 全 404。

> 如果你以后不用 GitHub Pages 了，可以把这行 `base` 逻辑删掉，彻底避免混淆。

---

## 自动部署行为（设置好之后）

| 你做的事 | Cloudflare 的反应 |
|---|---|
| push 到 `main` | 自动构建并发布到 `flowforge.pages.dev` |
| push 到其他分支 | 自动构建出**预览环境**，网址为 `<分支名>.flowforge.pages.dev` |
| 提 Pull Request | 在 PR 里自动贴出预览链接 |
| 在项目里点 **Retry deployment** | 重新跑一次构建 |

---

## 绑定自有域名（可选）

1. 进入项目 → **Custom domains**（自定义域）→ **Set up a custom domain**
2. 输入域名（如 `flow.example.com`）
3. 域名托管在 Cloudflare 则自动添加 CNAME；否则去你的 DNS 服务商加 CNAME 指向 `flowforge.pages.dev`
4. HTTPS 证书自动签发，1~5 分钟生效

---

# 常见问题

### Q：为什么用 Pages 不用 Workers？
FlowForge 是**纯前端静态应用**（React + Vite 编译出的 HTML/JS/CSS），零服务端逻辑。Pages 专为托管前端应用设计：免费、自带全球 CDN、配置最简单。Workers 是跑服务端代码的，这里用不上。

### Q：需要用 SPA 路由配置吗？
**不需要。** Pages 默认规则：项目里只要**没有**顶层 `404.html`，所有未知路径自动回落给 `index.html`。你的项目确认没有 `404.html`，零配置即可。
（若以后加了 `404.html`，需在 `dist/` 加 `_redirects` 文件，内容：`/*    /index.html   200`）

### Q：部署后白屏 / 资源 404？
按顺序查：
1. **Build command 是否误加了 `--mode pages`** ← 最常见原因，见上方「关键坑」
2. **拖拽方案的 zip 结构**：根目录必须直接是 `index.html` 和 `assets/`。若压成了 `dist/index.html`（多套一层）就会 404，需进 `dist` 目录内部再压缩
3. 看构建日志有没有 `npm install` 报错，必要时加 `NPM_FLAGS=--legacy-peer-deps`

### Q：免费吗？
**免费。** Pages 免费额度：每月 500 次构建、无限带宽与请求、100 个自定义域。个人项目绰绰有余。

### Q：两种方案能混用吗？
Direct Upload 项目**不能**改回 Git 集成，反之亦然。想自动部署就一开始选 Git 集成。但 Direct Upload 项目之后仍可用命令行 `wrangler pages deploy` 更新。

---

# 一句话总结

- **要快速上线** → 拖拽 `flowforge-site.zip`，**没有部署设置**
- **要部署设置 / 自动部署** → 连 Git 仓库，填：`npm run build` + `dist` + `NODE_VERSION=20`

> 两条路的入口都在：**Workers & Pages → Create application → Pages**
