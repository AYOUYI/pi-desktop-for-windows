import { contextBridge, ipcRenderer } from 'electron'
import type { PiDesktopApi, WirePiEventPayload, WireSessionInfo, WireThinkingLevel } from '../shared/types'

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
	}
}

contextBridge.exposeInMainWorld('piDesktop', api)
