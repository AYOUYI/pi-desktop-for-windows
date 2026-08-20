import { useState } from 'react'
import { useSessionStore } from '../store/session-store'
import { isRecentlyModified, relativeTime } from '../lib/time'

function sessionDisplayTitle(firstMessage: string, name: string | null): string {
	if (name) return name
	const t = firstMessage.trim().split('\n')[0]
	if (!t) return '（空会话）'
	return t.length > 24 ? `${t.slice(0, 24)}…` : t
}

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
	const workspaces = useSessionStore((s) => s.workspaces)
	const tabs = useSessionStore((s) => s.tabs)
	const activeTabId = useSessionStore((s) => s.activeTabId)
	const notice = useSessionStore((s) => s.notice)
	const createTab = useSessionStore((s) => s.createTab)
	const openSessionTab = useSessionStore((s) => s.openSessionTab)
	const activateTab = useSessionStore((s) => s.activateTab)
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
	const [opening, setOpening] = useState(false)

	const openWorkspace = async () => {
		if (opening) return
		setOpening(true)
		try {
			const dir = await window.piDesktop.selectWorkspace()
			if (dir) await createTab(dir)
		} finally {
			setOpening(false)
		}
	}

	const onSessionClick = (cwd: string, sessionPath: string) => {
		const tab = tabs.find((t) => t.sessionPath === sessionPath)
		if (tab) {
			activateTab(tab.tabId)
		} else {
			void openSessionTab(cwd, sessionPath)
		}
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-brand">
				<span className="sidebar-logo">π</span>
				<span>Pi Desktop</span>
			</div>

			<button type="button" className="workspace-btn" onClick={openWorkspace} disabled={opening}>
				{opening ? '选择中…' : '📂 打开工作区'}
			</button>

			<div className="sidebar-sessions">
				{workspaces.length === 0 && (
					<div className="sidebar-empty">还没有会话。打开一个工作区，或从磁盘中恢复 pi CLI 的历史会话。</div>
				)}
				{workspaces.map((g) => {
					const isCollapsed = collapsed[g.cwd] ?? false
					return (
						<div key={g.cwd} className="ws-group">
							<div className="ws-header">
								<button
									type="button"
									className="ws-toggle"
									onClick={() => setCollapsed((c) => ({ ...c, [g.cwd]: !isCollapsed }))}
								>
									<span className="ws-chevron">{isCollapsed ? '▸' : '▾'}</span>
									<span className="ws-label" title={g.cwd}>
										{g.label}
									</span>
								</button>
								<button
									type="button"
									className="ws-new"
									title="新建会话"
									onClick={() => void createTab(g.cwd)}
								>
									＋
								</button>
							</div>
							{!isCollapsed && (
								<div className="ws-sessions">
									{g.sessions.length === 0 && <div className="ws-empty">暂无会话</div>}
									{g.sessions.map((s) => {
										const tab = tabs.find((t) => t.sessionPath === s.sessionPath)
										const isActive = tab?.tabId === activeTabId
										return (
											<button
												key={s.sessionPath}
												type="button"
												className={isActive ? 'session-row active' : 'session-row'}
												onClick={() => onSessionClick(s.cwd, s.sessionPath)}
												title={s.cwd}
											>
												<span
													className={isRecentlyModified(s.modified) ? 'session-dot modified' : 'session-dot'}
												/>
												<span className="session-title">{sessionDisplayTitle(s.firstMessage, s.name)}</span>
												<span className="session-meta">{relativeTime(s.modified)}</span>
											</button>
										)
									})}
								</div>
							)}
						</div>
					)
				})}
			</div>

			{notice && <div className="sidebar-notice">{notice}</div>}

			<button type="button" className="settings-btn" onClick={onOpenSettings}>
				⚙ 设置
			</button>
		</aside>
	)
}
