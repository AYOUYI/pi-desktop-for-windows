import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/session-store'

const WIDTH_KEY = 'pi-desktop:browser-width'
const MIN_WIDTH = 320

function loadWidth(): number {
	try {
		const w = Number(localStorage.getItem(WIDTH_KEY))
		if (Number.isFinite(w) && w >= MIN_WIDTH && w <= 1200) return w
	} catch {
		/* ignore */
	}
	return 0 // 0 = 使用 CSS 默认比例
}

/**
 * 内嵌浏览器面板：占位 div 的窗口坐标上报给主进程，
 * 原生 WebContentsView（多标签，每个标签独立视图）覆盖在该区域上。
 * 左缘拖拽条调整宽度；Ctrl+滚轮在页面内是正常缩放（原生默认行为）。
 */
export function BrowserPanel() {
	const holderRef = useRef<HTMLDivElement>(null)
	const [url, setUrl] = useState('')
	const [width, setWidth] = useState<number>(() => loadWidth())
	const dragging = useRef(false)
	const tabs = useSessionStore((s) => s.browserTabs)
	const activeTabId = useSessionStore((s) => s.browserActiveTabId)

	// 活动标签变化时同步地址栏
	useEffect(() => {
		const active = tabs.find((t) => t.id === activeTabId)
		if (active && !active.url.startsWith('data:')) setUrl(active.url)
	}, [tabs, activeTabId])

	// 拖拽调宽：以窗口右缘为锚点
	useEffect(() => {
		const move = (e: MouseEvent) => {
			if (!dragging.current) return
			const next = Math.min(1200, Math.max(MIN_WIDTH, window.innerWidth - e.clientX))
			setWidth(next)
		}
		const up = () => {
			if (!dragging.current) return
			dragging.current = false
			document.body.style.cursor = ''
			setWidth((w) => {
				localStorage.setItem(WIDTH_KEY, String(w))
				return w
			})
		}
		window.addEventListener('mousemove', move)
		window.addEventListener('mouseup', up)
		return () => {
			window.removeEventListener('mousemove', move)
			window.removeEventListener('mouseup', up)
		}
	}, [])

	// 上报占位区域坐标（窗口坐标系）
	useEffect(() => {
		let raf = 0
		const report = () => {
			const el = holderRef.current
			if (el) {
				const r = el.getBoundingClientRect()
				void window.piDesktop.browserSetRect({
					x: Math.round(r.x),
					y: Math.round(r.y),
					width: Math.round(r.width),
					height: Math.round(r.height)
				})
			}
			raf = requestAnimationFrame(report)
		}
		raf = requestAnimationFrame(report)
		return () => cancelAnimationFrame(raf)
	}, [])

	const go = () => {
		if (url.trim()) void window.piDesktop.browserNavigate(url.trim())
	}

	return (
		<div className="browser-panel" style={width > 0 ? { width } : undefined}>
			<div
				className="browser-resizer"
				title="拖拽调整浏览器面板宽度"
				onMouseDown={(e) => {
					e.preventDefault()
					dragging.current = true
					document.body.style.cursor = 'col-resize'
				}}
			/>
			<div className="browser-tabs">
				<div className="browser-tabs-list">
					{tabs.map((t) => (
						<button
							key={t.id}
							type="button"
							className={t.id === activeTabId ? 'browser-tab active' : 'browser-tab'}
							title={t.url}
							onClick={() => void window.piDesktop.browserActivateTab(t.id)}
						>
							<span className="browser-tab-title">{t.title || '新标签页'}</span>
							{tabs.length > 1 && (
								<span
									className="browser-tab-close"
									onClick={(e) => {
										e.stopPropagation()
										void window.piDesktop.browserCloseTab(t.id)
									}}
								>
									✕
								</span>
							)}
						</button>
					))}
				</div>
				<button
					type="button"
					className="browser-tab-new"
					title="新建标签页"
					onClick={() => void window.piDesktop.browserNewTab()}
				>
					＋
				</button>
			</div>
			<div className="browser-bar">
				<span className="browser-dot" />
				<input
					className="input browser-url"
					placeholder="输入网址，回车打开（agent 也可操作此浏览器）"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') go()
					}}
				/>
				<button type="button" className="btn-secondary" onClick={go}>
					打开
				</button>
			</div>
			<div className="browser-holder" ref={holderRef} />
		</div>
	)
}
