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

	// ---- Settings ----
	listProviders(): Promise<WireProviderStatus[]>
	setProviderApiKey(providerId: string, apiKey: string): Promise<void>
	logoutProvider(providerId: string): Promise<void>
	addCustomProvider(req: WireCustomProviderRequest): Promise<void>
	removeCustomProvider(providerId: string): Promise<void>
	listSkills(cwd: string | null): Promise<WireSkillInfo[]>
	listExtensions(cwd: string | null): Promise<WireExtensionInfo[]>
	openSettingsDir(kind: 'skills' | 'extensions' | 'agent'): Promise<void>
	getGeneralSettings(cwd: string | null): Promise<WireGeneralSettings>
	setGeneralSettings(cwd: string | null, patch: WireGeneralSettingsPatch): Promise<void>
}

export interface WireProviderStatus {
	id: string
	/** display name when known */
	name: string
	configured: boolean
	/** stored | environment | runtime */
	source?: string
	label?: string
	modelCount: number
	/** true when the provider comes from ~/.pi/agent/models.json (not builtin) */
	custom: boolean
}

export interface WireCustomProviderModel {
	id: string
	name: string
}

export interface WireCustomProviderRequest {
	providerId: string
	name: string
	baseUrl: string
	/** pi API adapter, e.g. openai-completions */
	api: string
	apiKey: string
	models: WireCustomProviderModel[]
}

export interface WireSkillInfo {
	name: string
	description: string
	filePath: string
	/** user | project */
	source: string
	disableModelInvocation: boolean
}

export interface WireExtensionInfo {
	filePath: string
	/** user | project */
	source: string
	/** file | package */
	kind: 'file' | 'package'
}

export interface WireGeneralSettings {
	defaultModel: string | null
	defaultThinkingLevel: WireThinkingLevel | null
	shellPath: string | null
}

export interface WireGeneralSettingsPatch {
	defaultModel?: string | null
	defaultThinkingLevel?: WireThinkingLevel | null
	shellPath?: string | null
}
