import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SdkBridge } from './pi/sdk-bridge'
import { SettingsService } from './pi/settings-service'
import { SessionsService } from './pi/sessions-service'
import { BrowserService } from './pi/browser-service'
import { registerIpc } from './ipc'
import type { WireAppBehavior } from '../shared/types'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let mainWindow: BrowserWindow | null = null
let bridge: SdkBridge | null = null
let tray: Tray | null = null
let quitting = false
let browser: BrowserService | null = null

// ---------- 应用行为设置（Electron userData，与 pi 配置分离） ----------

function behaviorPath(): string {
	return join(app.getPath('userData'), 'app-settings.json')
}

function loadBehavior(): WireAppBehavior {
	try {
		const parsed = JSON.parse(readFileSync(behaviorPath(), 'utf-8')) as Partial<WireAppBehavior>
		return { closeToTray: parsed.closeToTray === true }
	} catch {
		return { closeToTray: false }
	}
}

function saveBehavior(behavior: WireAppBehavior): void {
	writeFileSync(behaviorPath(), JSON.stringify(behavior, null, '\t'))
}

function trayIconPath(): string | null {
	for (const p of [join(__dirname, '../../build/icon.png'), join(process.resourcesPath ?? '', 'icon.png')]) {
		if (p && existsSync(p)) return p
	}
	return null
}

function showWindow(): void {
	if (!mainWindow) {
		createWindow()
		return
	}
	if (mainWindow.isMinimized()) mainWindow.restore()
	mainWindow.show()
	mainWindow.focus()
}

function createTray(): void {
	const iconPath = trayIconPath()
	if (!iconPath) {
		console.warn('[pi-desktop] tray icon not found, skipping tray')
		return
	}
	const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
	tray = new Tray(icon)
	tray.setToolTip('Pi Desktop')
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: '显示窗口', click: () => showWindow() },
			{ type: 'separator' },
			{
				label: '退出',
				click: () => {
					quitting = true
					app.quit()
				}
			}
		])
	)
	tray.on('click', () => showWindow())
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 960,
		minHeight: 600,
		title: 'Pi Desktop',
		backgroundColor: '#141419',
		show: false,
		icon: trayIconPath() ?? undefined,
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			sandbox: true
		}
	})

	mainWindow.on('ready-to-show', () => {
		mainWindow?.show()
	})

	// 关闭到托盘（可在 设置 → 界面 关闭）
	mainWindow.on('close', (e) => {
		if (loadBehavior().closeToTray && !quitting) {
			e.preventDefault()
			mainWindow?.hide()
		}
	})

	// Open target=_blank links in the system browser, not in-app.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url)
		return { action: 'deny' }
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})

	if (process.env.ELECTRON_RENDERER_URL) {
		void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
	}
}

