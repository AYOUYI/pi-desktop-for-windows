import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SdkBridge } from './pi/sdk-bridge'
import { SettingsService } from './pi/settings-service'
import { registerIpc } from './ipc'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

let mainWindow: BrowserWindow | null = null
let bridge: SdkBridge | null = null

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 960,
		minHeight: 600,
		title: 'Pi Desktop',
		backgroundColor: '#1a1b23',
		show: false,
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			sandbox: true
		}
	})

	mainWindow.on('ready-to-show', () => {
		mainWindow?.show()
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
	bridge = new SdkBridge()
	await bridge.init()
	const settings = new SettingsService(bridge.getRuntime()!)
	registerIpc(() => mainWindow, bridge, settings)

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
				availableModels: models.length
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
}

app.whenReady().then(() => {
	void bootstrap().catch((err) => {
		console.error('[pi-desktop] bootstrap failed:', err)
		if (process.argv.includes('--smoke')) {
			console.error('[smoke]', JSON.stringify({ ok: false, error: String(err) }))
			app.exit(1)
		} else {
			app.exit(1)
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('before-quit', () => {
	void bridge?.dispose()
})
