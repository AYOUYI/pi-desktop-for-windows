import { useEffect, useRef, useState } from 'react'
import { useActiveTab, useSessionStore } from '../store/session-store'
import type { WireImage, WireThinkingLevel } from '../../../shared/types'

const THINKING_LABEL: Record<WireThinkingLevel, string> = {
	minimal: '关',
	low: '低',
	medium: '中',
	high: '高',
	xhigh: '极高',
	max: '最大'
}

const THINKING_OPTIONS: WireThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function ModelChip() {
	const models = useSessionStore((s) => s.models)
	const tab = useActiveTab()
	const setModelActive = useSessionStore((s) => s.setModelActive)
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const close = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [open])

	// 会话绑定的模型可能尚未出现在可用列表里（可用性异步刷新），此时直接展示限定 ID
	const current =
		models.find((m) => m.id === tab?.modelId) ??
		(tab?.modelId
			? {
					id: tab.modelId,
					name: tab.modelId.slice(tab.modelId.indexOf('/') + 1),
					provider: tab.modelId.slice(0, tab.modelId.indexOf('/'))
				}
			: undefined)

	return (
		<div className="chip-wrap" ref={ref}>
			<button type="button" className="chip" onClick={() => setOpen((v) => !v)} disabled={!tab}>
				<span className="chip-label" title={current?.id}>
					{current ? `${current.name}` : '选择模型'}
				</span>
				<span className="chip-caret">▾</span>
			</button>
			{open && (
				<div className="chip-menu">
					{models.length === 0 && <div className="chip-empty">无可用模型（检查设置中的供应商）</div>}
					{models.map((m) => (
						<button
							key={m.id}
							type="button"
							className={m.id === tab?.modelId ? 'chip-option active' : 'chip-option'}
							onClick={() => {
								setOpen(false)
								void setModelActive(m.id)
							}}
						>
							<span className="chip-option-name">{m.name}</span>
							<span className="chip-option-provider">{m.provider}</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function ThinkingChip() {
	const tab = useActiveTab()
	const setThinkingActive = useSessionStore((s) => s.setThinkingActive)
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const close = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [open])

	if (!tab) return null

	return (
		<div className="chip-wrap" ref={ref}>
			<button type="button" className="chip" onClick={() => setOpen((v) => !v)}>
				<span className="chip-label">{THINKING_LABEL[tab.thinkingLevel] ?? tab.thinkingLevel}</span>
				<span className="chip-caret">▾</span>
			</button>
			{open && (
				<div className="chip-menu">
					{THINKING_OPTIONS.map((level) => (
						<button
							key={level}
							type="button"
							className={tab.thinkingLevel === level ? 'chip-option active' : 'chip-option'}
							onClick={() => {
								setOpen(false)
								void setThinkingActive(level)
							}}
						>
							<span className="chip-option-name">{THINKING_LABEL[level]}</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}

export function Composer() {
	const tab = useActiveTab()
	const sendPrompt = useSessionStore((s) => s.sendPrompt)
	const gitStats = useSessionStore((s) => s.gitStats)
	const text = useSessionStore((s) => s.tabs.find((t) => t.tabId === s.activeTabId)?.draft ?? '')
	const setText = useSessionStore((s) => s.setDraft)
	const editSignal = useSessionStore((s) => s.tabs.find((t) => t.tabId === s.activeTabId)?.editSignal ?? 0)
	const pendingImages = useSessionStore((s) => s.attachments)
	const addImageFiles = useSessionStore((s) => s.addImageFiles)
	const removeAttachment = useSessionStore((s) => s.removeAttachment)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)

	// 「编辑」回填后聚焦输入框
	useEffect(() => {
		if (editSignal > 0) textareaRef.current?.focus()
	}, [editSignal])

	const busy = tab?.busy ?? false

	const submit = async () => {
		if ((!text.trim() && pendingImages.length === 0) || !tab) return
		const images = pendingImages
		setText('')
		if (busy) {
			await window.piDesktop.steer(text)
			sendPrompt(`（steer）${text}`)
		} else {
			sendPrompt(text, images)
			await window.piDesktop.prompt(text, images)
		}
		textareaRef.current?.focus()
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			void submit()
		}
	}

	const onPaste = (e: React.ClipboardEvent) => {
		const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
		if (files.length > 0) {
			e.preventDefault()
			void addImageFiles(files)
		}
	}

	return (
		<div className="composer">
			{pendingImages.length > 0 && (
				<div className="composer-attachments">
					{pendingImages.map((img, i) => (
						<span key={i} className="attach-thumb">
							<img src={`data:${img.mimeType};base64,${img.data}`} alt="待发送图片" />
							<button type="button" className="attach-remove" onClick={() => removeAttachment(i)}>
								✕
							</button>
						</span>
					))}
				</div>
			)}
			<textarea
				ref={textareaRef}
				className="composer-input"
				placeholder={
					tab
						? busy
							? '运行中输入可追加指令（steer），Enter 发送'
							: '给 pi 发送消息，Enter 发送，Shift+Enter 换行；可粘贴/拖入图片'
						: '打开工作区或选择左侧会话开始'
				}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={onKeyDown}
				onPaste={onPaste}
				rows={3}
				disabled={!tab}
			/>
			<div className="composer-meta">
				<span className="git-chip" title={tab?.cwd}>
					{gitStats
						? `${gitStats.changedFiles} 个文件已更改 +${gitStats.insertions} -${gitStats.deletions}`
						: ''}
				</span>
				<div className="composer-controls">
					<button
						type="button"
						className="attach-btn"
						title="添加图片（模型需支持视觉输入）"
						disabled={!tab}
						onClick={() => fileRef.current?.click()}
					>
						🖼
					</button>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						multiple
						style={{ display: 'none' }}
						onChange={(e) => {
							if (e.target.files) void addImageFiles(Array.from(e.target.files))
							e.target.value = ''
						}}
					/>
					<ModelChip />
					<ThinkingChip />
					{busy ? (
						<button type="button" className="btn-stop" onClick={() => void window.piDesktop.abort()}>
							停止
						</button>
					) : (
						<button
							type="button"
							className="btn-send"
							onClick={() => void submit()}
							disabled={!tab || !text.trim()}
						>
							发送
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
