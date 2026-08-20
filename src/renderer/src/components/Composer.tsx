import { useRef, useState } from 'react'
import { useSessionStore } from '../store/session-store'

export function Composer() {
	const cwd = useSessionStore((s) => s.cwd)
	const busy = useSessionStore((s) => s.busy)
	const sendPrompt = useSessionStore((s) => s.sendPrompt)
	const [text, setText] = useState('')
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const submit = async () => {
		const value = text.trim()
		if (!value || !cwd) return
		setText('')
		if (busy) {
			// Mid-run input becomes a steering message (pi queues it into the current run).
			await window.piDesktop.steer(value)
			sendPrompt(`（steer）${value}`)
		} else {
			sendPrompt(value)
			await window.piDesktop.prompt(value)
		}
		textareaRef.current?.focus()
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			void submit()
		}
	}

	return (
		<div className="composer">
			<textarea
				ref={textareaRef}
				className="composer-input"
				placeholder={cwd ? (busy ? '运行中输入可追加指令（steer），Enter 发送' : '给 pi 发送消息，Enter 发送，Shift+Enter 换行') : '请先打开工作区'}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={onKeyDown}
				rows={3}
				disabled={!cwd}
			/>
			<div className="composer-actions">
				{busy ? (
					<button type="button" className="btn-stop" onClick={() => void window.piDesktop.abort()}>
						停止
					</button>
				) : (
					<button type="button" className="btn-send" onClick={() => void submit()} disabled={!cwd || !text.trim()}>
						发送
					</button>
				)}
			</div>
		</div>
	)
}
