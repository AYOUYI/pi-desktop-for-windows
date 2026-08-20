import { WebContentsView, type BrowserWindow } from 'electron'
import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

export interface WireBrowserTab {
	id: string
	title: string
	url: string
}

export interface BrowserState {
	open: boolean
	tabs: WireBrowserTab[]
	activeTabId: string | null
}

export type BrowserStateListener = (state: BrowserState) => void

interface TabEntry {
	id: string
	view: WebContentsView
	url: string
	title: string
}

let tabSeq = 0

/**
 * 内嵌浏览器：主窗口的 WebContentsView 子视图（原生表面，实时可见）。
 * 支持多标签页（等价于普通浏览器的多窗口）：每个标签独立 WebContents，
 * window.open / target=_blank 请求自动开新标签。
 * 由 agent 的 browser_* 工具与用户（地址栏/标签栏）共同驱动。
 */
export class BrowserService {
	private win: BrowserWindow | null = null
	private rect = { x: 0, y: 0, width: 0, height: 0 }
	private open = false
	/** 模态弹窗打开时压制原生视图（原生层在渲染页面之上，会遮挡 overlay） */
	private suppressed = false
	private tabs: TabEntry[] = []
	private activeId: string | null = null
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
			tabs: this.tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })),
			activeTabId: this.activeId
		}
		for (const l of this.listeners) l(state)
	}

	// ---------- 标签页 ----------

	private createTab(url?: string): TabEntry {
		if (!this.win) throw new Error('BrowserService is not attached to a window')
		const id = `btab-${++tabSeq}`
		const view = new WebContentsView({
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true
			}
		})
		view.setBackgroundColor('#141419')
		const entry: TabEntry = { id, view, url: '', title: '' }
		view.webContents.on('did-navigate', (_e, navUrl) => {
			entry.url = navUrl
			this.emit()
		})
		view.webContents.on('did-navigate-in-page', (_e, navUrl) => {
			entry.url = navUrl
			this.emit()
		})
		view.webContents.on('page-title-updated', (_e, title) => {
			entry.title = title
			this.emit()
		})
		// 新窗口请求 → 新标签页（等价普通浏览器的多窗口）
		view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
			this.newTab(newUrl)
			return { action: 'deny' }
		})
		this.win.contentView.addChildView(view)
		view.setBounds(this.rect)
		this.tabs.push(entry)
		this.activateTab(id)
		void view.webContents.loadURL(url ?? BrowserService.startPageUrl())
		return entry
	}

	newTab(url?: string): TabEntry {
		return this.createTab(url)
	}

	activateTab(id: string): void {
		if (!this.tabs.some((t) => t.id === id)) return
		this.activeId = id
		this.updateVisibility()
		this.emit()
	}

	closeTab(id: string): void {
		const idx = this.tabs.findIndex((t) => t.id === id)
		if (idx < 0) return
		const [entry] = this.tabs.splice(idx, 1)
		try {
			this.win?.contentView.removeChildView(entry.view)
			entry.view.webContents.close()
		} catch {
			/* view already gone */
		}
		if (this.tabs.length === 0) {
			// 始终保留一个标签页
			this.createTab()
			return
		}
		if (this.activeId === id) {
			this.activateTab(this.tabs[Math.max(0, idx - 1)].id)
		} else {
			this.emit()
		}
	}

	private active(): TabEntry {
		let entry = this.tabs.find((t) => t.id === this.activeId)
		if (!entry) {
			entry = this.tabs[0] ?? this.createTab()
			this.activeId = entry.id
		}
		return entry
	}

	// ---------- 面板可见性 ----------

	setOpen(open: boolean): void {
		this.open = open
		if (open && this.tabs.length === 0) this.createTab()
		this.updateVisibility()
		this.emit()
	}

	setSuppressed(suppressed: boolean): void {
		this.suppressed = suppressed
		this.updateVisibility()
	}

	private updateVisibility(): void {
		for (const t of this.tabs) {
			t.view.setVisible(this.open && !this.suppressed && t.id === this.activeId)
		}
	}

	/** 渲染端上报面板占位区域的窗口坐标，所有标签视图对齐覆盖。 */
	setRect(rect: { x: number; y: number; width: number; height: number }): void {
		this.rect = rect
		for (const t of this.tabs) t.view.setBounds(rect)
	}

	// ---------- 页面操作（作用于活动标签） ----------

	async navigate(url: string): Promise<string> {
		const entry = this.active()
		if (!this.open) this.setOpen(true)
		const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
		await entry.view.webContents.loadURL(target)
		entry.url = target
		this.emit()
		return `已打开 ${target}（${entry.view.webContents.getTitle()}）`
	}

	async screenshot(): Promise<{ data: string; mimeType: string; width: number; height: number }> {
		const entry = this.active()
		const image = await entry.view.webContents.capturePage()
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
		const entry = this.active()
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
		return (await entry.view.webContents.executeJavaScript(code)) as { x: number; y: number } | null
	}

	async click(selector?: string, text?: string): Promise<string> {
		const entry = this.active()
		const pos = await this.locate(selector, text)
		if (!pos) {
			return `未找到可点击元素（selector=${selector ?? '-'} text=${text ?? '-'}）。先用 browser_get_content 或 browser_screenshot 查看页面。`
		}
		const x = Math.round(pos.x)
		const y = Math.round(pos.y)
		entry.view.webContents.sendInputEvent({ type: 'mouseMove', x, y })
		entry.view.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
		entry.view.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
		await new Promise((r) => setTimeout(r, 300))
		return `已点击 (${x}, ${y})${text ? `「${text}」` : selector ? ` <${selector}>` : ''}`
	}

	async typeText(selector: string | undefined, text: string, submit: boolean): Promise<string> {
		const entry = this.active()
		if (selector) {
			const ok = await entry.view.webContents.executeJavaScript(
				`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return true; })()`
			)
			if (!ok) return `未找到输入框 <${selector}>`
		}
		entry.view.webContents.insertText(text)
		if (submit) {
			await new Promise((r) => setTimeout(r, 150))
			entry.view.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
			entry.view.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
		}
		return `已输入「${text.slice(0, 60)}」${submit ? '并提交' : ''}`
	}

	async evaluate(code: string): Promise<string> {
		const entry = this.active()
		const result = await entry.view.webContents.executeJavaScript(code)
		try {
			return typeof result === 'string' ? result : JSON.stringify(result)
		} catch {
			return String(result)
		}
	}

	async getContent(maxChars = 6000): Promise<string> {
		const entry = this.active()
		const text = (await entry.view.webContents.executeJavaScript(
			'document.body ? document.body.innerText : ""'
		)) as string
		return text.length > maxChars ? `${text.slice(0, maxChars)}\n…（截断，共 ${text.length} 字符）` : text
	}

	// ---------- agent 工具 ----------

	/** 注入系统提示 Guidelines：让模型理解内嵌浏览器的存在与使用方式 */
	private static readonly GUIDELINES = [
		'本应用内置用户实时可见的浏览器面板。打开网站、登录、扫码、填表、抓取页面等交互式网页任务，默认使用 browser_* 工具在内嵌浏览器中完成（用户能实时看到页面并配合扫码等交互）。',
		'只有用户明确要求使用某个 CLI/技能时才走 CLI 流程；CLI 缺失或失败时回退到内嵌浏览器。',
		'内嵌浏览器支持多标签页（等价普通浏览器的多窗口）：browser_new_tab 新开标签，window.open/新窗口请求自动开新标签；browser_* 操作作用于当前活动标签。',
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
				description: '在应用内嵌浏览器面板的活动标签页中打开 URL 并等待加载完成（用户实时可见）。',
				promptSnippet: 'browser_open(url) - 内嵌浏览器导航',
				promptGuidelines: G,
				parameters: Type.Object({ url: Type.String({ description: 'http(s) URL 或域名' }) }),
				async execute(_id, params: { url: string }) {
					const msg = await svc.navigate(params.url)
					return { details: undefined, content: [{ type: 'text', text: msg }] }
				}
			}),
			defineTool({
				name: 'browser_new_tab',
				label: '新建标签页',
				description: '在内嵌浏览器中新开一个标签页（可带 URL）并切换为活动标签。用于并行浏览多个页面。',
				promptSnippet: 'browser_new_tab(url?) - 新开标签页',
				promptGuidelines: G,
				parameters: Type.Object({ url: Type.Optional(Type.String()) }),
				async execute(_id, params: { url?: string }) {
					const tab = svc.newTab(params.url)
					return {
						details: undefined,
						content: [{ type: 'text', text: `已新开标签页（${params.url ?? '起始页'}），当前活动标签 ${tab.id}` }]
					}
				}
			}),
			defineTool({
				name: 'browser_list_tabs',
				label: '列出标签页',
				description: '列出内嵌浏览器所有标签页（id/标题/URL）及活动标签。',
				promptSnippet: 'browser_list_tabs() - 标签页列表',
				promptGuidelines: G,
				parameters: Type.Object({}),
				async execute() {
					const list = svc.tabs.map((t) => ({
						id: t.id,
						title: t.title || '(无标题)',
						url: t.url,
						active: t.id === svc.activeId
					}))
					return { details: undefined, content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] }
				}
			}),
			defineTool({
				name: 'browser_screenshot',
				label: '浏览器截图',
				description: '截取内嵌浏览器活动标签页当前视口，返回 JPEG 图像。用于查看页面布局、验证操作结果。',
				promptSnippet: 'browser_screenshot() - 当前页面截图',
				promptGuidelines: G,
				parameters: Type.Object({}),
				async execute() {
					const shot = await svc.screenshot()
					return {
						details: undefined,
						content: [
							{ type: 'image', data: shot.data, mimeType: shot.mimeType },
							{ type: 'text', text: `截图 ${shot.width}x${shot.height}（${svc.active().view.webContents.getURL()}）` }
						]
					}
				}
			}),
			defineTool({
				name: 'browser_click',
				label: '点击元素',
				description: '在内嵌浏览器活动标签页中点击元素：优先用 CSS selector，否则用可见文本匹配。',
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
				description: '向活动标签页指定输入框（CSS selector）输入文本，可选按回车提交。selector 省略时输入到当前焦点。',
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
				description: '在活动标签页页面上下文执行 JavaScript 并返回结果（用于读取 DOM、调用页面 API）。',
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
				description: '获取活动标签页当前页面的纯文本内容（innerText，截断到 6000 字符）。',
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
