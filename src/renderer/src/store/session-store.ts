import { create } from 'zustand'
import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type {
	WireGitStats,
	WireModelInfo,
	WireSessionInfo,
	WireThinkingLevel,
	WireWorkspaceGroup
} from '../../../shared/types'

export type ItemStatus = 'streaming' | 'complete' | 'error' | 'aborted' | 'running'

export interface ItemUsage {
	input: number
	output: number
	totalTokens: number
	costTotal: number
}

export interface SessionUsage {
	turns: number
	totalTokens: number
	totalCost: number
}

export interface ChatItem {
	id: string
	kind: 'user' | 'assistant' | 'tool'
	text: string
	thinking: string
	status: ItemStatus
	usage?: ItemUsage
	toolCallId?: string
	toolName?: string
	argsPreview?: string
	resultText?: string
	isError?: boolean
	path?: string
	command?: string
	edits?: number
	exitCode?: number | null
	patch?: string
	writeContent?: string
}

/** Per-tab state slice; every tab is an independent pi session. */
export interface TabState {
	tabId: string
	cwd: string
	sessionPath: string | null
	name: string | null
	modelId: string | null
	thinkingLevel: WireThinkingLevel
	busy: boolean
	items: ChatItem[]
	usage: SessionUsage
	followSignal: number
}

interface SessionStore {
	ready: boolean
	notice: string | null
	models: WireModelInfo[]
	workspaces: WireWorkspaceGroup[]
	tabs: TabState[]
	activeTabId: string | null
	gitStats: WireGitStats | null

	setReady(ready: boolean): void
	setNotice(notice: string | null): void
	setModels(models: WireModelInfo[]): void
	loadWorkspaces(): Promise<void>
	refreshGitStats(): Promise<void>
	createTab(cwd: string): Promise<void>
	openSessionTab(cwd: string, sessionPath: string): Promise<void>
	closeTab(tabId: string): Promise<void>
	activateTab(tabId: string): void
	setModelActive(modelId: string): Promise<void>
	setThinkingActive(level: WireThinkingLevel): Promise<void>
	sendPrompt(text: string): void
	applyEvent(tabId: string, event: JsonAgentSessionEvent): void
}

// ---------- event helpers (defensive: events arrive as plain JSON) ----------

function extractText(content: unknown): string {
	if (typeof content === 'string') return content
	if (!Array.isArray(content)) return ''
	return content
		.map((block) => {
			if (block && typeof block === 'object') {
				const b = block as { type?: string; text?: string; thinking?: string }
				if (b.type === 'text' && typeof b.text === 'string') return b.text
				if (b.type === 'thinking' && typeof b.thinking === 'string') return b.thinking
			}
			return ''
		})
		.filter(Boolean)
		.join('\n')
}

function messageRole(message: unknown): string {
	if (message && typeof message === 'object') {
		return String((message as { role?: unknown }).role ?? '')
	}
	return ''
}

function messageText(message: unknown): string {
	if (message && typeof message === 'object') {
		return extractText((message as { content?: unknown }).content)
	}
	return ''
}

function stopReason(message: unknown): string {
	if (message && typeof message === 'object') {
		return String((message as { stopReason?: unknown }).stopReason ?? '')
	}
	return ''
}

function extractUsage(message: unknown): ItemUsage | undefined {
	if (!message || typeof message !== 'object') return undefined
	const usage = (message as { usage?: Record<string, unknown> }).usage
	if (!usage || typeof usage !== 'object') return undefined
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
	const cost = usage.cost as Record<string, unknown> | undefined
	return {
		input: num(usage.input),
		output: num(usage.output),
		totalTokens: num(usage.totalTokens),
		costTotal: num(cost?.total)
	}
}

function parseToolMeta(args: unknown): { path?: string; command?: string; edits?: number; writeContent?: string } {
	if (!args || typeof args !== 'object') return {}
	const a = args as Record<string, unknown>
	const path = typeof a.path === 'string' ? a.path : typeof a.file_path === 'string' ? a.file_path : undefined
	const command = typeof a.command === 'string' ? a.command : undefined
	const edits = Array.isArray(a.edits) ? a.edits.length : undefined
	const writeContent = typeof a.content === 'string' ? a.content : undefined
	return { path, command, edits, writeContent }
}

function extractPatch(result: unknown): string | undefined {
	if (!result || typeof result !== 'object') return undefined
	const details = (result as { details?: Record<string, unknown> }).details
	const patch = details?.patch
	if (typeof patch === 'string' && patch.length > 0) return patch
	return undefined
}

