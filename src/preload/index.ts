import { contextBridge, ipcRenderer } from 'electron'
import type {
	PiDesktopApi,
	WireAppBehavior,
	WireBrowserState,
	WireCustomProviderRequest,
	WireGeneralSettings,
	WireGeneralSettingsPatch,
	WireGitStats,
	WireImage,
	WirePiEventPayload,
	WireSessionInfo,
	WireSessionListItem,
	WireThinkingLevel,
	WireWorkspaceGroup
} from '../shared/types'

const api: PiDesktopApi = {
	getAppInfo: () => ipcRenderer.invoke('app:info'),
	selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
	listModels: () => ipcRenderer.invoke('pi:listModels'),
	prompt: (text: string, images?: WireImage[]) => ipcRenderer.invoke('pi:prompt', text, images),
	steer: (text: string) => ipcRenderer.invoke('pi:steer', text),
	abort: () => ipcRenderer.invoke('pi:abort'),
	setModel: (modelId: string) => ipcRenderer.invoke('pi:setModel', modelId),
	setThinking: (level: WireThinkingLevel) => ipcRenderer.invoke('pi:setThinking', level),
	onPiEvent: (cb: (payload: WirePiEventPayload) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: WirePiEventPayload) => cb(payload)
		ipcRenderer.on('pi:event', listener)
		return () => ipcRenderer.removeListener('pi:event', listener)
	},

	// ---- Tabs & sessions ----
	createTab: (opts: { cwd: string; modelId?: string; activate?: boolean }) =>
		ipcRenderer.invoke('tab:create', opts) as Promise<WireSessionInfo>,
	openSession: (opts: { cwd: string; sessionPath: string; modelId?: string; activate?: boolean }) =>
		ipcRenderer.invoke('tab:open', opts) as Promise<WireSessionInfo>,
	closeTab: (tabId: string) => ipcRenderer.invoke('tab:close', tabId),
	activateTab: (tabId: string) => ipcRenderer.invoke('tab:activate', tabId),
	renameSession: (name: string) => ipcRenderer.invoke('tab:rename', name),
	listWorkspaces: () => ipcRenderer.invoke('sessions:listWorkspaces') as Promise<WireWorkspaceGroup[]>,
	refreshWorkspaceSessions: (cwd: string) =>
		ipcRenderer.invoke('sessions:refresh', cwd) as Promise<WireSessionListItem[]>,
	gitStats: (cwd: string) => ipcRenderer.invoke('git:stats', cwd) as Promise<WireGitStats | null>,
	forkActiveSession: () => ipcRenderer.invoke('session:fork') as Promise<WireSessionInfo>,
	exportActiveSessionHtml: () => ipcRenderer.invoke('session:exportHtml') as Promise<string | null>,
	browserSetOpen: (open: boolean) => ipcRenderer.invoke('browser:setOpen', open),
	browserSetSuppressed: (suppressed: boolean) => ipcRenderer.invoke('browser:setSuppressed', suppressed),
	browserSetRect: (rect: { x: number; y: number; width: number; height: number }) =>
		ipcRenderer.invoke('browser:setRect', rect),
	browserNavigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
	browserNewTab: (url?: string) => ipcRenderer.invoke('browser:newTab', url),
	browserActivateTab: (id: string) => ipcRenderer.invoke('browser:activateTab', id),
	browserCloseTab: (id: string) => ipcRenderer.invoke('browser:closeTab', id),
	browserOnState: (cb: (state: WireBrowserState) => void) => {
		const listener = (_e: Electron.IpcRendererEvent, state: WireBrowserState) => cb(state)
		ipcRenderer.on('browser:state', listener)
		return () => ipcRenderer.removeListener('browser:state', listener)
	},
	getAppBehavior: () => ipcRenderer.invoke('app:getBehavior') as Promise<WireAppBehavior>,
	themePickBackground: () => ipcRenderer.invoke('theme:pickBackground') as Promise<{ name: string } | null>,
	themeClearBackground: () => ipcRenderer.invoke('theme:clearBackground'),
	setAppBehavior: (patch: Partial<WireAppBehavior>) =>
		ipcRenderer.invoke('app:setBehavior', patch) as Promise<WireAppBehavior>,

	// ---- Settings ----
	listProviders: () => ipcRenderer.invoke('settings:listProviders'),
	setProviderApiKey: (providerId: string, apiKey: string) =>
		ipcRenderer.invoke('settings:setApiKey', providerId, apiKey),
	logoutProvider: (providerId: string) => ipcRenderer.invoke('settings:logout', providerId),
	addCustomProvider: (req: WireCustomProviderRequest) => ipcRenderer.invoke('settings:addCustomProvider', req),
	removeCustomProvider: (providerId: string) => ipcRenderer.invoke('settings:removeCustomProvider', providerId),
	listSkills: (cwd: string | null) => ipcRenderer.invoke('settings:listSkills', cwd),
	listExtensions: (cwd: string | null) => ipcRenderer.invoke('settings:listExtensions', cwd),
	openSettingsDir: (kind: 'skills' | 'extensions' | 'agent') => ipcRenderer.invoke('settings:openDir', kind),
	getGeneralSettings: (cwd: string | null) => ipcRenderer.invoke('settings:getGeneral', cwd),
	setGeneralSettings: (cwd: string | null, patch: WireGeneralSettingsPatch) =>
		ipcRenderer.invoke('settings:setGeneral', cwd, patch)
}

contextBridge.exposeInMainWorld('piDesktop', api)