async function bootstrap(): Promise<void> {
	const isSmoke = process.argv.includes('--smoke')
	browser = new BrowserService()
	bridge = new SdkBridge(browser)
	await bridge.init()
	const settings = new SettingsService(bridge.getRuntime()!)
	registerIpc(() => mainWindow, bridge, settings, new SessionsService())

	ipcMain.handle('app:getBehavior', () => loadBehavior())
	ipcMain.handle('app:setBehavior', (_event, patch: Partial<WireAppBehavior>) => {
		const next = { ...loadBehavior(), ...patch }
		saveBehavior(next)
		return next
	})

	// ---- 内嵌浏览器 ----
	ipcMain.handle('browser:setOpen', (_event, open: boolean) => {
		browser?.setOpen(open)
	})
	ipcMain.handle('browser:setRect', (_event, rect: { x: number; y: number; width: number; height: number }) => {
		browser?.setRect(rect)
	})
	ipcMain.handle('browser:navigate', (_event, url: string) => browser?.navigate(url))

	if (isSmoke) {
		// Headless verification: proves the ESM main bundle loads, the pi SDK
		// imports inside Electron's Node, and ModelRuntime initializes.
		const models = await bridge.listModels()
		console.log(
			'[smoke]',
			JSON.stringify({
				ok: true,
				electron: process.versions.electron,
				node: process.versions.node,
				availableModels: models.length,
				modelIds: models.slice(0, 3).map((m) => m.id)
			})
		)
		app.exit(0)
		return
	}

	if (process.argv.includes('--smoke-settings')) {
		const providers = await settings.listProviders()
		const skills = settings.listSkills(null)
		const extensions = await settings.listExtensions(null)
		const general = await settings.getGeneralSettings(null)
		console.log(
			'[smoke-settings]',
			JSON.stringify({
				ok: true,
				providers: providers.length,
				configured: providers.filter((p) => p.configured).map((p) => p.id),
				skills: skills.length,
				extensions: extensions.length,
				general
			})
		)
		app.exit(0)
		return
	}

	if (process.argv.includes('--smoke-resume')) {
		const svc = new SessionsService()
		const groups = await svc.listWorkspaces()
		const newest = groups[0]?.sessions[0]
		if (!newest) {
			console.log('[smoke-resume]', JSON.stringify({ ok: false, reason: 'no sessions on disk' }))
			app.exit(1)
			return
		}
		const info = await bridge.openSession({ tabId: 'smoke', cwd: newest.cwd, sessionPath: newest.sessionPath })
		console.log(
			'[smoke-resume]',
			JSON.stringify({
				ok: true,
				workspaces: groups.length,
				cwd: newest.cwd,
				name: info.name,
				modelId: info.modelId,
				thinkingLevel: info.thinkingLevel,
				replayedItems: info.initialItems?.length ?? 0
			})
		)
		app.exit(0)
		return
	}

	if (process.argv.includes('--smoke-chat')) {
		// Full-pipeline verification: SdkBridge session + prompt + serialized events.
		const os = await import('node:os')
		const { mkdtemp } = await import('node:fs/promises')
		const cwd = await mkdtemp(join(os.tmpdir(), 'pi-desktop-smoke-'))
		await bridge.createSession({ tabId: 'main', cwd })
		let assistantText = ''
		let settled = false
		bridge.onEvent((_tabId, event) => {
			if (event.type === 'message_update') {
				const ev = event as unknown as { assistantMessageEvent?: { type?: string; delta?: string } }
				if (ev.assistantMessageEvent?.type === 'text_delta') {
					assistantText += ev.assistantMessageEvent.delta ?? ''
				}
			} else if (event.type === 'agent_settled') {
				settled = true
			}
		})
		bridge.prompt('main', '请只回复两个字母：ok')
		const deadline = Date.now() + 120_000
		while (!settled && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 200))
		}
		console.log(
			'[smoke-chat]',
			JSON.stringify({ ok: settled, streamedChars: assistantText.length, reply: assistantText.slice(0, 80) })
		)
		app.exit(settled ? 0 : 1)
		return
	}

	createWindow()
	browser?.attach(mainWindow!)
	createTray()

	// 自动更新：仅在打包后且显式配置更新源时启用（generic provider）。
	if (app.isPackaged && process.env.PIDESKTOP_UPDATE_URL) {
		try {
			const { autoUpdater } = await import('electron-updater')
			autoUpdater.setFeedURL({ provider: 'generic', url: process.env.PIDESKTOP_UPDATE_URL })
			autoUpdater.logger = console
			void autoUpdater.checkForUpdates()
		} catch (err) {
			console.warn('[pi-desktop] auto-update disabled:', err)
		}
	}
}

app.whenReady().then(() => {
	void bootstrap().catch((err) => {
		console.error('[pi-desktop] bootstrap failed:', err)
		if (process.argv.includes('--smoke') || process.argv.includes('--smoke-chat')) {
			console.error('[smoke]', JSON.stringify({ ok: false, error: String(err) }))
		}
		app.exit(1)
	})
})

app.on('window-all-closed', () => {
	// 托盘常驻时不退出；无托盘（图标缺失）时按平台惯例退出。
	if (tray && loadBehavior().closeToTray) return
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('before-quit', () => {
	quitting = true
	void bridge?.dispose()
})
