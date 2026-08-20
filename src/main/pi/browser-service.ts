import { WebContentsView, type BrowserWindow } from 'electron'
import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

export interface BrowserState {
	open: boolean
	url: string
	title: string
}

export type BrowserStateListener = (state: BrowserState) => void

/**
 * 内嵌浏览器：主窗口的 WebContentsView 子视图（原生表面，实时可见），
 * 由 agent 的 browser_* 工具与用户（地址栏）共同驱动。
 */
export class BrowserService {
	private view: WebContentsView | null = null
	private win: BrowserWindow | null = null
	private rect = { x: 0, y: 0, width: 0, height: 0 }
	private open = false
	/** 模态弹窗打开时压制原生视图（原生层在渲染页面之上，会遮挡 overlay） */
	private suppressed = false
	private listeners: BrowserStateListener[] = []
	private zoomListeners: Array<(dir: 1 | -1) => void> = []

	attach(win: BrowserWindow): void {
		this.win = win
	}

	onState(listener: BrowserStateListener): void {
		this.listeners.push(listener)
	}

	/** Ctrl+滚轮（原生视图区的页面缩放请求）转为面板调宽信号 */
	onZoom(listener: (dir: 1 | -1) => void): void {
		this.zoomListeners.push(listener)
	}

	private emit(): void {
		const state: BrowserState = {
			open: this.open,
			url: this.view?.webContents.getURL() ?? '',
			title: this.view?.webContents.getTitle() ?? ''
		}
		for (const l of this.listeners) l(state)
	}

