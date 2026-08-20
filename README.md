# Pi Desktop

Windows 桌面客户端，基于 [pi coding agent](https://github.com/earendil-works/pi) SDK 构建，UI 风格对标 Codex/ZCode 类聊天式编码助手。

## 架构

- **主进程（Electron, ESM）**：通过 `PiBridge` 接口驱动 pi SDK（进程内 `createAgentSession()`），事件流序列化后经 IPC 推送到渲染进程。预留 `RpcBridge`（`pi --mode rpc` 子进程）作为降级实现。
- **渲染进程（React 19 + Zustand）**：聊天流、工具卡片、模型/推理级别选择。
- **配置互通**：与 pi CLI 共享 `~/.pi/agent`（auth.json、models.json、sessions/）。

## 开发

```bash
npm install        # Electron 二进制走 npmmirror 镜像（见 .npmrc）
npm run icons      # 重新生成应用图标（build/icon.ico / icon.png）
npm run typecheck
npm run dev        # 启动开发模式
npm run smoke      # 无头冒烟：验证主进程 ESM + pi SDK 初始化 + 模型列表
```

更多冒烟模式：`npx electron . --smoke-settings`（配置读取）、`--smoke-resume`（会话恢复回放）、`--smoke-chat`（真实对话往返）。

## 打包分发

```bash
npm run dist       # 生成 NSIS 安装包（release/ 目录，exe）
```

## 自动更新

打包后的应用支持通过 generic feed 自动更新：设置环境变量 `PIDESKTOP_UPDATE_URL`（指向 electron-builder `latest.yml` 所在目录的 URL）后启动即生效。未设置时更新逻辑完全不加载。

## 托盘与窗口行为

设置 → 界面 → 「关闭按钮最小化到系统托盘」。开启后点关闭只会收进托盘，从托盘菜单退出才会真正退出。

## 认证

首次使用前需配置至少一个模型提供方（与 pi CLI 相同）：

```bash
pi auth login <provider>          # OAuth
# 或设置环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 等
```

## 许可

MIT。本应用依赖 [earendil-works/pi](https://github.com/earendil-works/pi)（MIT, Copyright Earendil Works）。
