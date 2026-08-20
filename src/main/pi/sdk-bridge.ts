import {
	createAgentSession,
	ModelRuntime,
	SessionManager,
	type AgentSession,
	type JsonAgentSessionEvent
} from '@earendil-works/pi-coding-agent'
import { existsSync } from 'node:fs'
import type { Model } from '@earendil-works/pi-ai'
import type { CreateSessionOptions, OpenSessionOptions, PiBridge, PiEventListener } from './bridge'
import type { BrowserService } from './browser-service'
import type { WireModelInfo, WireSessionInfo, WireThinkingLevel, WireTranscriptItem } from '../../shared/types'
import { serializeSessionEvent } from './event-serializer'

/** Convert persisted AgentMessages into renderer transcript items (resume replay). */
function transcriptFromMessages(messages: unknown[]): WireTranscriptItem[] {
	const items: WireTranscriptItem[] = []
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i]
		if (!message || typeof message !== 'object') continue
		const m = message as {
			id?: unknown
			role?: unknown
			content?: unknown
			usage?: Record<string, unknown>
			toolCallId?: unknown
			toolName?: unknown
			isError?: unknown
			command?: unknown
			exitCode?: unknown
		}
		const id = String(m.id ?? `msg-${i}-${Date.now()}`)
		const blocks = Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : []
		const joinType = (type: string, field: string) =>
			blocks
				.filter((b) => b?.type === type && typeof b[field] === 'string')
				.map((b) => String(b[field]))
				.join('\n')

		if (m.role === 'user') {
			const text = typeof m.content === 'string' ? m.content : joinType('text', 'text')
			if (text) items.push({ id, kind: 'user', text, thinking: '', status: 'complete' })
		} else if (m.role === 'assistant') {
			const usage = m.usage
			const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
			const cost = usage?.cost as Record<string, unknown> | undefined
			items.push({
				id,
				kind: 'assistant',
				text: joinType('text', 'text'),
				thinking: joinType('thinking', 'thinking'),
				status: 'complete',
				...(typeof m.model === 'string' && m.model ? { modelUsed: m.model } : {}),
				...(usage
					? {
							usage: {
								input: num(usage.input),
								output: num(usage.output),
								totalTokens: num(usage.totalTokens),
								costTotal: num(cost?.total)
							}
						}
					: {})
			})
		} else if (m.role === 'toolResult') {
			const resultText =
				typeof m.content === 'string' ? m.content : joinType('text', 'text')
			items.push({
				id,
				kind: 'tool',
				text: '',
				thinking: '',
				status: m.isError ? 'error' : 'complete',
				toolCallId: typeof m.toolCallId === 'string' ? m.toolCallId : id,
				toolName: typeof m.toolName === 'string' ? m.toolName : 'tool',
				resultText,
				isError: m.isError === true
			})
		} else if (m.role === 'bashExecution') {
			const b = message as { command?: unknown; output?: unknown; exitCode?: unknown; isError?: unknown }
			items.push({
				id,
				kind: 'tool',
				text: '',
				thinking: '',
				status: b.isError ? 'error' : 'complete',
				toolName: 'bash',
				command: typeof b.command === 'string' ? b.command : undefined,
				resultText: typeof b.output === 'string' ? b.output : '',
				exitCode: typeof b.exitCode === 'number' ? b.exitCode : null
			})
		}
	}
	return items
}

interface LiveSession {
	session: AgentSession
	sessionPath: string | null
	cwd: string
	modelId: string | null
	thinkingLevel: WireThinkingLevel
}

/**
 * In-process pi bridge: drives the pi SDK directly from the Electron main
 * process, exactly like the official TUI does.
 */
export class SdkBridge implements PiBridge {
	readonly kind = 'sdk' as const

	private modelRuntime: ModelRuntime | null = null
	private sessions = new Map<string, LiveSession>()
	private listeners: PiEventListener[] = []

	constructor(private readonly browser?: BrowserService) {}

	async init(): Promise<void> {
		this.modelRuntime = await ModelRuntime.create()
	}

	/** Shared runtime for services like SettingsService. */
	getRuntime(): ModelRuntime | null {
		return this.modelRuntime
	}

	onEvent(listener: PiEventListener): void {
		this.listeners.push(listener)
	}

	private emit(tabId: string, event: JsonAgentSessionEvent): void {
		for (const listener of this.listeners) {
			listener(tabId, event)
		}
	}

	/** Wire 格式统一使用 "provider/modelId" 限定 ID（裸 ID 在多供应商下不唯一）。 */
	private qualify(model: Model<any>): string {
		return `${String(model.provider)}/${model.id}`
	}

	async listModels(): Promise<WireModelInfo[]> {
		if (!this.modelRuntime) return []
		const models = await this.modelRuntime.getAvailable()
		return models.map((m) => ({
			id: this.qualify(m),
			name: m.name,
			provider: String(m.provider),
			reasoning: m.reasoning
		}))
	}

	private findModel(qualifiedId: string): Model<any> | undefined {
		if (!this.modelRuntime) return undefined
		const slash = qualifiedId.indexOf('/')
		const provider = slash >= 0 ? qualifiedId.slice(0, slash) : undefined
		const modelId = slash >= 0 ? qualifiedId.slice(slash + 1) : qualifiedId
		const candidates = this.modelRuntime.getModels().filter((m) => m.id === modelId)
		if (provider) {
			const exact = candidates.find((m) => String(m.provider) === provider)
			if (exact) return exact
		}
		// 无限定时优先选已认证供应商下的副本
		return candidates[0]
	}

