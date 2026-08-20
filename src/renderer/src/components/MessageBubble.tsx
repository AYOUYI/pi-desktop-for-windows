import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionStore, type ChatItem } from '../store/session-store'
import { CodeBlock } from './CodeBlock'

function IconCopy() {
	return (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="9" y="9" width="12" height="12" rx="2" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	)
}

function IconEdit() {
	return (
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
		</svg>
	)
}

function MsgActions({ item }: { item: ChatItem }) {
	const [copied, setCopied] = useState(false)
	const editIntoComposer = useSessionStore((s) => s.editIntoComposer)
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(item.text)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			/* clipboard unavailable */
		}
	}
	return (
		<div className="msg-actions">
			<button type="button" className="msg-icon-btn" title="复制" onClick={() => void copy()}>
				<IconCopy />
				{copied && <span className="msg-action-tip">已复制</span>}
			</button>
			{item.kind === 'user' && (
				<button
					type="button"
					className="msg-icon-btn"
					title="编辑（放回输入框）"
					onClick={() => editIntoComposer(item.text)}
				>
					<IconEdit />
				</button>
			)}
		</div>
	)
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

const markdownComponents = {
	pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
		const text = String(children ?? '')
		const match = /language-([\w-]+)/.exec(className ?? '')
		if (!match && !text.includes('\n')) {
			return <code>{text}</code>
		}
		return <CodeBlock code={text.replace(/\n$/, '')} lang={match?.[1] ?? 'text'} />
	}
}

export function MessageBubble({ item }: { item: ChatItem }) {
	if (item.kind === 'user') {
		return (
			<div className="msg msg-user">
				<div className="msg-role">你</div>
				<div className="msg-body user-text">{item.text}</div>
				{item.text && <MsgActions item={item} />}
			</div>
		)
	}

	if (item.kind === 'assistant') {
		return (
			<div className="msg msg-assistant">
				<div className="msg-role">
					pi {item.status === 'streaming' && <span className="spinner" />}
				</div>
				{item.thinking && (
					<details className="thinking">
						<summary>思考过程</summary>
						<pre>{item.thinking}</pre>
					</details>
				)}
				<div className="msg-body">
					{item.status === 'error' && item.errorText ? (
						<div className="msg-error">出错了：{item.errorText}</div>
					) : (
						<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
							{item.text || (item.status === 'streaming' ? '' : '（无输出）')}
						</ReactMarkdown>
					)}
				</div>
				{(item.usage || item.modelUsed) && (
					<div className="msg-usage">
						{item.modelUsed && <span title="本轮实际使用的模型">模型：{item.modelUsed}</span>}
						{item.usage && <span>↑ {formatTokens(item.usage.input)}</span>}
						{item.usage && <span>↓ {formatTokens(item.usage.output)}</span>}
						{item.usage && item.usage.costTotal > 0 && <span>${item.usage.costTotal.toFixed(4)}</span>}
					</div>
				)}
				{item.text && item.status !== 'streaming' && <MsgActions item={item} />}
			</div>
		)
	}

	return null
}
