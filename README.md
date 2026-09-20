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

## 双模式：小白 / 大佬

工具栏左上角可一键切换 **小白模式** 与 **大佬模式**，选择会写入 `localStorage`，刷新后保持。

| | 小白模式（默认） | 大佬模式 |
|---|---|---|
| 节点库说明 | 一句话人话描述 | 技术性说明 |
| 节点属性 | 只显示核心字段 | 平铺全部字段 |
| 高级字段 | 折叠进「高级设置」手风琴（显示条目数） | 直接展开，带分隔线 |
| 侧边栏提示 | 顶部显示该节点「人话版」说明卡片 | 无 |

两种模式**共享同一份配置数据**，切换不会丢失任何已填内容——只是把「发散程度 / 最长回复 / 超时 / 重试」等进阶项收起来。新手可以先在小白模式下把链路跑通，再切到大佬模式精调。

## 节点类型（11 类）

节点库按 **输入 / AI 能力 / 外部数据 / 流程控制 / 输出** 五个分组展示。

| 分组 | 节点 | 作用 | 下游可引用 |
|---|---|---|---|
| 输入 | 开始 Start | 工作流入口 / 用户输入 | `{{节点ID.text}}` |
| AI 能力 | 大模型 LLM | 调用模型生成文本（system + user prompt） | `{{节点ID.content}}` |
| AI 能力 | 思维链 Chain | 分步推理：按步骤产出推理过程与最终答案 | `{{节点ID.content}}` |
| AI 能力 | 工具调用 Agent | 让模型自主决定调用哪个 HTTP 工具（function calling，最多 6 轮） | `{{节点ID.content}}` |
| 外部数据 | HTTP 工具 Tool | 真实发起 GET/POST/PUT/DELETE 请求 | `{{节点ID.body}}` / `{{节点ID.status}}` |
| 外部数据 | 网页抓取 Fetch | 抓取网页并转为纯文本（默认经只读文本代理绕过 CORS） | `{{节点ID.content}}` / `{{节点ID.title}}` |
| 流程控制 | 条件分支 Condition | JS 布尔表达式分流（true→右、false→下） | `{{节点ID.branch}}` |
| 流程控制 | 合并汇聚 Merge | 把多个上游结果聚成一份文本（按连线顺序，结果确定） | `{{节点ID.text}}` |
| 流程控制 | 循环批处理 Loop | 遍历上游数组，对每个元素**串行**跑一轮 AI 生成 | `{{节点ID.text}}` |
| 流程控制 | 代码变换 Code | `return ...` 处理数据，上游在 `input` 变量 | `{{节点ID.result}}` |
| 输出 | 输出 Output | 用模板拼最终展示文本，终止节点 | `{{节点ID.text}}` |

**变量**：任意节点配置中可用 `{{上游节点ID.字段}}` 引用上游结果，例如 `{{llm_abc.content}}`。选中节点时，右侧「可用变量」会列出所有上游节点，点击即可插入。

**循环节点**：输入 `{{loop_1.item}}` 引用当前轮元素；循环是**节点内部循环**，不会在图上产生回边，不破坏拓扑排序。硬上限 50 轮。

**网页抓取与 CORS**：浏览器无法直接跨域读取任意站点，抓取节点默认把目标 URL 交给 `https://r.jina.ai/` 只读文本代理转换；也可在大佬模式改为自定义代理前缀。

## 模板与技能

### 模板（预设工作流）

工具栏点「模板」打开画廊，内置 5 套开箱即用的工作流：

| 模板 | 内容 |
|---|---|
| 文章摘要器 | 开始 → 大模型总结 → 输出 |
| 翻译 + 润色 | 开始 → 翻译 → 润色 → 输出 |
| 双源调研对比 | 两路网页抓取 → 合并 → 对比分析 → 输出 |
| 批量分段摘要 | 开始 → 循环批处理摘要 → 合并 → 输出 |
| 带判断的问答助手 | 开始 → 条件分流 → 工具调用 Agent / 大模型 → 输出 |

载入模板会**覆盖当前画布**，因此会先弹二次确认。也可以点「导入模板文件」选择外部 `.json` 模板：

