import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import type { PiBridge } from './pi/bridge'
import type { SessionsService } from './pi/sessions-service'
import type { SettingsService } from './pi/settings-service'
import type {
	AppInfo,
	WireCustomProviderRequest,
	WireGeneralSettingsPatch,
	WireThinkingLevel
} from '../shared/types'

/** Active tab for the tabId-less commands (prompt/steer/abort/model/thinking/rename). */
let activeTab = 'main'

function nextTabId(): string {
	return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

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

export function registerIpc(
	getWindow: () => BrowserWindow | null,
	bridge: PiBridge,
	settings: SettingsService | null,
	sessions: SessionsService
): void {
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

	// ---- Tabs ----

	ipcMain.handle('tab:create', (_event, opts: { cwd: string; modelId?: string; activate?: boolean }) => {
		const tabId = nextTabId()
		if (opts.activate !== false) activeTab = tabId
		return bridge.createSession({ tabId, cwd: opts.cwd, modelId: opts.modelId })
	})

	ipcMain.handle(
		'tab:open',
		(_event, opts: { cwd: string; sessionPath: string; modelId?: string; activate?: boolean }) => {
			const tabId = nextTabId()
			if (opts.activate !== false) activeTab = tabId
			return bridge.openSession({ tabId, cwd: opts.cwd, sessionPath: opts.sessionPath, modelId: opts.modelId })
		}
	)

	ipcMain.handle('tab:close', (_event, tabId: string) => {
		if (activeTab === tabId) activeTab = 'main'
		return bridge.disposeSession(tabId)
	})

	ipcMain.handle('tab:activate', (_event, tabId: string) => {
		activeTab = tabId
	})

	ipcMain.handle('tab:rename', (_event, name: string) => {
		bridge.setSessionName(activeTab, name)
	})

	// ---- Agent commands (active tab) ----

	ipcMain.handle('pi:prompt', (_event, text: string) => {
		bridge.prompt(activeTab, text)
	})

	ipcMain.handle('pi:steer', (_event, text: string) => {
		bridge.steer(activeTab, text)
	})

	ipcMain.handle('pi:abort', () => {
		bridge.abort(activeTab)
	})

	ipcMain.handle('pi:setModel', (_event, modelId: string) => bridge.setModel(activeTab, modelId))

	ipcMain.handle('pi:setThinking', (_event, level: WireThinkingLevel) => bridge.setThinking(activeTab, level))

	// ---- Sessions & git ----

	ipcMain.handle('sessions:listWorkspaces', () => sessions.listWorkspaces())

	ipcMain.handle('sessions:refresh', (_event, cwd: string) => sessions.refreshWorkspaceSessions(cwd))

	ipcMain.handle('git:stats', (_event, cwd: string) => sessions.gitStats(cwd))

	// ---- Settings ----

	const requireSettings = (): SettingsService => {
		if (!settings) throw new Error('设置服务不可用（仅 SDK 模式支持）')
		return settings
	}

	ipcMain.handle('settings:listProviders', () => requireSettings().listProviders())

	ipcMain.handle('settings:setApiKey', (_event, providerId: string, apiKey: string) =>
		requireSettings().setProviderApiKey(providerId, apiKey)
	)

	ipcMain.handle('settings:logout', (_event, providerId: string) => requireSettings().logoutProvider(providerId))

	ipcMain.handle('settings:addCustomProvider', (_event, req: WireCustomProviderRequest) =>
		requireSettings().addCustomProvider(req)
	)

	ipcMain.handle('settings:removeCustomProvider', (_event, providerId: string) =>
		requireSettings().removeCustomProvider(providerId)
	)

	ipcMain.handle('settings:listSkills', (_event, cwd: string | null) => requireSettings().listSkills(cwd))

	ipcMain.handle('settings:listExtensions', (_event, cwd: string | null) => requireSettings().listExtensions(cwd))

	ipcMain.handle('settings:openDir', (_event, kind: 'skills' | 'extensions' | 'agent') =>
		requireSettings().openDir(kind)
	)

	ipcMain.handle('settings:getGeneral', (_event, cwd: string | null) => requireSettings().getGeneralSettings(cwd))

	ipcMain.handle('settings:setGeneral', (_event, cwd: string | null, patch: WireGeneralSettingsPatch) =>
		requireSettings().setGeneralSettings(cwd, patch)
	)
}