	async createSession(options: CreateSessionOptions): Promise<WireSessionInfo> {
		if (!this.modelRuntime) {
			throw new Error('SdkBridge is not initialized')
		}
		await this.disposeSession(options.tabId)

		const model = options.modelId ? this.findModel(options.modelId) : undefined
		const { session } = await createAgentSession({
			cwd: options.cwd,
			modelRuntime: this.modelRuntime,
			...(model ? { model } : {}),
			...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
			...(this.browser ? { customTools: this.browser.tools() } : {})
		})

		return this.adoptSession(options.tabId, session, null, options.cwd, model, options.thinkingLevel)
	}

	async openSession(options: OpenSessionOptions): Promise<WireSessionInfo> {
		if (!this.modelRuntime) {
			throw new Error('SdkBridge is not initialized')
		}
		await this.disposeSession(options.tabId)

		const sessionManager = SessionManager.open(options.sessionPath, undefined, options.cwd)
		const model = options.modelId ? this.findModel(options.modelId) : undefined
		const { session } = await createAgentSession({
			cwd: options.cwd,
			modelRuntime: this.modelRuntime,
			sessionManager,
			...(model ? { model } : {}),
			...(this.browser ? { customTools: this.browser.tools() } : {})
		})

		const name = sessionManager.getSessionName?.() ?? null
		const info = this.adoptSession(options.tabId, session, options.sessionPath, options.cwd, model, undefined, name)
		info.initialItems = transcriptFromMessages(session.agent.state.messages)
		return info
	}

	private adoptSession(
		tabId: string,
		session: AgentSession,
		sessionPath: string | null,
		cwd: string,
		model: Model<any> | null | undefined,
		thinkingLevel?: WireThinkingLevel,
		name?: string | null
	): WireSessionInfo {
		session.subscribe((event) => {
			this.emit(tabId, serializeSessionEvent(event))
		})

		// 以会话实际解析出的模型/思考级别为准（未显式指定时 pi 会从 settings 取默认值）
		const resolvedModel = session.model ?? model ?? null
		const sessionThinking = session.thinkingLevel as string
		const validThinking = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(sessionThinking)
		const resolvedThinking: WireThinkingLevel =
			validThinking ? (sessionThinking as WireThinkingLevel) : (thinkingLevel ?? 'medium')
		const qualifiedModelId = resolvedModel ? this.qualify(resolvedModel) : null

		this.sessions.set(tabId, {
			session,
			sessionPath,
			cwd,
			modelId: qualifiedModelId,
			thinkingLevel: resolvedThinking
		})

		return {
			tabId,
			sessionId: null,
			sessionPath,
			cwd,
			modelId: qualifiedModelId,
			thinkingLevel: resolvedThinking,
			name: name ?? null
		}
	}

	private require(tabId: string): LiveSession {
		const live = this.sessions.get(tabId)
		if (!live) {
			throw new Error(`No pi session for tab ${tabId}`)
		}
		return live
	}

	prompt(tabId: string, text: string): void {
		const live = this.require(tabId)
		void live.session.prompt(text).catch((err) => {
			console.error('[pi-desktop] prompt failed:', err)
		})
	}

	steer(tabId: string, text: string): void {
		const live = this.require(tabId)
		void live.session.steer(text).catch((err) => {
			console.error('[pi-desktop] steer failed:', err)
		})
	}

	abort(tabId: string): void {
		const live = this.require(tabId)
		void live.session.abort().catch((err) => {
			console.error('[pi-desktop] abort failed:', err)
		})
	}

	async setModel(tabId: string, modelId: string): Promise<void> {
		const live = this.require(tabId)
		const model = this.findModel(modelId)
		if (!model) {
			throw new Error(`Unknown model: ${modelId}`)
		}
		await live.session.setModel(model)
		live.modelId = this.qualify(model)
	}

	async setThinking(tabId: string, level: WireThinkingLevel): Promise<void> {
		const live = this.require(tabId)
		await live.session.setThinkingLevel(level)
		live.thinkingLevel = level
	}

	setSessionName(tabId: string, name: string): void {
		const live = this.require(tabId)
		live.session.setSessionName(name)
	}

	/** 在当前对话末尾派生分支（复制历史到新会话文件，parent 指向源会话）。 */
	async forkSession(sourceTabId: string, newTabId: string): Promise<WireSessionInfo> {
		const live = this.require(sourceTabId)
		const file = live.session.sessionFile
		if (!file || !existsSync(file)) {
			throw new Error('会话尚未落盘，请先发送至少一条消息')
		}
		const sm = SessionManager.open(file)
		const leaf = sm.getLeafId()
		let forkedPath: string | undefined
		if (leaf) {
			forkedPath = sm.createBranchedSession(leaf)
		} else {
			const fresh = SessionManager.create(live.cwd)
			fresh.newSession({ parentSession: file })
			forkedPath = fresh.getSessionFile()
		}
		if (!forkedPath) {
			throw new Error('派生会话失败')
		}
		return this.openSession({ tabId: newTabId, cwd: live.cwd, sessionPath: forkedPath })
	}

	async exportHtml(tabId: string, outputPath?: string): Promise<string> {
		const live = this.require(tabId)
		return live.session.exportToHtml(outputPath)
	}

	async disposeSession(tabId: string): Promise<void> {
		const live = this.sessions.get(tabId)
		if (!live) return
		this.sessions.delete(tabId)
		try {
			live.session.dispose()
		} catch (err) {
			console.error('[pi-desktop] session dispose failed:', err)
		}
	}

	async dispose(): Promise<void> {
		for (const tabId of [...this.sessions.keys()]) {
			await this.disposeSession(tabId)
		}
	}
}
