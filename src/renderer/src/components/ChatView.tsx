import { useEffect, useRef, useState } from 'react'
import { VList, type VListHandle } from 'virtua'
import { useActiveTab, useSessionStore, type ChatItem } from '../store/session-store'
import { MessageBubble } from './MessageBubble'
import { ToolCard } from './ToolCard'
import { Lightbox } from './Lightbox'

const BOTTOM_THRESHOLD = 48

/** show_image 的结果直接渲染为对话里的图片消息（无工具卡片/参数） */
function ShowImageMessage({ item }: { item: ChatItem }) {
	const [zoom, setZoom] = useState<string | null>(null)
	let caption = ''
	try {
		const args = JSON.parse(item.argsPreview ?? '{}') as { caption?: string; path?: string }
		caption = args.caption ?? args.path ?? ''
	} catch {
		caption = ''
	}
	const name = caption.split(/[\\/]/).pop() || caption
	return (
		<div className="msg msg-assistant">
			<div className="msg-role">pi</div>
			{item.images?.map((img, i) => (
				<img
					key={i}
					className="show-image"
					src={`data:${img.mimeType};base64,${img.data}`}
					alt={caption || '图片'}
					onClick={() => setZoom(`data:${img.mimeType};base64,${img.data}`)}
				/>
			))}
			{caption && <div className="show-image-caption">{name}</div>}
			{zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
		</div>
	)
}

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
					{item.kind === 'tool' ? (
						item.toolName === 'show_image' && item.images && item.images.length > 0 ? (
							<ShowImageMessage item={item} />
						) : (
							<ToolCard item={item} />
						)
					) : (
						<MessageBubble item={item} />
					)}
				</div>
			))}
		</VList>
	)
}
