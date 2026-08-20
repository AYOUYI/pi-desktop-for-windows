import { create } from 'zustand'
import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { WireModelInfo, WireSessionInfo, WireThinkingLevel } from '../../../shared/types'

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
	/** user / assistant text */
	text: string
	/** assistant thinking text */
	thinking: string
	status: ItemStatus
	/** assistant per-message usage */
	usage?: ItemUsage
	/** tool fields */
	toolCallId?: string
	toolName?: string
	argsPreview?: string
	resultText?: string
	isError?: boolean
	/** file tools: target path; bash: command */
	path?: string
	command?: string
	/** edit count badge */
	edits?: number
	/** bash exit code */
	exitCode?: number | null
	/** unified patch from edit details */
	patch?: string
	/** synthesized from write args at render time */
	writeContent?: string
}

interface SessionStore {
	ready: boolean
	notice: string | null
	cwd: string | null
	models: WireModelInfo[]
	modelId: string | null
	thinkingLevel: WireThinkingLevel
	busy: boolean
	items: ChatItem[]
	usage: SessionUsage
	/** increments on user send; ChatView follows bottom */
	followSignal: number

	setReady(ready: boolean): void
	setNotice(notice: string | null): void
	setModels(models: WireModelInfo[]): void
	setSession(info: WireSessionInfo): void
	setModelId(modelId: string): void
	setThinkingLevel(level: WireThinkingLevel): void
	sendPrompt(text: string): void
	applyEvent(event: JsonAgentSessionEvent): void
}

/** Join text/thinking blocks of a message content array (defensive: events arrive as plain JSON). */
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

/** Extract a unified patch from a tool result's details, if any. */
function extractPatch(result: unknown): string | undefined {
	if (!result || typeof result !== 'object') return undefined
	const details = (result as { details?: Record<string, unknown> }).details
	const patch = details?.patch
	if (typeof patch === 'string' && patch.length > 0) return patch
	return undefined
}

function extractExitCode(result: unknown): number | null | undefined {
	if (!result || typeof result !== 'object') return undefined
	const details = (result as { details?: Record<string, unknown> }).details
	const code = details?.exitCode
	if (typeof code === 'number') return code
	return undefined
}

