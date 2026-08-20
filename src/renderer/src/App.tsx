import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionStore, type ChatItem } from './store/session-store'
import { Sidebar } from './components/Sidebar'
import { Composer } from './components/Composer'

function MessageBubble({ item }: { item: ChatItem }) {
	if (item.kind === 'user') {
		return (
			<div className="msg msg-user">
				<div className="msg-role">你</div>
				<div className="msg-body user-text">{item.text}</div>
			</div>
		)
	}

	if (item.kind === 'assistant') {
		return (
			<div className="msg msg-assistant">
				<div className="msg-role">pi {item.status === 'streaming' && <span className="spinner" />}</div>
				{item.thinking && (
					<details className="thinking">
						<summary>思考过程</summary>
						<pre>{item.thinking}</pre>
					</details>
				)}
				<div className="msg-body">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text || (item.status === 'streaming' ? '' : '（无输出）')}</ReactMarkdown>
				</div>
			</div>
		)
	}

	return null
}

const TOOL_STATUS_LABEL: Record<string, string> = {
	running: '运行中',
	complete: '完成',
	error: '出错'
}

function ToolCard({ item }: { item: ChatItem }) {
	const [open, setOpen] = useState(false)
	const statusClass = item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'done'
	return (
		<div className={`tool-card ${statusClass}`}>
			<button type="button" className="tool-header" onClick={() => setOpen((v) => !v)}>
				<span className="tool-status-dot" />
				<span className="tool-name">{item.toolName ?? 'tool'}</span>
				<span className="tool-status">{TOOL_STATUS_LABEL[item.status] ?? item.status}</span>
				<span className="tool-chevron">{open ? '▾' : '▸'}</span>
			</button>
			{open && (
				<div className="tool-detail">
					{item.argsPreview && (
						<div className="tool-section">
							<div className="tool-section-label">参数</div>
							<pre>{item.argsPreview}</pre>
						</div>
					)}
					{item.resultText && (
						<div className="tool-section">
							<div className="tool-section-label">{item.isError ? '错误' : '结果'}</div>
							<pre>{item.resultText}</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function ChatView() {
	const items = useSessionStore((s) => s.items)
	const cwd = useSessionStore((s) => s.cwd)
	const bottomRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: 'end' })
	}, [items])

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
		<div className="chat-scroll">
			<div className="chat-list">
				{items.map((item) =>
					item.kind === 'tool' ? <ToolCard key={item.id} item={item} /> : <MessageBubble key={item.id} item={item} />
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	)
}

export function App() {
	const setReady = useSessionStore((s) => s.setReady)
	const setNotice = useSessionStore((s) => s.setNotice)
	const applyEvent = useSessionStore((s) => s.applyEvent)
	const busy = useSessionStore((s) => s.busy)

	useEffect(() => {
		const off = window.piDesktop.onPiEvent((payload) => {
			applyEvent(payload.event)
		})
		void (async () => {
			const info = await window.piDesktop.getAppInfo()
			console.log('[pi-desktop]', info)
			if (!info.nodeOk) {
				setNotice(`Electron 内置 Node ${info.node} 低于 pi SDK 要求的 22.19.0，需要切换到 RPC 模式。`)
			}
			const models = await window.piDesktop.listModels()
			useSessionStore.getState().setModels(models)
			if (models.length === 0) {
				setNotice(
					'未发现可用模型。请先配置认证：运行 pi auth login，或设置环境变量（如 ANTHROPIC_API_KEY / OPENAI_API_KEY），或填写 ~/.pi/agent/auth.json。'
				)
			}
			setReady(true)
		})()
		return off
	}, [applyEvent, setNotice, setReady])

	return (
		<div className="app-shell">
			<Sidebar />
			<div className="main-column">
				<div className="main-header">
					<span className="main-title">{busy ? 'pi 正在工作…' : 'pi'}</span>
				</div>
				<ChatView />
				<Composer />
			</div>
		</div>
	)
}
