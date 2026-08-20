import { useEffect, useRef } from 'react'
import { VList, type VListHandle } from 'virtua'
import { useSessionStore } from '../store/session-store'
import { MessageBubble } from './MessageBubble'
import { ToolCard } from './ToolCard'

const BOTTOM_THRESHOLD = 48

export function ChatView() {
	const items = useSessionStore((s) => s.items)
	const cwd = useSessionStore((s) => s.cwd)
	const followSignal = useSessionStore((s) => s.followSignal)
	const listRef = useRef<VListHandle>(null)
	const followRef = useRef(true)

	// 用户手动发送后始终回到底部。
	useEffect(() => {
		if (followSignal > 0) followRef.current = true
	}, [followSignal])

	// 流式更新时贴底滚动；用户上滚即停止跟随。
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

	if (!cwd) {
		return (
			<div className="chat-empty">
				<div className="chat-empty-title">Pi Desktop</div>
				<p>选择一个工作区开始与 pi 对话。</p>
				<p className="chat-empty-hint">左侧点击「打开工作区」，模型与配置复用 ~/.pi/agent。</p>
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
