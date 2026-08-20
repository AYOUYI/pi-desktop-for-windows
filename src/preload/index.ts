import { contextBridge, ipcRenderer } from 'electron'
import type {
	PiDesktopApi,
	WireCustomProviderRequest,
	WireGeneralSettingsPatch,
	WirePiEventPayload,
	WireSessionInfo,
	WireThinkingLevel
} from '../shared/types'

const api: PiDesktopApi = {
	getAppInfo: () => ipcRenderer.invoke('app:info'),
	selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
	listModels: () => ipcRenderer.invoke('pi:listModels'),
	createSession: (opts: { cwd: string; modelId?: string; thinkingLevel?: WireThinkingLevel }) =>
		ipcRenderer.invoke('pi:createSession', opts) as Promise<WireSessionInfo>,
	prompt: (text: string) => ipcRenderer.invoke('pi:prompt', text),
	steer: (text: string) => ipcRenderer.invoke('pi:steer', text),
	abort: () => ipcRenderer.invoke('pi:abort'),
	setModel: (modelId: string) => ipcRenderer.invoke('pi:setModel', modelId),
	setThinking: (level: WireThinkingLevel) => ipcRenderer.invoke('pi:setThinking', level),
	onPiEvent: (cb: (payload: WirePiEventPayload) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, payload: WirePiEventPayload) => cb(payload)
		ipcRenderer.on('pi:event', listener)
		return () => ipcRenderer.removeListener('pi:event', listener)
	},

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