const THINKING_LEVELS: WireThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export const useSessionStore = create<SessionStore>((set, get) => ({
	ready: false,
	notice: null,
	cwd: null,
	models: [],
	modelId: null,
	thinkingLevel: 'medium',
	busy: false,
	items: [],
	usage: { turns: 0, totalTokens: 0, totalCost: 0 },
	followSignal: 0,

	setReady: (ready) => set({ ready }),
	setNotice: (notice) => set({ notice }),
	setModels: (models) => set({ models }),
	setSession: (info) =>
		set({
			cwd: info.cwd,
			modelId: info.modelId,
			thinkingLevel: info.thinkingLevel,
			items: [],
			usage: { turns: 0, totalTokens: 0, totalCost: 0 },
			busy: false
		}),
	setModelId: (modelId) => set({ modelId }),
	setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),

	sendPrompt: (text) =>
		set((s) => ({
			followSignal: s.followSignal + 1,
			items: [...s.items, { id: `local-${Date.now()}`, kind: 'user', text, thinking: '', status: 'complete' }]
		})),

	applyEvent: (event) => {
		switch (event.type) {
			case 'agent_start':
				set({ busy: true })
				break

			case 'agent_settled':
				set({ busy: false })
				set((s) => ({
					items: s.items.map((it) =>
						it.status === 'streaming' || it.status === 'running' ? { ...it, status: 'complete' } : it
					)
				}))
				break

			case 'message_start': {
				const message = (event as { message: unknown }).message
				if (messageRole(message) === 'assistant') {
					const id = String((message as { id?: unknown }).id ?? `assistant-${Date.now()}`)
					set((s) => ({
						items: [...s.items, { id, kind: 'assistant', text: '', thinking: '', status: 'streaming' }]
					}))
				}
				break
			}

			case 'message_update': {
				const { assistantMessageEvent } = event as {
					assistantMessageEvent?: { type?: string; delta?: string }
				}
				if (!assistantMessageEvent) break
				if (assistantMessageEvent.type === 'text_delta' || assistantMessageEvent.type === 'thinking_delta') {
					const delta = assistantMessageEvent.delta ?? ''
					if (!delta) break
					set((s) => {
						const items = [...s.items]
						for (let i = items.length - 1; i >= 0; i--) {
							if (items[i].kind === 'assistant') {
								if (assistantMessageEvent.type === 'text_delta') {
									items[i] = { ...items[i], text: items[i].text + delta }
								} else {
									items[i] = { ...items[i], thinking: items[i].thinking + delta }
								}
								break
							}
						}
						return { items }
					})
				}
				break
			}

			case 'message_end': {
				const message = (event as { message: unknown }).message
				const role = messageRole(message)
				const text = messageText(message)

				if (role === 'user') {
					// Deduplicate against the optimistic local echo.
					set((s) => {
						const items = [...s.items]
						for (let i = items.length - 1; i >= 0; i--) {
							if (items[i].kind === 'user') {
								if (items[i].id.startsWith('local-') && items[i].text === text) {
									items[i] = { ...items[i], id: String((message as { id?: unknown }).id ?? items[i].id) }
								}
								break
							}
						}
						return { items }
					})
				} else if (role === 'assistant') {
					const id = String((message as { id?: unknown }).id ?? '')
					const reason = stopReason(message)
					const status: ItemStatus =
						reason === 'error' ? 'error' : reason === 'aborted' ? 'aborted' : 'complete'
					const usage = extractUsage(message)
					set((s) => ({
						items: s.items.map((it) =>
							it.kind === 'assistant' && (it.id === id || it.status === 'streaming')
								? { ...it, text: text || it.text, status, usage: usage ?? it.usage }
								: it
						),
						usage: usage
							? {
									turns: s.usage.turns + 1,
									totalTokens: s.usage.totalTokens + usage.totalTokens,
									totalCost: s.usage.totalCost + usage.costTotal
								}
							: s.usage
					}))
				} else if (role === 'bashExecution') {
					// Final bash record: command/output/exitCode. Attach to the matching
					// running bash tool card, or surface as a standalone card (! commands).
					const msg = message as { command?: string; output?: string; exitCode?: number; cancelled?: boolean }
					const output = typeof msg.output === 'string' ? msg.output : ''
					const exitCode = typeof msg.exitCode === 'number' ? msg.exitCode : null
					const isError = exitCode !== null && exitCode !== 0
					set((s) => {
						const items = [...s.items]
						for (let i = items.length - 1; i >= 0; i--) {
							const it = items[i]
							if (it.kind === 'tool' && it.toolName === 'bash' && it.status === 'running') {
								if (msg.command && it.command !== msg.command) continue
								items[i] = {
									...it,
									status: msg.cancelled ? 'aborted' : isError ? 'error' : 'complete',
									resultText: output || it.resultText,
									exitCode,
									isError
								}
								return { items }
							}
						}
						items.push({
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
						return { items }
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
				set((s) => ({
					items: [
						...s.items,
						{
							id: `tool-${e.toolCallId}`,
							kind: 'tool',
							text: '',
							thinking: '',
							status: 'running',
							toolCallId: e.toolCallId,
							toolName: e.toolName,
							argsPreview,
							...meta
						}
					]
				}))
				break
			}

			case 'tool_execution_update': {
				const e = event as { toolCallId: string; partialResult: unknown }
				set((s) => ({
					items: s.items.map((it) =>
						it.kind === 'tool' && it.toolCallId === e.toolCallId
							? { ...it, resultText: extractText(e.partialResult) || String(e.partialResult ?? '') }
							: it
					)
				}))
				break
			}

			case 'tool_execution_end': {
				const e = event as { toolCallId: string; result: unknown; isError: boolean }
				const resultText = extractText(e.result) || (() => { try { return JSON.stringify(e.result) } catch { return '' } })()
				const patch = extractPatch(e.result)
				const exitCode = extractExitCode(e.result)
				set((s) => ({
					items: s.items.map((it) =>
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
				}))
				break
			}

			case 'thinking_level_changed': {
				const level = (event as { level?: unknown }).level
				if (typeof level === 'string' && THINKING_LEVELS.includes(level as WireThinkingLevel)) {
					set({ thinkingLevel: level as WireThinkingLevel })
				}
				break
			}

			default:
				void get
				break
		}
	}
}))
