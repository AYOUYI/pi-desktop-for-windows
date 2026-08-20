import {
	createAgentSession,
	ModelRuntime,
	type AgentSession,
	type JsonAgentSessionEvent
} from '@earendil-works/pi-coding-agent'
import type { Model } from '@earendil-works/pi-ai'
import type { CreateSessionOptions, PiBridge, PiEventListener } from './bridge'
import type { WireModelInfo, WireSessionInfo, WireThinkingLevel } from '../../shared/types'
import { serializeSessionEvent } from './event-serializer'

interface LiveSession {
	session: AgentSession
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

	async init(): Promise<void> {
		this.modelRuntime = await ModelRuntime.create()
	}

	onEvent(listener: PiEventListener): void {
		this.listeners.push(listener)
	}

	private emit(tabId: string, event: JsonAgentSessionEvent): void {
		for (const listener of this.listeners) {
			listener(tabId, event)
		}
	}

	async listModels(): Promise<WireModelInfo[]> {
		if (!this.modelRuntime) return []
		const models = await this.modelRuntime.getAvailable()
		return models.map((m) => ({
			id: m.id,
			name: m.name,
			provider: String(m.provider),
			reasoning: m.reasoning
		}))
	}

	private findModel(modelId: string): Model<any> | undefined {
		if (!this.modelRuntime) return undefined
		return this.modelRuntime
			.getModels()
			.find((m) => m.id === modelId)
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
			...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {})
		})

		const tabId = options.tabId
		session.subscribe((event) => {
			this.emit(tabId, serializeSessionEvent(event))
		})

		const live: LiveSession = {
			session,
			cwd: options.cwd,
			modelId: model?.id ?? null,
			thinkingLevel: options.thinkingLevel ?? 'medium'
		}
		this.sessions.set(tabId, live)

		return {
			tabId,
			sessionId: null,
			cwd: options.cwd,
			modelId: live.modelId,
			thinkingLevel: live.thinkingLevel
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
		live.modelId = model.id
	}

	async setThinking(tabId: string, level: WireThinkingLevel): Promise<void> {
		const live = this.require(tabId)
		await live.session.setThinkingLevel(level)
		live.thinkingLevel = level
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
