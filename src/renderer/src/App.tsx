import { useEffect, useState } from 'react'
import { useActiveTab, useSessionStore } from './store/session-store'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { SettingsDialog } from './components/SettingsDialog'

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function MainHeader() {
	const tab = useActiveTab()
	return (
		<div className="main-header">
			<span className="main-title">{tab ? (tab.busy ? 'pi 正在工作…' : 'pi') : 'Pi Desktop'}</span>
			{tab && tab.usage.turns > 0 && (
				<span className="main-stats">
					{tab.usage.turns} 轮 · {formatTokens(tab.usage.totalTokens)} tokens
					{tab.usage.totalCost > 0 && ` · $${tab.usage.totalCost.toFixed(4)}`}
				</span>
			)}
		</div>
	)
}

export function App() {
	const setReady = useSessionStore((s) => s.setReady)
	const setNotice = useSessionStore((s) => s.setNotice)
	const applyEvent = useSessionStore((s) => s.applyEvent)
	const [settingsOpen, setSettingsOpen] = useState(false)

	useEffect(() => {
		const off = window.piDesktop.onPiEvent((payload) => {
			applyEvent(payload.tabId, payload.event)
		})
		void (async () => {
			const info = await window.piDesktop.getAppInfo()
			console.log('[pi-desktop]', info)
			if (!info.nodeOk) {
				setNotice(`Electron 内置 Node ${info.node} 低于 pi SDK 要求的 22.19.0，需要切换到 RPC 模式。`)
			}
			const models = await window.piDesktop.listModels()
			useSessionStore.getState().setModels(models)
			if (models.length === 0) {
				setNotice('未发现可用模型。请在「设置 → 模型供应商」中配置 API Key。')
			}
			await useSessionStore.getState().loadWorkspaces()
			setReady(true)
		})()
		return off
	}, [applyEvent, setNotice, setReady])

	return (
		<div className="app-shell">
			<Sidebar onOpenSettings={() => setSettingsOpen(true)} />
			<div className="main-column">
				<TabBar />
				<MainHeader />
				<ChatView />
				<Composer />
			</div>
			{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
		</div>
	)
}
