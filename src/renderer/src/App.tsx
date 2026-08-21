import { useEffect, useState } from 'react'
import { useActiveTab, useSessionStore } from './store/session-store'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { SettingsDialog } from './components/SettingsDialog'
import { BrowserPanel } from './components/BrowserPanel'

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function MainHeader() {
	const tab = useActiveTab()
	const forkActiveTab = useSessionStore((s) => s.forkActiveTab)
	const exportActiveHtml = useSessionStore((s) => s.exportActiveHtml)
	const browserOpen = useSessionStore((s) => s.browserOpen)
	const setBrowserOpen = useSessionStore((s) => s.setBrowserOpen)
	const update = useSessionStore((s) => s.update)
	return (
		<div className="main-header">
			<span className="main-title">{tab ? (tab.busy ? 'pi 正在工作…' : 'pi') : 'Pi Desktop'}</span>
			{tab && tab.usage.turns > 0 && (
				<span className="main-stats">
					{tab.usage.turns} 轮 · {formatTokens(tab.usage.totalTokens)} tokens
					{tab.usage.totalCost > 0 && ` · $${tab.usage.totalCost.toFixed(4)}`}
				</span>
			)}
			{update.status === 'ready' && (
				<button
					type="button"
					className="update-btn"
					title="下载完成，点击重启安装新版本"
					onClick={() => void window.piDesktop.installUpdate()}
				>
					↻ 重启更新 {update.version ? `v${update.version}` : ''}
				</button>
			)}
			{update.status === 'downloading' && (
				<span className="update-progress">更新下载中 {update.percent != null ? `${update.percent}%` : ''}</span>
			)}
			{tab && (
				<span className="header-actions">
					<button
						type="button"
						className={browserOpen ? 'header-btn active' : 'header-btn'}
						title="打开/关闭内嵌浏览器（agent 可用 browser_* 工具操作它）"
						onClick={() => void setBrowserOpen(!browserOpen)}
					>
						浏览器
					</button>
					<button
						type="button"
						className="header-btn"
						title="从当前对话末尾派生分支（复制历史到新会话）"
						disabled={tab.busy}
						onClick={() => void forkActiveTab()}
					>
						⑂ 派生
					</button>
					<button
						type="button"
						className="header-btn"
						title="导出当前会话为 HTML"
						disabled={tab.items.length === 0}
						onClick={() => void exportActiveHtml()}
					>
						导出 HTML
					</button>
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
	const browserOpen = useSessionStore((s) => s.browserOpen)

	// 原生浏览器视图层级高于页面 overlay：弹窗打开期间隐藏它
	useEffect(() => {
		void window.piDesktop.browserSetSuppressed(settingsOpen)
	}, [settingsOpen])

	// 全局订阅浏览器状态：agent 调 browser_* 自动打开面板时，
	// 渲染端必须感知（订阅不能放在 BrowserPanel 内——面板未挂载时收不到推送）
	useEffect(() => {
		const off = window.piDesktop.browserOnState((state) => {
			useSessionStore.getState().setBrowserState(state)
		})
		return off
	}, [])

	// 应用内更新事件流
	useEffect(() => {
		return window.piDesktop.onUpdateEvent((state) => {
			useSessionStore.getState().setUpdate(state)
		})
	}, [])

	// 窗口级拖放：图片拖到聊天区任意位置即可附加
	const [dragOver, setDragOver] = useState(false)

	// 兜底：拖放被取消（如按 Esc）时清除遮罩
	useEffect(() => {
		const clear = () => setDragOver(false)
		document.addEventListener('dragend', clear)
		return () => document.removeEventListener('dragend', clear)
	}, [])

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
		<>
			<div className="app-bg" />
			<div
				className="app-shell"
				onDragOver={(e) => {
					e.preventDefault()
					if (e.dataTransfer.types.includes('Files')) setDragOver(true)
				}}
				onDragLeave={(e) => {
					// relatedTarget 为 null 表示指针离开了窗口；从子元素移出时 target 是子元素，
					// 不能用 currentTarget === target 判断
					if (!e.relatedTarget) setDragOver(false)
				}}
				onDrop={(e) => {
					e.preventDefault()
					setDragOver(false)
					const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
					if (files.length > 0) void useSessionStore.getState().addImageFiles(files)
				}}
			>
				{dragOver && (
					<div className="drop-overlay">
						<div className="drop-box">🖼 松开以附加图片</div>
					</div>
				)}
				<Sidebar onOpenSettings={() => setSettingsOpen(true)} />
				<div className="main-column">
					<TabBar />
					<MainHeader />
					<div className="main-body">
						<div className="chat-column">
							<ChatView />
							<Composer />
						</div>
						{browserOpen && <BrowserPanel />}
					</div>
				</div>
				{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
			</div>
		</>
	)
}
