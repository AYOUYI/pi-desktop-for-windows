import { useEffect } from 'react'

/**
 * 全屏图片预览：点击任意位置或按 Esc 关闭，右上角提供 ✕。
 * 打开期间压制原生浏览器视图（原生层渲染在页面之上，会遮挡并吞掉点击）。
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
	useEffect(() => {
		void window.piDesktop.browserSetSuppressed(true)
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('keydown', onKey)
			void window.piDesktop.browserSetSuppressed(false)
		}
	}, [onClose])

	return (
		<div className="lightbox" onClick={onClose}>
			<img src={src} alt="预览" />
			<button
				type="button"
				className="lightbox-close"
				title="关闭 (Esc)"
				onClick={(e) => {
					e.stopPropagation()
					onClose()
				}}
			>
				✕
			</button>
		</div>
	)
}
