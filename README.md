# FlowForge · AI 工作流编辑器

一个**真正可用**的浏览器端 AI 工作流编辑器：拖拽节点、连线编排 Prompt / 工具链路，点击「运行」后**真实调用大模型或外部 API**，逐节点高亮状态并输出日志，支持保存、导入导出与画布截图。

## 快速开始

```bash
npm install
npm run dev        # 本地开发，访问 http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物，访问 http://localhost:5173
```

## 在线访问

仓库已配置 GitHub Actions 自动部署到 **GitHub Pages**：推送到 `main` 即自动构建发布。

> 首次使用需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，
> 之后可在 **Actions** 页签查看部署进度，站点地址为 `https://<你的用户名>.github.io/flowforge/`。

由于 Pages 项目站点位于子路径，CI 使用 `vite build --mode pages` 让静态资源带上 `/flowforge/` 前缀；
本地开发与默认构建仍为根路径，无需任何额外配置。

## 配置 API

点击右上角 ⚙ 打开设置：

- **API Base URL**：OpenAI 兼容端点，例如
  - OpenAI：`https://api.openai.com/v1`
  - DeepSeek：`https://api.deepseek.com/v1`
  - 智谱 GLM：`https://open.bigmodel.cn/api/paas/v4`
  - 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- **API Key**：仅保存在本机浏览器 `localStorage`，不上传。
- **默认模型**：如 `gpt-4o-mini`。每个「大模型」节点也可单独指定。

> 直连方案对主流兼容端点可用（均支持 CORS）。若你的私有网关不支持 CORS，参见下文「私有网关 / 隐藏 Key」。

## 节点类型

| 节点 | 作用 | 下游可引用 |
|---|---|---|
| 开始 Start | 工作流入口 / 用户输入 | `{{节点ID.text}}` |
| 大模型 LLM | 调用模型生成文本（system + user prompt） | `{{节点ID.content}}` |
| HTTP 工具 Tool | 真实发起 GET/POST/PUT/DELETE 请求 | `{{节点ID.body}}` / `{{节点ID.status}}` |
| 条件分支 Condition | JS 布尔表达式分流（true→右、false→下） | `{{节点ID.branch}}` |
| 代码变换 Code | `return ...` 处理数据，上游在 `input` 变量 | `{{节点ID.result}}` |
| 输出 Output | 用模板拼最终展示文本，终止节点 | `{{节点ID.text}}` |

**变量**：任意节点配置中可用 `{{上游节点ID.字段}}` 引用上游结果，例如 `{{llm_abc.content}}`。选中节点时，右侧「可用变量」会列出所有上游节点，点击即可插入。

## 运行模型

1. 从左侧拖入节点（或双击添加），连线（从右侧圆点拖到目标左侧圆点）。
2. 在右侧 Inspector 配置每个节点；条件节点有 true / false 两个出点。
3. 点击「运行」：执行引擎从 Start 拓扑遍历，条件节点按结果选择分支，逐节点回写状态。
4. 底部日志显示每个节点的过程与输入/输出；出错即停，保留上游结果；可「停止」中断。

## 持久化

- 编辑内容**自动保存到 localStorage**，刷新不丢失。
- 「导出 / 导入」：工作流存为 `.json` 文件。
- 「图片」：把当前画布导出为 PNG。

## 私有网关 / 隐藏 Key（可选）

默认从浏览器直连模型端点（Key 存本地）。若要隐藏 Key 或对接不支持 CORS 的网关，可在 `vite.config.ts` 启用 `server.proxy`，把 `/llm` 转发到你的网关，并在 `src/engine/llm.ts` 把请求地址改为 `/llm/chat/completions` 即可。

## 技术栈

Vite + React 18 + TypeScript + React Flow（`@xyflow/react`）+ Zustand，纯前端静态可部署。

## 常见问题

**页面布局错乱、按钮点不动？**
确认 `src/App.tsx` 中三个面板分别被 `.app__toolbar` / `.app__sidebar` / `.app__inspector` 包裹——
`.app` 的三栏网格依赖这些类名承载 `grid-area`，缺失会导致整个布局塌陷。修改布局时请一并检查。

**字体与系统不一致？**
界面字体通过 Google Fonts 异步加载（非阻塞）。离线或内网环境下会回退到
`PingFang SC` / `Microsoft YaHei` / `system-ui`，不影响功能。

## 已知限制

- 每个节点在单次运行中最多执行一次（有环会被拦截），适合 DAG 编排。
- 大模型调用为非流式，便于日志与调试。
- 代码 / 条件节点使用 `new Function` 执行本地工作流表达式，仅在你自己搭建的工作流中安全。