function extractExitCode(result: unknown): number | undefined {
	if (!result || typeof result !== 'object') return undefined
	const details = (result as { details?: Record<string, unknown> }).details
	const code = details?.exitCode
	if (typeof code === 'number') return code
	return undefined
}

const THINKING_LEVELS: WireThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function emptyUsage(): SessionUsage {
	return { turns: 0, totalTokens: 0, totalCost: 0 }
}

function tabTitle(tab: TabState): string {
	if (tab.name) return tab.name
	const firstUser = tab.items.find((i) => i.kind === 'user')
	if (firstUser) {
		const t = firstUser.text.trim().split('\n')[0]
		return t.length > 18 ? `${t.slice(0, 18)}…` : t
	}
	return '新会话'
}

export function getTabTitle(tab: TabState): string {
	return tabTitle(tab)
}

// Debounced refresh after agent runs settle (session files/git state change).
let refreshTimer: ReturnType<typeof setTimeout> | undefined
function scheduleRefresh() {
	clearTimeout(refreshTimer)
	refreshTimer = setTimeout(() => {
		void useSessionStore.getState().loadWorkspaces()
		void useSessionStore.getState().refreshGitStats()
	}, 500)
}

export const useSessionStore = create<SessionStore>((set, get) => ({
	ready: false,
	notice: null,
	models: [],
	workspaces: [],
	tabs: [],
	activeTabId: null,
	gitStats: null,

	setReady: (ready) => set({ ready }),
	setNotice: (notice) => set({ notice }),
	setModels: (models) => set({ models }),

	loadWorkspaces: async () => {
		try {
			const workspaces = await window.piDesktop.listWorkspaces()
			// 新建会话在首条消息前不会出现在磁盘列表里——把已打开 Tab 的工作区并进去。
			const known = new Set(workspaces.map((w) => w.cwd))
			for (const t of get().tabs) {
				if (!known.has(t.cwd)) {
					known.add(t.cwd)
					workspaces.push({ cwd: t.cwd, label: t.cwd.split(/[\\/]/).pop() || t.cwd, sessions: [] })
				}
			}

			// 为尚无 sessionPath 的 Tab 认领最新落盘的会话文件。
			const claimed = new Set(get().tabs.map((t) => t.sessionPath).filter(Boolean))
			set({
				workspaces,
				tabs: get().tabs.map((t) => {
					if (t.sessionPath) return t
					const group = workspaces.find((w) => w.cwd === t.cwd)
					const match = group?.sessions.find((s) => !claimed.has(s.sessionPath))
					if (match) {
						claimed.add(match.sessionPath)
						return { ...t, sessionPath: match.sessionPath }
					}
					return t
				})
			})
		} catch (err) {
			console.error('[pi-desktop] loadWorkspaces failed:', err)
		}
	},

	refreshGitStats: async () => {
		const active = get().tabs.find((t) => t.tabId === get().activeTabId)
		if (!active) {
			set({ gitStats: null })
			return
		}
		try {
			set({ gitStats: await window.piDesktop.gitStats(active.cwd) })
		} catch {
			set({ gitStats: null })
		}
	},

	createTab: async (cwd) => {
		try {
			// 不显式传模型：让 pi 按 settings 的 defaultModel/defaultProvider 解析
			const info = await window.piDesktop.createTab({ cwd })
			set((s) => ({
				tabs: [
					...s.tabs,
					{
						tabId: info.tabId,
						cwd: info.cwd,
						sessionPath: null,
						name: null,
						modelId: info.modelId,
						thinkingLevel: info.thinkingLevel,
						busy: false,
						items: [],
						usage: emptyUsage(),
						followSignal: 0
					}
				],
				activeTabId: info.tabId
			}))
			void get().refreshGitStats()
			void get().loadWorkspaces()
		} catch (err) {
			set({ notice: `新建会话失败：${String(err).replace(/^Error:\s*/, '')}` })
		}
	},

	openSessionTab: async (cwd, sessionPath) => {
		const existing = get().tabs.find((t) => t.sessionPath === sessionPath)
		if (existing) {
			get().activateTab(existing.tabId)
			return
		}
		try {
			const info = await window.piDesktop.openSession({ cwd, sessionPath })
			const items = info.initialItems ?? []
			const usage: SessionUsage = { turns: 0, totalTokens: 0, totalCost: 0 }
			for (const it of items) {
				if (it.usage) {
					usage.turns++
					usage.totalTokens += it.usage.totalTokens
					usage.totalCost += it.usage.costTotal
				}
			}
			set((s) => ({
				tabs: [
					...s.tabs,
					{
						tabId: info.tabId,
						cwd: info.cwd,
						sessionPath,
						name: info.name,
						modelId: info.modelId,
						thinkingLevel: info.thinkingLevel,
						busy: false,
						items,
						usage,
						followSignal: 0
					}
				],
				activeTabId: info.tabId
			}))
			void get().refreshGitStats()
		} catch (err) {
			set({ notice: `打开会话失败：${String(err).replace(/^Error:\s*/, '')}` })
		}
	},

	closeTab: async (tabId) => {
		await window.piDesktop.closeTab(tabId)
		set((s) => {
			const tabs = s.tabs.filter((t) => t.tabId !== tabId)
			const activeTabId =
				s.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].tabId : null) : s.activeTabId
			return { tabs, activeTabId }
		})
		void get().refreshGitStats()
	},

	activateTab: (tabId) => {
		set({ activeTabId: tabId })
		void window.piDesktop.activateTab(tabId)
		void get().refreshGitStats()
	},

	setModelActive: async (modelId) => {
		const tab = get().tabs.find((t) => t.tabId === get().activeTabId)
		if (!tab) return
		set((s) => ({ tabs: s.tabs.map((t) => (t.tabId === tab.tabId ? { ...t, modelId } : t)) }))
		try {
			await window.piDesktop.setModel(modelId)
			set({ notice: null })
		} catch (err) {
			set({ notice: `切换模型失败：${String(err).replace(/^Error:\s*/, '')}` })
		}
	},

	setThinkingActive: async (level) => {
		const tab = get().tabs.find((t) => t.tabId === get().activeTabId)
		if (!tab) return
		set((s) => ({ tabs: s.tabs.map((t) => (t.tabId === tab.tabId ? { ...t, thinkingLevel: level } : t)) }))
		try {
			await window.piDesktop.setThinking(level)
		} catch (err) {
			set({ notice: `设置推理级别失败：${String(err).replace(/^Error:\s*/, '')}` })
		}
	},

	sendPrompt: (text) => {
		const tab = get().tabs.find((t) => t.tabId === get().activeTabId)
		if (!tab) return
		set((s) => ({
			tabs: s.tabs.map((t) =>
				t.tabId === tab.tabId
					? {
							...t,
							followSignal: t.followSignal + 1,
							items: [...t.items, { id: `local-${Date.now()}`, kind: 'user', text, thinking: '', status: 'complete' as ItemStatus }]
						}
					: t
			)
		}))
	},

	applyEvent: (tabId, event) => {
		const idx = get().tabs.findIndex((t) => t.tabId === tabId)
		if (idx < 0) return
		const tab = get().tabs[idx]

		// 返回更新后的 tab（不可变）
		const commit = (patch: Partial<TabState>) => {
			set((s) => ({ tabs: s.tabs.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)) }))
		}
		const updateItems = (fn: (items: ChatItem[]) => ChatItem[]) => {
			commit({ items: fn(get().tabs[idx].items) })
		}

		switch (event.type) {
			case 'agent_start':
				commit({ busy: true })
				break

			case 'agent_settled': {
				commit({
					busy: false,
					items: tab.items.map((it) =>
						it.status === 'streaming' || it.status === 'running' ? { ...it, status: 'complete' } : it
					)
				})
				scheduleRefresh()
				break
			}

			case 'message_start': {
				const message = (event as { message: unknown }).message
				if (messageRole(message) === 'assistant') {
					const id = String((message as { id?: unknown }).id ?? `assistant-${Date.now()}`)
					updateItems((items) => [
						...items,
						{ id, kind: 'assistant', text: '', thinking: '', status: 'streaming' as ItemStatus }
					])
				}
				break
			}

			case 'message_update': {
				const { assistantMessageEvent } = event as { assistantMessageEvent?: { type?: string; delta?: string } }
				if (!assistantMessageEvent) break
				if (assistantMessageEvent.type === 'text_delta' || assistantMessageEvent.type === 'thinking_delta') {
					const delta = assistantMessageEvent.delta ?? ''
					if (!delta) break
					const isText = assistantMessageEvent.type === 'text_delta'
					updateItems((items) => {
						const next = [...items]
						for (let i = next.length - 1; i >= 0; i--) {
							if (next[i].kind === 'assistant') {
								next[i] = isText
									? { ...next[i], text: next[i].text + delta }
									: { ...next[i], thinking: next[i].thinking + delta }
								break
							}
						}
						return next
					})
				}
				break
			}

			case 'message_end': {
				const message = (event as { message: unknown }).message
				const role = messageRole(message)
				const text = messageText(message)

				if (role === 'user') {
					updateItems((items) => {
						const next = [...items]
						for (let i = next.length - 1; i >= 0; i--) {
							if (next[i].kind === 'user') {
								if (next[i].id.startsWith('local-') && next[i].text === text) {
									next[i] = { ...next[i], id: String((message as { id?: unknown }).id ?? next[i].id) }
								}
								break
							}
						}
						return next
					})
				} else if (role === 'assistant') {
					const id = String((message as { id?: unknown }).id ?? '')
					const reason = stopReason(message)
					const status: ItemStatus =
						reason === 'error' ? 'error' : reason === 'aborted' ? 'aborted' : 'complete'
					const usage = extractUsage(message)
					updateItems((items) =>
						items.map((it) =>
							it.kind === 'assistant' && (it.id === id || it.status === 'streaming')
								? { ...it, text: text || it.text, status, usage: usage ?? it.usage }
								: it
						)
					)
					if (usage) {
						const cur = get().tabs[idx].usage
						commit({
							usage: {
								turns: cur.turns + 1,
								totalTokens: cur.totalTokens + usage.totalTokens,
								totalCost: cur.totalCost + usage.costTotal
							}
						})
					}
				} else if (role === 'bashExecution') {
					const msg = message as { command?: string; output?: string; exitCode?: number; cancelled?: boolean }
					const output = typeof msg.output === 'string' ? msg.output : ''
					const exitCode = typeof msg.exitCode === 'number' ? msg.exitCode : null
					const isError = exitCode !== null && exitCode !== 0
					updateItems((items) => {
						const next = [...items]
						for (let i = next.length - 1; i >= 0; i--) {
							const it = next[i]
							if (it.kind === 'tool' && it.toolName === 'bash' && it.status === 'running') {
								if (msg.command && it.command !== msg.command) continue
								next[i] = {
									...it,
									status: msg.cancelled ? 'aborted' : isError ? 'error' : 'complete',
									resultText: output || it.resultText,
									exitCode,
									isError
								}
								return next
							}
						}
						next.push({
							id: `bash-${Date.now()}`,
							kind: 'tool',
							text: '',
							thinking: '',
							status: msg.cancelled ? 'aborted' : isError ? 'error' : 'complete',
							toolName: 'bash',
							command: msg.command,
							resultText: output,
							exitCode,
							isError
						})
						return next
					})
				}
				break
			}

			case 'tool_execution_start': {
				const e = event as { toolCallId: string; toolName: string; args: unknown }
				let argsPreview = ''
				try {
					argsPreview = typeof e.args === 'string' ? e.args : JSON.stringify(e.args, null, 2)
				} catch {
					argsPreview = String(e.args)
				}
				const meta = parseToolMeta(e.args)
				updateItems((items) => [
					...items,
					{
						id: `tool-${e.toolCallId}`,
						kind: 'tool',
						text: '',
						thinking: '',
						status: 'running' as ItemStatus,
						toolCallId: e.toolCallId,
						toolName: e.toolName,
						argsPreview,
						...meta
					}
				])
				break
			}

			case 'tool_execution_update': {
				const e = event as { toolCallId: string; partialResult: unknown }
				updateItems((items) =>
					items.map((it) =>
						it.kind === 'tool' && it.toolCallId === e.toolCallId
							? { ...it, resultText: extractText(e.partialResult) || String(e.partialResult ?? '') }
							: it
					)
				)
				break
			}

			case 'tool_execution_end': {
				const e = event as { toolCallId: string; result: unknown; isError: boolean }
				const resultText =
					extractText(e.result) ||
					(() => {
						try {
							return JSON.stringify(e.result)
						} catch {
							return ''
						}
					})()
				const patch = extractPatch(e.result)
				const exitCode = extractExitCode(e.result)
				updateItems((items) =>
					items.map((it) =>
						it.kind === 'tool' && it.toolCallId === e.toolCallId
							? {
									...it,
									status: e.isError ? 'error' : 'complete',
									resultText,
									isError: e.isError,
									patch: patch ?? it.patch,
									exitCode: exitCode ?? it.exitCode
								}
							: it
					)
				)
				break
			}

			case 'thinking_level_changed': {
				const level = (event as { level?: unknown }).level
				if (typeof level === 'string' && THINKING_LEVELS.includes(level as WireThinkingLevel)) {
					commit({ thinkingLevel: level as WireThinkingLevel })
				}
				break
			}

			default:
				break
		}
	}
}))

/** Active tab selector helper. */
export function useActiveTab(): TabState | null {
	return useSessionStore((s) => (s.activeTabId ? s.tabs.find((t) => t.tabId === s.activeTabId) ?? null : null))
}
