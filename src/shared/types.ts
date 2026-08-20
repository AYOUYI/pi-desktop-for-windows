import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'

/** Thinking levels supported by pi (mirrors ThinkingLevel from the pi SDK). */
export type WireThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Model info for pickers, JSON-safe across IPC. */
export interface WireModelInfo {
	id: string
	name: string
	provider: string
	reasoning: boolean
}

/** Snapshot of the active session, JSON-safe across IPC. */
export interface WireSessionInfo {
	tabId: string
	sessionId: string | null
	cwd: string
	modelId: string | null
	thinkingLevel: WireThinkingLevel
}

export interface AppInfo {
	appVersion: string
	electron: string
	node: string
	chrome: string
	platform: string
	/** Result of the Node >= 22.19 gate required by the pi SDK. */
	nodeOk: boolean
}

/** Event payload pushed from the main process to the renderer. */
export interface WirePiEventPayload {
	tabId: string
	event: JsonAgentSessionEvent
}

/**
 * Renderer-facing API exposed by the preload script via contextBridge.
 * M1 is single-tab; the tabId is managed by the main process.
 */
export interface PiDesktopApi {
	getAppInfo(): Promise<AppInfo>
	selectWorkspace(): Promise<string | null>
	listModels(): Promise<WireModelInfo[]>
	createSession(opts: { cwd: string; modelId?: string; thinkingLevel?: WireThinkingLevel }): Promise<WireSessionInfo>
	prompt(text: string): Promise<void>
	steer(text: string): Promise<void>
	abort(): Promise<void>
	setModel(modelId: string): Promise<void>
	setThinking(level: WireThinkingLevel): Promise<void>
	onPiEvent(cb: (payload: WirePiEventPayload) => void): () => void
}