	private ensureView(): WebContentsView {
		if (this.view) return this.view
		if (!this.win) throw new Error('BrowserService is not attached to a window')
		const view = new WebContentsView({
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true
			}
		})
		view.webContents.on('did-navigate', () => this.emit())
		view.webContents.on('did-navigate-in-page', () => this.emit())
		view.webContents.on('page-title-updated', () => this.emit())
		view.webContents.setWindowOpenHandler(({ url }) => {
			// 新窗口请求在当前面板内打开
			void view.webContents.loadURL(url)
			return { action: 'deny' }
		})
		// Ctrl+滚轮不缩放页面，改为调整面板宽度
		view.webContents.on('zoom-changed', (e, direction) => {
			e.preventDefault()
			const dir: 1 | -1 = direction === 'in' ? 1 : -1
			for (const l of this.zoomListeners) l(dir)
		})
		this.win.contentView.addChildView(view)
		view.setBounds(this.rect)
		view.setBackgroundColor('#141419')
		this.updateVisibility()
		this.view = view
		return view
	}

	setOpen(open: boolean): void {
		this.open = open
		const view = this.ensureView()
		this.updateVisibility()
		if (open && !view.webContents.getURL()) {
			void view.webContents.loadURL(BrowserService.startPageUrl()).then(() => this.emit())
		}
		this.emit()
	}

	setSuppressed(suppressed: boolean): void {
		this.suppressed = suppressed
		this.updateVisibility()
	}

	private updateVisibility(): void {
		this.view?.setVisible(this.open && !this.suppressed)
	}

	isOpen(): boolean {
		return this.open
	}

	/** 渲染端上报面板占位区域的窗口坐标，原生视图对齐覆盖。 */
	setRect(rect: { x: number; y: number; width: number; height: number }): void {
		this.rect = rect
		this.view?.setBounds(rect)
	}

	async navigate(url: string): Promise<string> {
		const view = this.ensureView()
		if (!this.open) this.setOpen(true)
		const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
		await view.webContents.loadURL(target)
		this.emit()
		return `已打开 ${target}（${view.webContents.getTitle()}）`
	}

	async screenshot(): Promise<{ data: string; mimeType: string; width: number; height: number }> {
		const view = this.ensureView()
		const image = await view.webContents.capturePage()
		const buf = image.toJPEG(82)
		return {
			data: buf.toString('base64'),
			mimeType: 'image/jpeg',
			width: image.getSize().width,
			height: image.getSize().height
		}
	}

	/** 通过 selector 或可见文本定位元素中心坐标。 */
	private async locate(selector?: string, text?: string): Promise<{ x: number; y: number } | null> {
		const view = this.ensureView()
		const code = `(() => {
			const selector = ${JSON.stringify(selector ?? null)};
			const text = ${JSON.stringify(text ?? null)};
			let el = null;
			if (selector) {
				try { el = document.querySelector(selector); } catch { el = null; }
			}
			if (!el && text) {
				const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
				const want = norm(text);
				const candidates = [...document.querySelectorAll('a, button, input, [role="button"], label, span, div, li, td')];
				el = candidates.find((n) => norm(n.textContent) === want && n.offsetParent !== null)
					|| candidates.find((n) => norm(n.textContent).includes(want) && norm(n.textContent).length < want.length * 3 + 20 && n.offsetParent !== null);
			}
			if (!el) return null;
			el.scrollIntoView({ block: 'center' });
			const r = el.getBoundingClientRect();
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		})()`
		return (await view.webContents.executeJavaScript(code)) as { x: number; y: number } | null
	}

	async click(selector?: string, text?: string): Promise<string> {
		const view = this.ensureView()
		const pos = await this.locate(selector, text)
		if (!pos) {
			return `未找到可点击元素（selector=${selector ?? '-'} text=${text ?? '-'}）。先用 browser_get_content 或 browser_screenshot 查看页面。`
		}
		const x = Math.round(pos.x)
		const y = Math.round(pos.y)
		view.webContents.sendInputEvent({ type: 'mouseMove', x, y })
		view.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
		view.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
		await new Promise((r) => setTimeout(r, 300))
		return `已点击 (${x}, ${y})${text ? `「${text}」` : selector ? ` <${selector}>` : ''}`
	}

	async typeText(selector: string | undefined, text: string, submit: boolean): Promise<string> {
		const view = this.ensureView()
		if (selector) {
			const ok = await view.webContents.executeJavaScript(
				`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return true; })()`
			)
			if (!ok) return `未找到输入框 <${selector}>`
		}
		view.webContents.insertText(text)
		if (submit) {
			await new Promise((r) => setTimeout(r, 150))
			view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
			view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
		}
		return `已输入「${text.slice(0, 60)}」${submit ? '并提交' : ''}`
	}

	async evaluate(code: string): Promise<string> {
		const view = this.ensureView()
		const result = await view.webContents.executeJavaScript(code)
		try {
			return typeof result === 'string' ? result : JSON.stringify(result)
		} catch {
			return String(result)
		}
	}

	async getContent(maxChars = 6000): Promise<string> {
		const view = this.ensureView()
		const text = (await view.webContents.executeJavaScript(
			'document.body ? document.body.innerText : ""'
		)) as string
		return text.length > maxChars ? `${text.slice(0, maxChars)}\n…（截断，共 ${text.length} 字符）` : text
	}

	// ---------- agent 工具 ----------

	/** 注入系统提示 Guidelines：让模型理解内嵌浏览器的存在与使用方式 */
	private static readonly GUIDELINES = [
		'本应用内置用户实时可见的浏览器面板。打开网站、登录、扫码、填表、抓取页面等交互式网页任务，默认使用 browser_* 工具在内嵌浏览器中完成（用户能实时看到页面并配合扫码等交互）。',
		'只有用户明确要求使用某个 CLI/技能时才走 CLI 流程；CLI 缺失或失败时回退到内嵌浏览器。',
		'你只能看见内嵌浏览器：bash 等命令在桌面弹出的外部窗口你无法看到，也不要假设能看到。',
		'导航或点击后调用 browser_screenshot 查看页面（截图以图像返回，你可以直接看到），据此决定下一步操作。',
		'定位元素优先用可见文本（browser_click 的 text 参数），其次用 CSS selector；填表用 browser_type。'
	]

	/** 面板空状态起始页（避免 about:blank 在深色主题下渲染为纯黑） */
	private static startPageUrl(): string {
		const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#141419;color:#dcdde4;font-family:'Segoe UI','Microsoft YaHei',sans-serif}
.box{text-align:center;max-width:420px}
.logo{width:56px;height:56px;border-radius:14px;background:#7c6cf0;color:#fff;font-size:30px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px}
h1{font-size:17px;font-weight:600;margin:0 0 10px}
p{font-size:13px;color:#8b8d9c;line-height:1.7;margin:0 0 18px}
.links{display:flex;gap:10px;justify-content:center}
a{color:#dcdde4;text-decoration:none;font-size:12.5px;border:1px solid #2c2d38;border-radius:16px;padding:6px 14px}
a:hover{border-color:#7c6cf0}
</style></head><body><div class="box">
<div class="logo">π</div>
<h1>内嵌浏览器已就绪</h1>
<p>在上方地址栏输入网址回车打开；<br>或直接让 agent 用 browser_* 工具操作此浏览器（导航、点击、截图、填表）。</p>
<div class="links"><a href="https://www.baidu.com">百度</a><a href="https://www.bing.com">必应</a><a href="https://www.douyin.com">抖音</a></div>
</div></body></html>`
		return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
	}

	tools(): ToolDefinition[] {
		const svc = this
		const G = BrowserService.GUIDELINES
		return [
			defineTool({
				name: 'browser_open',
				label: '打开网页',
				description: '在应用内嵌浏览器面板中打开 URL 并等待加载完成（用户实时可见该面板）。',
				promptSnippet: 'browser_open(url) - 内嵌浏览器导航',
				promptGuidelines: G,
				parameters: Type.Object({ url: Type.String({ description: 'http(s) URL 或域名' }) }),
				async execute(_id, params: { url: string }) {
					const msg = await svc.navigate(params.url)
					return { details: undefined, content: [{ type: 'text', text: msg }] }
				}
			}),
			defineTool({
				name: 'browser_screenshot',
				label: '浏览器截图',
				description: '截取内嵌浏览器当前视口，返回 JPEG 图像。用于查看页面布局、验证操作结果。',
				promptSnippet: 'browser_screenshot() - 当前页面截图',
				promptGuidelines: G,
				parameters: Type.Object({}),
				async execute() {
					const shot = await svc.screenshot()
					return {
						details: undefined,
						content: [
							{ type: 'image', data: shot.data, mimeType: shot.mimeType },
							{ type: 'text', text: `截图 ${shot.width}x${shot.height}（${svc.view?.webContents.getURL()}）` }
						]
					}
				}
			}),
			defineTool({
				name: 'browser_click',
				label: '点击元素',
				description: '在内嵌浏览器中点击元素：优先用 CSS selector，否则用可见文本匹配。',
				promptSnippet: 'browser_click(selector?, text?) - 点击按钮/链接',
				promptGuidelines: G,
				parameters: Type.Object({
					selector: Type.Optional(Type.String()),
					text: Type.Optional(Type.String({ description: '元素可见文本，如「登录」' }))
				}),
				async execute(_id, params: { selector?: string; text?: string }) {
					const msg = await svc.click(params.selector, params.text)
					return { details: undefined, content: [{ type: 'text', text: msg }] }
				}
			}),
			defineTool({
				name: 'browser_type',
				label: '输入文本',
				description: '向指定输入框（CSS selector）输入文本，可选按回车提交。selector 省略时输入到当前焦点。',
				promptSnippet: 'browser_type(selector?, text, submit?) - 填表',
				promptGuidelines: G,
				parameters: Type.Object({
					selector: Type.Optional(Type.String()),
					text: Type.String(),
					submit: Type.Optional(Type.Boolean())
				}),
				async execute(_id, params: { selector?: string; text: string; submit?: boolean }) {
					const msg = await svc.typeText(params.selector, params.text, params.submit ?? false)
					return { details: undefined, content: [{ type: 'text', text: msg }] }
				}
			}),
			defineTool({
				name: 'browser_evaluate',
				label: '执行页面 JS',
				description: '在内嵌浏览器页面上下文执行 JavaScript 并返回结果（用于读取 DOM、调用页面 API）。',
				promptSnippet: 'browser_evaluate(code) - 页面内执行 JS',
				promptGuidelines: G,
				parameters: Type.Object({ code: Type.String() }),
				async execute(_id, params: { code: string }) {
					const out = await svc.evaluate(params.code)
					return { details: undefined, content: [{ type: 'text', text: out.slice(0, 8000) }] }
				}
			}),
			defineTool({
				name: 'browser_get_content',
				label: '读取页面文本',
				description: '获取内嵌浏览器当前页面的纯文本内容（innerText，截断到 6000 字符）。',
				promptSnippet: 'browser_get_content() - 页面文本',
				promptGuidelines: G,
				parameters: Type.Object({}),
				async execute() {
					const text = await svc.getContent()
					return { details: undefined, content: [{ type: 'text', text: text || '（页面为空）' }] }
				}
			})
		]
	}
}
