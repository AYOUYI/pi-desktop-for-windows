import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { WireImage, WireModelInfo, WireSessionInfo, WireThinkingLevel } from '../../shared/types'

export type PiEventListener = (tabId: string, event: JsonAgentSessionEvent) => void

export interface CreateSessionOptions {
	tabId: string
	cwd: string
	modelId?: string
	thinkingLevel?: WireThinkingLevel
}

export interface OpenSessionOptions {
	tabId: string
	cwd: string
	/** absolute path to the session .jsonl file */
	sessionPath: string
	modelId?: string
}

/**
 * Transport-neutral surface over a pi agent session.
 *
 * Two implementations are planned:
 * - SdkBridge: runs the pi SDK in-process inside the Electron main process (default).
 * - RpcBridge: spawns `pi --mode rpc` as a subprocess (fallback if the bundled
 *   Electron Node ever fails the pi SDK's engine requirement).
 *
 * The renderer never talks to pi directly; everything goes through this interface.
 */
export interface PiBridge {
	readonly kind: 'sdk' | 'rpc'
	init(): Promise<void>
	listModels(): Promise<WireModelInfo[]>
	createSession(options: CreateSessionOptions): Promise<WireSessionInfo>
	openSession(options: OpenSessionOptions): Promise<WireSessionInfo>
	forkSession(sourceTabId: string, newTabId: string): Promise<WireSessionInfo>
	exportHtml(tabId: string, outputPath?: string): Promise<string>
	prompt(tabId: string, text: string, images?: WireImage[]): void
	steer(tabId: string, text: string): void
	abort(tabId: string): void
	setModel(tabId: string, modelId: string): Promise<void>
	setThinking(tabId: string, level: WireThinkingLevel): Promise<void>
	setSessionName(tabId: string, name: string): void
	disposeSession(tabId: string): Promise<void>
	dispose(): Promise<void>
	onEvent(listener: PiEventListener): void
}
