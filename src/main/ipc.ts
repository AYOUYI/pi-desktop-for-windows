import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import type { PiBridge } from './pi/bridge'
import type { AppInfo, WireThinkingLevel } from '../shared/types'

/** The single M1 tab; multi-tab arrives in M3 and replaces this constant. */
const MAIN_TAB = 'main'

function compareNodeVersion(actual: string, required: [number, number, number]): boolean {
	const parts = actual.split('.').map((n) => parseInt(n, 10))
	for (let i = 0; i < required.length; i++) {
		const a = parts[i] ?? 0
		if (a !== required[i]) return a > required[i]
	}
	return true
}

export function appInfo(): AppInfo {
	// Hard requirement of the pi SDK's engine field (node >= 22.19.0).
	const nodeOk = compareNodeVersion(process.versions.node, [22, 19, 0])
	return {
		appVersion: app.getVersion(),
		electron: process.versions.electron,
		node: process.versions.node,
		chrome: process.versions.chrome,
		platform: process.platform,
		nodeOk
	}
}

export function registerIpc(getWindow: () => BrowserWindow | null, bridge: PiBridge): void {
	bridge.onEvent((tabId, event) => {
		getWindow()?.webContents.send('pi:event', { tabId, event })
	})

	ipcMain.handle('app:info', () => appInfo())

	ipcMain.handle('workspace:select', async () => {
		const win = getWindow()
		const result = await dialog.showOpenDialog(win!, {
			title: '选择工作区',
			properties: ['openDirectory', 'dontAddToRecent']
		})
		if (result.canceled || result.filePaths.length === 0) return null
		return result.filePaths[0]
	})

	ipcMain.handle('pi:listModels', () => bridge.listModels())

	ipcMain.handle('pi:createSession', (_event, opts: { cwd: string; modelId?: string; thinkingLevel?: WireThinkingLevel }) =>
		bridge.createSession({ tabId: MAIN_TAB, ...opts })
	)

	ipcMain.handle('pi:prompt', (_event, text: string) => {
		bridge.prompt(MAIN_TAB, text)
	})

	ipcMain.handle('pi:steer', (_event, text: string) => {
		bridge.steer(MAIN_TAB, text)
	})

	ipcMain.handle('pi:abort', () => {
		bridge.abort(MAIN_TAB)
	})

	ipcMain.handle('pi:setModel', (_event, modelId: string) => bridge.setModel(MAIN_TAB, modelId))

	ipcMain.handle('pi:setThinking', (_event, level: WireThinkingLevel) => bridge.setThinking(MAIN_TAB, level))
}
