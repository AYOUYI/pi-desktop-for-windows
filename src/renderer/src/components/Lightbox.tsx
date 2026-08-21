import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * 全屏图片预览：点击任意位置或按 Esc 关闭，右上角提供 ✕。
 * 通过 Portal 渲染到 document.body——虚拟列表的行用 transform 定位，
 * 会把 position:fixed 俘虏成相对行定位，导致遮罩错位/文本穿透。
 * 打开期间压制原生浏览器视图（原生层渲染在页面之上）。
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

	return createPortal(
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
		</div>,
		document.body
	)
}
