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
	private listeners: BrowserStateListener[] = []

	attach(win: BrowserWindow): void {
		this.win = win
	}

	onState(listener: BrowserStateListener): void {
		this.listeners.push(listener)
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
		this.win.contentView.addChildView(view)
		view.setBounds(this.rect)
		view.setVisible(this.open)
		this.view = view
		return view
	}

	setOpen(open: boolean): void {
		this.open = open
		const view = this.ensureView()
		view.setVisible(open)
		if (open && !view.webContents.getURL()) {
			void view.webContents.loadURL('about:blank').then(() => this.emit())
		}
		this.emit()
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

	tools(): ToolDefinition[] {
		const svc = this
		return [
			defineTool({
				name: 'browser_open',
				label: '打开网页',
				description: '在内嵌浏览器中打开 URL 并等待加载完成。',
				promptSnippet: 'browser_open(url) - 内嵌浏览器导航',
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
				parameters: Type.Object({}),
				async execute() {
					const text = await svc.getContent()
					return { details: undefined, content: [{ type: 'text', text: text || '（页面为空）' }] }
				}
			})
		]
	}
}
