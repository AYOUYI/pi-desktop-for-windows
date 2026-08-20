import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { WireModelInfo, WireSessionInfo, WireThinkingLevel } from '../../shared/types'

export type PiEventListener = (tabId: string, event: JsonAgentSessionEvent) => void

export interface CreateSessionOptions {
	tabId: string
	cwd: string
	modelId?: string
	thinkingLevel?: WireThinkingLevel
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
	prompt(tabId: string, text: string): void
	steer(tabId: string, text: string): void
	abort(tabId: string): void
	setModel(tabId: string, modelId: string): Promise<void>
	setThinking(tabId: string, level: WireThinkingLevel): Promise<void>
	disposeSession(tabId: string): Promise<void>
	dispose(): Promise<void>
	onEvent(listener: PiEventListener): void
}
