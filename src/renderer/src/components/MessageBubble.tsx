import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatItem } from '../store/session-store'
import { CodeBlock } from './CodeBlock'

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
				{item.usage && (
					<div className="msg-usage">
						<span>↑ {formatTokens(item.usage.input)}</span>
						<span>↓ {formatTokens(item.usage.output)}</span>
						{item.usage.costTotal > 0 && <span>${item.usage.costTotal.toFixed(4)}</span>}
					</div>
				)}
			</div>
		)
	}

	return null
}
