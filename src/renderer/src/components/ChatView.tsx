import { useEffect, useRef } from 'react'
import { VList, type VListHandle } from 'virtua'
import { useActiveTab, useSessionStore } from '../store/session-store'
import { MessageBubble } from './MessageBubble'
import { ToolCard } from './ToolCard'

const BOTTOM_THRESHOLD = 48

export function ChatView() {
	const tab = useActiveTab()
	const items = tab?.items ?? []
	const followSignal = tab?.followSignal ?? 0
	const tabsCount = useSessionStore((s) => s.tabs.length)
	const listRef = useRef<VListHandle>(null)
	const followRef = useRef(true)

	useEffect(() => {
		if (followSignal > 0) followRef.current = true
	}, [followSignal])

	useEffect(() => {
		if (followRef.current && items.length > 0) {
			listRef.current?.scrollToIndex(items.length - 1, { align: 'end' })
		}
	}, [items])

	const onScroll = () => {
		const handle = listRef.current
		if (!handle) return
		const atBottom = handle.scrollSize - handle.scrollOffset - handle.viewportSize < BOTTOM_THRESHOLD
		followRef.current = atBottom
	}

	if (!tab) {
		return (
			<div className="chat-empty">
				<div className="chat-empty-title">Pi Desktop</div>
				<p>{tabsCount === 0 ? '打开一个工作区，或从左侧恢复历史会话。' : '选择一个标签页。'}</p>
				<p className="chat-empty-hint">会话与 pi CLI 共享（~/.pi/agent/sessions），模型配置复用 ~/.pi/agent。</p>
			</div>
		)
	}

	return (
		<VList ref={listRef} onScroll={onScroll} className="chat-scroll">
			{items.map((item) => (
				<div key={item.id} className="chat-item-row">
					{item.kind === 'tool' ? <ToolCard item={item} /> : <MessageBubble item={item} />}
				</div>
			))}
		</VList>
	)
}
