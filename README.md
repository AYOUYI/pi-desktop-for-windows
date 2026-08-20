# Pi Desktop

**[English](README.md)** | [简体中文](README.zh-CN.md)

A native Windows desktop client for the [pi coding agent](https://github.com/earendil-works/pi), with a modern chat-style coding assistant UI. Built on pi's official SDK (`@earendil-works/pi-coding-agent`) running in-process — no CLI subprocess, no private config formats.

## Features

- **Chat-first interface** — workspace-grouped session sidebar (collapsible, relative timestamps, modified dots), top tab bar with parallel sessions, composer with model/thinking chips and git change stats
- **Streaming chat** — Markdown rendering with shiki syntax highlighting, copy buttons, collapsible thinking blocks, token usage & cost per message and per session
- **Tool cards** — read/bash/edit/write/grep with live bash output tail, exit codes, and colored diff views for edits (unified patch) and writes
- **Session management** — resume any session from disk (shared with the pi CLI), multi-tab parallel agents, session fork (branch from current point) with a fork tree in the sidebar, HTML export
- **Settings center** — provider status & API keys (written via pi's own `login` API, hot-reloaded), custom OpenAI-compatible providers (Ollama/vLLM), skills & extensions management, theme/accent/font customization, default model & shell path
- **Windows integration** — system tray with close-to-tray, NSIS installer, procedural app icon; works with Git Bash (auto-detected)

## Architecture

```
Electron main process (ESM)
├── PiBridge abstraction
│   ├── SdkBridge   — createAgentSession() in-process (default)
│   └── RpcBridge   — `pi --mode rpc` subprocess (reserved fallback)
├── SettingsService — auth.json / models.json / settings.json via pi APIs
├── SessionsService — SessionManager.listAll(), git stats
└── typed IPC → renderer
Renderer (React 19 + Zustand + virtua)
└── per-tab state slices, transcript folding, virtualized list
```

All configuration and session data live in `~/.pi/agent` and are shared with the pi CLI — models, auth, skills, extensions, and sessions are interchangeable between both.

## Getting Started

### Prerequisites

- **Runtime**: no requirements beyond the installer (Electron bundles its own Node ≥ 22.19)
- **Bash tool**: [Git for Windows](https://git-scm.com/download/win) (auto-detected; configurable in Settings)
- **Auth**: at least one provider — via Settings → Providers, or `pi auth login`, or env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...)
- **Development**: Node.js ≥ 22.19, npm 10+

### Development

```bash
npm install        # Electron binary via npmmirror (see .npmrc)
npm run icons      # regenerate app icons (build/icon.ico, icon.png)
npm run typecheck
npm run dev        # launch dev mode
```

### Smoke tests

```bash
npx electron . --smoke           # ESM main + pi SDK init + model list
npx electron . --smoke-settings  # settings read paths against live config
npx electron . --smoke-resume    # session listing + resume replay
npx electron . --smoke-chat      # real LLM round-trip through the bridge
```

### Packaging

```bash
npm run dist       # NSIS installer → release/Pi Desktop Setup <version>.exe
```

The packaged app keeps only main-process externals (pi SDK, etc.) in the asar; renderer libraries are bundled by Vite.

### Auto-update

Packaged builds support updates from a generic feed: set `PIDESKTOP_UPDATE_URL` (a URL serving electron-builder's `latest.yml`) before launching. When unset, the updater never loads.

### Tray behavior

Settings → Appearance → *Minimize to tray on close*. The tray menu offers Show / Quit.

## Project layout

```
src/
├── main/               # Electron main process
│   ├── pi/             # SdkBridge, settings/sessions services, serializer
│   └── index.ts        # window, tray, behavior settings, updater guard
├── preload/            # contextBridge API (typed)
├── renderer/src/
│   ├── components/     # Sidebar, TabBar, ChatView, Composer, ToolCard,
│   │                   # MessageBubble, CodeBlock, DiffView, SettingsDialog
│   ├── store/          # per-tab session store (zustand)
│   └── lib/            # shiki highlighter, theme, time utils
└── shared/types.ts     # wire types across processes
scripts/generate-icons.mjs  # procedural PNG/ICO icon generator
```

## Relation to upstream pi

Pi Desktop is a standalone project that consumes pi as an npm dependency and does not modify it. The local pi clone is kept read-only as a reference. Fixes to pi itself belong in an upstream fork/PR and flow back here through dependency upgrades. pi is MIT-licensed (Copyright Earendil Works); attribution is retained in the About notices.

## License

MIT
