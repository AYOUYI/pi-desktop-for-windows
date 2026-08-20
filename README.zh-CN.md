# Pi Desktop

[English](README.md) | **[简体中文](README.zh-CN.md)**

基于 [pi coding agent](https://github.com/earendil-works/pi) 的 Windows 原生桌面客户端，聊天式 UI 对标 Codex/ZCode 类编码助手。构建在 pi 官方 SDK（`@earendil-works/pi-coding-agent`）之上，SDK 进程内运行——不依赖 CLI 子进程，不自造私有配置格式。

## 功能特性

- **ZCode 风格界面** —— 按工作区分组的会话侧边栏（可折叠、相对时间、修改状态点）、顶部多会话标签页（支持并行）、底部输入区带模型/思考级别芯片和 git 变更统计
- **流式聊天** —— Markdown 渲染 + shiki 语法高亮、代码复制按钮、思考过程折叠、消息级与会话级 token 用量和成本显示
- **工具卡片** —— read/bash/edit/write/grep：bash 实时输出尾部、退出码、edit/write 的彩色 diff 视图（统一补丁格式）
- **会话管理** —— 从磁盘恢复任意会话（与 pi CLI 共享）、多 Tab 并行 agent、会话派生（从当前对话末尾分叉）+ 侧边栏分支树、导出 HTML
- **设置中心** —— 供应商状态与 API Key（走 pi 官方 `login` API 写入，热加载）、自定义 OpenAI 兼容供应商（Ollama/vLLM）、技能与扩展管理、主题/强调色/字号定制、默认模型与 Shell 路径
- **Windows 集成** —— 系统托盘 + 关闭到托盘、NSIS 安装包、程序化生成的应用图标；兼容 Git Bash（自动探测）

## 架构

```
Electron 主进程 (ESM)
├── PiBridge 抽象层
│   ├── SdkBridge   — 进程内 createAgentSession()（默认）
│   └── RpcBridge   — `pi --mode rpc` 子进程（预留降级方案）
├── SettingsService — 通过 pi API 读写 auth.json / models.json / settings.json
├── SessionsService — SessionManager.listAll() 会话列表、git 统计
└── 类型化 IPC → 渲染进程
渲染进程 (React 19 + Zustand + virtua)
└── 按 Tab 分片的状态、transcript 折叠、虚拟化列表
```

所有配置与会话数据都在 `~/.pi/agent`，与 pi CLI 完全共享——模型、认证、技能、扩展、会话在两者之间互通。

## 快速开始

### 前置条件

- **运行**：安装版无额外要求（Electron 自带 Node ≥ 22.19）
- **bash 工具**：[Git for Windows](https://git-scm.com/download/win)（自动探测，可在设置中指定路径）
- **认证**：至少一个供应商 —— 设置 → 模型供应商，或 `pi auth login`，或环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
- **开发**：Node.js ≥ 22.19、npm 10+

### 开发

```bash
npm install        # Electron 二进制走 npmmirror 镜像（见 .npmrc）
npm run icons      # 重新生成应用图标（build/icon.ico、icon.png）
npm run typecheck
npm run dev        # 启动开发模式
```

### 冒烟测试

```bash
npx electron . --smoke           # ESM 主进程 + pi SDK 初始化 + 模型列表
npx electron . --smoke-settings  # 配置读取路径（基于真实配置实测）
npx electron . --smoke-resume    # 会话列表 + 恢复回放
npx electron . --smoke-chat      # 经桥接层的真实 LLM 对话往返
```

### 打包

```bash
npm run dist       # NSIS 安装包 → release/Pi Desktop Setup <版本>.exe
```

打包后的应用只在 asar 中保留主进程外置依赖（pi SDK 等）；渲染端库由 Vite 打进 bundle。

### 自动更新

打包版支持 generic feed 更新：启动前设置环境变量 `PIDESKTOP_UPDATE_URL`（指向 electron-builder `latest.yml` 所在目录的 URL）。未设置时更新逻辑完全不加载。

### 托盘行为

设置 → 界面 → 「关闭按钮最小化到系统托盘」。托盘菜单提供 显示窗口 / 退出。

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── pi/             # SdkBridge、设置/会话服务、事件序列化器
│   └── index.ts        # 窗口、托盘、行为设置、更新守卫
├── preload/            # contextBridge API（类型化）
├── renderer/src/
│   ├── components/     # Sidebar、TabBar、ChatView、Composer、ToolCard、
│   │                   # MessageBubble、CodeBlock、DiffView、SettingsDialog
│   ├── store/          # 按 Tab 分片的会话 store（zustand）
│   └── lib/            # shiki 高亮、主题、时间工具
└── shared/types.ts     # 跨进程 wire 类型
scripts/generate-icons.mjs  # 程序化 PNG/ICO 图标生成器
```

## 与上游 pi 的关系

Pi Desktop 是独立项目，以 npm 依赖的方式消费 pi，不修改 pi 源码。本地的 pi 克隆仅作只读参考。对 pi 本身的修复应通过上游 fork/PR 进行，再经依赖升级回流到本项目。pi 采用 MIT 协议（Copyright Earendil Works），关于页保留其归属声明。

## 许可

MIT