```json
{
  "name": "我的模板",
  "nodes": [
    { "id": "start_1", "kind": "start", "position": { "x": 0, "y": 120 }, "config": { "text": "输入内容" } },
    { "id": "llm_1", "kind": "llm", "position": { "x": 320, "y": 120 }, "config": { "model": "gpt-4o-mini", "content": "请总结：{{start_1.text}}" } }
  ],
  "edges": [
    { "id": "e1", "source": "start_1", "target": "llm_1" }
  ]
}
```

导入时逐节点校验 `kind`，缺失字段自动补默认值，因此手写模板只要 `nodes` 数组就能通过。

### 技能（提示词包）

**技能 = 可复用的提示词片段**。工具栏点「技能」打开技能库，内置 6 个：代码审查、文案润色、翻译专家、数据分析、结构化输出、教学讲解。

两种新建方式：

- **从文件导入**：上传 `.md` / `.txt`，取首行 `# 名称` 作为技能名（可多个文件批量选）。
- **粘贴新建**：直接填写名称与提示词正文。

**注入到节点**：选中支持技能的节点（大模型 / 思维链 / 工具调用 / 循环）后，Inspector 的「应用技能」区会列出技能，选择目标字段（如「角色设定」或「要 AI 做什么」）后点 **追加** 或 **覆盖**。技能只是把文本写进节点配置，之后可自由编辑，不是运行时依赖。

技能保存在 `flowforge.skills`，自建技能可随时删除，内置技能不可删。

## 运行模型

1. 从左侧拖入节点（或双击添加），连线（从右侧圆点拖到目标左侧圆点）。
2. 在右侧 Inspector 配置每个节点；条件节点有 true / false 两个出点。
3. 点击「运行」：执行引擎从 Start 拓扑遍历，条件节点按结果选择分支，逐节点回写状态。
4. 底部日志显示每个节点的过程与输入/输出；出错即停，保留上游结果；可「停止」中断。

## 持久化

- 编辑内容**自动保存到 localStorage**，刷新不丢失。
- 「导出 / 导入」：工作流存为 `.json` 文件。
- 「图片」：把当前画布导出为 PNG。
- 相关 key：`flowforge.settings`（API 配置）/ `flowforge.workflow`（画布）/ `flowforge.mode`（模式）/ `flowforge.skills`（自定义技能）。

## 私有网关 / 隐藏 Key（可选）

默认从浏览器直连模型端点（Key 存本地）。若要隐藏 Key 或对接不支持 CORS 的网关，可在 `vite.config.ts` 启用 `server.proxy`，把 `/llm` 转发到你的网关，并在 `src/engine/llm.ts` 把请求地址改为 `/llm/chat/completions` 即可。

## 技术栈

Vite + React 18 + TypeScript + React Flow（`@xyflow/react`）+ Zustand，纯前端静态可部署，无额外运行时依赖。

**扩展新节点**：在 `src/types.ts` 加 `NodeKind` → `src/nodeMeta.ts` 加元信息（含 `plain` 人话说明与 `group` 分组）→ `src/fieldDefs.ts` 声明该节点的字段表 → `src/engine/execute.ts` 加执行分支。Inspector 由字段表**驱动渲染**，新增节点无需改动 Inspector 代码。

## 常见问题

**页面布局错乱、按钮点不动？**
确认 `src/App.tsx` 中三个面板分别被 `.app__toolbar` / `.app__sidebar` / `.app__inspector` 包裹——
`.app` 的三栏网格依赖这些类名承载 `grid-area`，缺失会导致整个布局塌陷。修改布局时请一并检查。

**字体与系统不一致？**
界面字体通过 Google Fonts 异步加载（非阻塞）。离线或内网环境下会回退到
`PingFang SC` / `Microsoft YaHei` / `system-ui`，不影响功能。

## 已知限制

- 每个节点在单次运行中最多执行一次（有环会被拦截），适合 DAG 编排；循环节点用**内部串行循环**处理批量，而非图上回边。
- 大模型调用为非流式，便于日志与调试。
- 网页抓取受浏览器 CORS 限制，默认走只读文本代理；代理不可用时该节点会报错并停止后续。
- 工具调用 Agent 最多 6 轮，工具端点需可通过参数 `url`、工具定义 `x-endpoint` 或路径占位符解析出 URL。
- 代码 / 条件节点使用 `new Function` 执行本地工作流表达式，仅在你自己搭建的工作流中安全。
