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
	/** session file path when resumed/opened from disk */
	sessionPath: string | null
	cwd: string
	modelId: string | null
	thinkingLevel: WireThinkingLevel
	name: string | null
	/** Historical transcript when resuming a session from disk. */
	initialItems?: WireTranscriptItem[]
}

/** A transcript entry, shared shape between the main-process converter and the renderer store. */
export interface WireTranscriptItem {
	id: string
	kind: 'user' | 'assistant' | 'tool'
	text: string
	thinking: string
	status: 'streaming' | 'complete' | 'error' | 'aborted' | 'running'
	usage?: WireItemUsage
	toolCallId?: string
	toolName?: string
	resultText?: string
	isError?: boolean
	path?: string
	command?: string
	exitCode?: number | null
}

export interface WireItemUsage {
	input: number
	output: number
	totalTokens: number
	costTotal: number
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
	prompt(text: string): Promise<void>
	steer(text: string): Promise<void>
	abort(): Promise<void>
	setModel(modelId: string): Promise<void>
	setThinking(level: WireThinkingLevel): Promise<void>
	onPiEvent(cb: (payload: WirePiEventPayload) => void): () => void

	// ---- Tabs & sessions (tabId-scoped; active tab implied) ----
	createTab(opts: { cwd: string; modelId?: string; activate?: boolean }): Promise<WireSessionInfo>
	openSession(opts: { cwd: string; sessionPath: string; modelId?: string; activate?: boolean }): Promise<WireSessionInfo>
	closeTab(tabId: string): Promise<void>
	activateTab(tabId: string): Promise<void>
	renameSession(name: string): Promise<void>
	listWorkspaces(): Promise<WireWorkspaceGroup[]>
	refreshWorkspaceSessions(cwd: string): Promise<WireSessionListItem[]>
	gitStats(cwd: string): Promise<WireGitStats | null>
	forkActiveSession(): Promise<WireSessionInfo>
	exportActiveSessionHtml(): Promise<string | null>
	browserSetOpen(open: boolean): Promise<void>
	browserSetSuppressed(suppressed: boolean): Promise<void>
	browserOnZoom(cb: (dir: 1 | -1) => void): () => void
	browserSetRect(rect: { x: number; y: number; width: number; height: number }): Promise<void>
	browserNavigate(url: string): Promise<string | undefined>
	getAppBehavior(): Promise<WireAppBehavior>
	setAppBehavior(patch: Partial<WireAppBehavior>): Promise<WireAppBehavior>

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

/** 应用自身行为设置（与 pi 配置无关，存于 Electron userData）。 */
export interface WireAppBehavior {
	closeToTray: boolean
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

export interface WireSessionListItem {
	sessionPath: string
	id: string
	cwd: string
	name: string | null
	/** 派生来源会话文件（fork 时记录，用于侧边栏分支树） */
	parentSessionPath: string | null
	created: string
	modified: string
	messageCount: number
	firstMessage: string
}

export interface WireWorkspaceGroup {
	cwd: string
	/** folder name of cwd for display */
	label: string
	sessions: WireSessionListItem[]
}

export interface WireGitStats {
	changedFiles: number
	insertions: number
	deletions: number
}
