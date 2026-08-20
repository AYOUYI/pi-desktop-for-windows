import { useEffect, useRef, useState } from 'react'

/**
 * 内嵌浏览器面板：占位 div 的窗口坐标上报给主进程，
 * 原生 WebContentsView 覆盖在该区域上实时渲染页面。
 */
export function BrowserPanel() {
	const holderRef = useRef<HTMLDivElement>(null)
	const [url, setUrl] = useState('')

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
		<div className="browser-panel">
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
