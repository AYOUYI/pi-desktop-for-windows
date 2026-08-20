import { create } from 'zustand'
import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { WireModelInfo, WireSessionInfo, WireThinkingLevel } from '../../../shared/types'

export type ItemStatus = 'streaming' | 'complete' | 'error' | 'aborted' | 'running'

export interface ChatItem {
	id: string
	kind: 'user' | 'assistant' | 'tool'
	/** user / assistant text */
	text: string
	/** assistant thinking text */
	thinking: string
	status: ItemStatus
	/** tool fields */
	toolCallId?: string
	toolName?: string
	argsPreview?: string
	resultText?: string
	isError?: boolean
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

const THINNKING_LEVELS: WireThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export const useSessionStore = create<SessionStore>((set, get) => ({
	ready: false,
	notice: null,
	cwd: null,
	models: [],
	modelId: null,
	thinkingLevel: 'medium',
	busy: false,
	items: [],

	setReady: (ready) => set({ ready }),
	setNotice: (notice) => set({ notice }),
	setModels: (models) => set({ models }),
	setSession: (info) =>
		set({
			cwd: info.cwd,
			modelId: info.modelId,
			thinkingLevel: info.thinkingLevel,
			items: [],
			busy: false
		}),
	setModelId: (modelId) => set({ modelId }),
	setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),

	sendPrompt: (text) => {
		set((s) => ({
			items: [...s.items, { id: `local-${Date.now()}`, kind: 'user', text, thinking: '', status: 'complete' }]
		}))
	},

	applyEvent: (event) => {
		const state = get()
		switch (event.type) {
			case 'agent_start':
				set({ busy: true })
				break

			case 'agent_settled':
				set({ busy: false })
				set((s) => ({
					items: s.items.map((it) =>
						it.status === 'streaming' || it.status === 'running'
							? { ...it, status: it.status === 'streaming' ? 'complete' : 'complete' }
							: it
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
					set((s) => ({
						items: s.items.map((it) =>
							it.kind === 'assistant' && (it.id === id || it.status === 'streaming')
								? { ...it, text: text || it.text, status }
								: it
						)
					}))
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
							argsPreview
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
				set((s) => ({
					items: s.items.map((it) =>
						it.kind === 'tool' && it.toolCallId === e.toolCallId
							? { ...it, status: e.isError ? 'error' : 'complete', resultText, isError: e.isError }
							: it
					)
				}))
				break
			}

			case 'thinking_level_changed': {
				const level = (event as { level?: unknown }).level
				if (typeof level === 'string' && THINNKING_LEVELS.includes(level as WireThinkingLevel)) {
					set({ thinkingLevel: level as WireThinkingLevel })
				}
				break
			}

			default:
				void state
				break
		}
	}
}))
