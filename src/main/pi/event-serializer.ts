import type { AgentSessionEvent, JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'

/**
 * Convert a live AgentSessionEvent into a JSON-safe wire event.
 *
 * `message_update` events carry `assistantMessageEvent.partial`, a cumulative
 * AssistantMessage snapshot attached to every delta. It is redundant over IPC
 * (the renderer folds deltas itself) and roughly quadratic in traffic, so it is
 * dropped — same trade-off pi's own JSON/RPC wire modes make via toJsonEvent().
 */
export function serializeSessionEvent(event: AgentSessionEvent): JsonAgentSessionEvent {
	if (event.type === 'message_update') {
		const { assistantMessageEvent, ...rest } = event
		const { partial: _dropped, ...slim } = assistantMessageEvent as Record<string, unknown> & {
			partial?: unknown
		}
		return { ...rest, assistantMessageEvent: slim } as unknown as JsonAgentSessionEvent
	}
	return event as unknown as JsonAgentSessionEvent
}
