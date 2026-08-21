import { useMemo, useState } from 'react'
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

/**
 * 剥离混在正文里的 <think>/<thinking> 标签（部分供应商/中转把思考当文本输出）。
 * 流式中未闭合的标签也视为思考（正文尚未开始）。
 */
function splitThink(text: string): { think: string; body: string } {
	let think = ''
	let body = text
	body = body.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_m, inner: string) => {
		think += inner
		return ''
	})
	const open = /<think(?:ing)>([\s\S]*)$/i.exec(body)
	if (open) {
		think += open[1]
		body = body.slice(0, open.index)
	}
	return { think: think.trim(), body: body.trim() }
}

/**
 * 部分中转把思考内容同时发进 thinking 和 text 两个通道，正文会重复一遍。
 * 当正文前缀与思考内容一致时，把重复部分从正文剥掉（保留其后的最终回答）。
 * 快速路径先做原样前缀比对（流式高频调用，避免每次都做正则归一化）。
 */
function dedupeThinking(thinking: string, body: string): string {
	if (!thinking || !body) return body
	if (thinking.length > 200_000) return body // 超长内容跳过去重，保证流式性能
	if (body.startsWith(thinking)) return body.slice(thinking.length).trim()
	if (thinking.startsWith(body)) return ''
	const nt = thinking.replace(/\s+/g, ' ').trim()
	const nb = body.replace(/\s+/g, ' ').trim()
	if (!nt || !nb || !nb.startsWith(nt)) return body
	const ratio = body.length / Math.max(1, nb.length)
	return body.slice(Math.round(nt.length * ratio)).trim()
}

function MsgActions({ item, text }: { item: ChatItem; text?: string }) {
	const [copied, setCopied] = useState(false)
	const editIntoComposer = useSessionStore((s) => s.editIntoComposer)
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text ?? item.text)
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
	// 思考净化/去重按内容记忆化，流式 delta 高频重渲染下避免重复全文扫描
	const display = useMemo(() => {
		if (item.kind !== 'assistant') return null
		const { think: inlineThink, body: tagCleaned } = splitThink(item.text)
		const merged = [item.thinking, inlineThink].filter(Boolean).join('\n')
		return { thinking: merged, body: dedupeThinking(merged, tagCleaned) }
	}, [item.kind, item.text, item.thinking])

	if (item.kind === 'user') {
		return (
			<div className="msg msg-user">
				<div className="msg-role">你</div>
				{item.images && item.images.length > 0 && (
					<div className="msg-images">
						{item.images.map((img, i) => (
							<img key={i} src={`data:${img.mimeType};base64,${img.data}`} alt="附件图片" />
						))}
					</div>
				)}
				<div className="msg-body user-text">{item.text}</div>
				{item.text && <MsgActions item={item} />}
			</div>
		)
	}

	if (item.kind === 'assistant') {
		const thinking = display?.thinking ?? ''
		const body = display?.body ?? item.text
		return (
			<div className="msg msg-assistant">
				<div className="msg-role">
					pi {item.status === 'streaming' && <span className="spinner" />}
				</div>
				{thinking && (
					<details className="thinking">
						<summary>思考过程</summary>
						<pre>{thinking}</pre>
					</details>
				)}
				{item.images && item.images.length > 0 && (
					<div className="msg-images">
						{item.images.map((img, i) => (
							<img key={i} src={`data:${img.mimeType};base64,${img.data}`} alt="消息图片" />
						))}
					</div>
				)}
				<div className="msg-body">
					{item.status === 'error' && item.errorText ? (
						<div className="msg-error">出错了：{item.errorText}</div>
					) : (
						<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
							{body || (item.status === 'streaming' ? '' : '（无输出）')}
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
				{body && item.status !== 'streaming' && <MsgActions item={item} text={body} />}
			</div>
		)
	}

	return null
}
