# Pi Desktop

Windows 桌面客户端，基于 [pi coding agent](https://github.com/earendil-works/pi) SDK 构建，UI 风格对标 Codex/ZCode 类聊天式编码助手。

## 架构

- **主进程（Electron, ESM）**：通过 `PiBridge` 接口驱动 pi SDK（进程内 `createAgentSession()`），事件流序列化后经 IPC 推送到渲染进程。预留 `RpcBridge`（`pi --mode rpc` 子进程）作为降级实现。
- **渲染进程（React 19 + Zustand）**：聊天流、工具卡片、模型/推理级别选择。
- **配置互通**：与 pi CLI 共享 `~/.pi/agent`（auth.json、models.json、sessions/）。

## 开发

```bash
npm install        # Electron 二进制走 npmmirror 镜像（见 .npmrc）
npm run typecheck
npm run dev        # 启动开发模式
npm run smoke      # 无头冒烟：验证主进程 ESM + pi SDK 初始化 + 模型列表
```

## 认证

首次使用前需配置至少一个模型提供方（与 pi CLI 相同）：

```bash
pi auth login <provider>          # OAuth
# 或设置环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 等
```

## 许可

MIT。本应用依赖 [earendil-works/pi](https://github.com/earendil-works/pi)（MIT, Copyright Earendil Works）。
