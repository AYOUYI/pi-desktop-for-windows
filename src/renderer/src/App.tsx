import { useEffect } from 'react'
import { useSessionStore } from './store/session-store'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function HeaderStats() {
	const busy = useSessionStore((s) => s.busy)
	const usage = useSessionStore((s) => s.usage)
	return (
		<div className="main-header">
			<span className="main-title">{busy ? 'pi 正在工作…' : 'pi'}</span>
			{usage.turns > 0 && (
				<span className="main-stats">
					{usage.turns} 轮 · {formatTokens(usage.totalTokens)} tokens
					{usage.totalCost > 0 && ` · $${usage.totalCost.toFixed(4)}`}
				</span>
			)}
		</div>
	)
}

export function App() {
	const setReady = useSessionStore((s) => s.setReady)
	const setNotice = useSessionStore((s) => s.setNotice)
	const applyEvent = useSessionStore((s) => s.applyEvent)

	useEffect(() => {
		const off = window.piDesktop.onPiEvent((payload) => {
			applyEvent(payload.event)
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
				setNotice(
					'未发现可用模型。请先配置认证：运行 pi auth login，或设置环境变量（如 ANTHROPIC_API_KEY / OPENAI_API_KEY），或填写 ~/.pi/agent/auth.json。'
				)
			}
			setReady(true)
		})()
		return off
	}, [applyEvent, setNotice, setReady])

	return (
		<div className="app-shell">
			<Sidebar />
			<div className="main-column">
				<HeaderStats />
				<ChatView />
				<Composer />
			</div>
		</div>
	)
}
