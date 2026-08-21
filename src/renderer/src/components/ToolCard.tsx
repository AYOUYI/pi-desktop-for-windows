import { useMemo, useState } from 'react'
import { createPatch } from 'diff'
import { useActiveTab, type ChatItem } from '../store/session-store'
import { DiffView } from './DiffView'

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
	return (
		<div className="lightbox" onClick={onClose}>
			<img src={src} alt="预览" onClick={(e) => e.stopPropagation()} />
		</div>
	)
}

const TOOL_STATUS_LABEL: Record<string, string> = {
	running: '运行中',
	complete: '完成',
	error: '出错',
	aborted: '已中止'
}

function baseName(path: string | undefined): string {
	if (!path) return ''
	const normalized = path.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/** One-line live tail for streaming bash output. */
function tailLine(text: string | undefined): string {
	if (!text) return ''
	const lines = text.trimEnd().split('\n')
	const last = lines[lines.length - 1] ?? ''
	return last.length > 80 ? `${last.slice(0, 80)}…` : last
}

export function ToolCard({ item }: { item: ChatItem }) {
	const [open, setOpen] = useState(false)
	const [lightbox, setLightbox] = useState<string | null>(null)
	const cwd = useActiveTab()?.cwd ?? null
	const statusClass = item.status === 'running' ? 'running' : item.status === 'error' || item.status === 'aborted' ? 'error' : 'done'

	// write 工具没有 details.patch，从参数合成一个全新增量的 unified patch。
	const writePatch = useMemo(() => {
		if (item.toolName !== 'write' || !item.writeContent || item.patch) return undefined
		try {
			return createPatch(item.path ?? 'file', '', item.writeContent, '', '')
		} catch {
			return undefined
		}
	}, [item.toolName, item.writeContent, item.path, item.patch])

	const patch = item.patch ?? writePatch
	const showDiff = (item.toolName === 'edit' || item.toolName === 'write') && !!patch

	const headerTarget = (() => {
		if (item.command) return item.command.length > 64 ? `${item.command.slice(0, 64)}…` : item.command
		if (item.path) {
			const base = baseName(item.path)
			return cwd && item.path.startsWith(cwd) ? base : item.path
		}
		return ''
	})()

	const badge = (() => {
		if (item.status === 'running') {
			if (item.toolName === 'bash') return tailLine(item.resultText) || '…'
			return ''
		}
		if (item.toolName === 'bash' && item.exitCode != null) {
			return `exit ${item.exitCode}`
		}
		if (item.toolName === 'edit' && item.edits != null) {
			return `${item.edits} 处修改`
		}
		return ''
	})()

	return (
		<>
			<div className={`tool-card ${statusClass}`}>
			<button type="button" className="tool-header" onClick={() => setOpen((v) => !v)}>
				<span className="tool-status-dot" />
				<span className="tool-name">{item.toolName ?? 'tool'}</span>
				{headerTarget && <span className="tool-target">{headerTarget}</span>}
				{badge && <span className="tool-badge">{badge}</span>}
				<span className="tool-status">{TOOL_STATUS_LABEL[item.status] ?? item.status}</span>
				<span className="tool-chevron">{open ? '▾' : '▸'}</span>
			</button>
			{open && (
				<div className="tool-detail">
					{item.images && item.images.length > 0 && (
						<div className="tool-section">
							<div className="tool-section-label">图像</div>
							<div className="msg-images">
								{item.images.map((img, i) => (
									<img
										key={i}
										src={`data:${img.mimeType};base64,${img.data}`}
										alt="工具结果图片"
										onClick={() => setLightbox(`data:${img.mimeType};base64,${img.data}`)}
									/>
								))}
							</div>
						</div>
					)}
					{item.command && (
						<div className="tool-section">
							<div className="tool-section-label">命令</div>
							<pre className="tool-command">{item.command}</pre>
						</div>
					)}
					{showDiff ? (
						<div className="tool-section">
							<div className="tool-section-label">变更</div>
							<DiffView patch={patch!} />
						</div>
					) : (
						item.argsPreview &&
						item.toolName !== 'bash' && (
							<div className="tool-section">
								<div className="tool-section-label">参数</div>
								<pre>{item.argsPreview}</pre>
							</div>
						)
					)}
					{!showDiff && item.resultText && (
						<div className="tool-section">
							<div className="tool-section-label">{item.isError ? '错误' : '输出'}</div>
							<pre>{item.resultText}</pre>
						</div>
					)}
					{showDiff && item.isError && item.resultText && (
						<div className="tool-section">
							<div className="tool-section-label">错误</div>
							<pre>{item.resultText}</pre>
						</div>
					)}
					</div>
				)}
			</div>
			{lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
		</>
	)
}
