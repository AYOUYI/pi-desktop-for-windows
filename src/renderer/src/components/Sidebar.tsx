import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/session-store'
import { isRecentlyModified, relativeTime } from '../lib/time'
import { getHiddenWorkspaces, hideWorkspace, onHiddenWorkspacesChanged } from '../lib/hidden-workspaces'

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
	const [hidden, setHidden] = useState<string[]>(() => getHiddenWorkspaces())
	const [menu, setMenu] = useState<{ cwd: string; x: number; y: number } | null>(null)

	useEffect(() => onHiddenWorkspacesChanged(() => setHidden(getHiddenWorkspaces())), [])

	useEffect(() => {
		if (!menu) return
		const close = (e: Event) => {
			// 点击菜单内部不关闭（否则 mousedown 会先卸载菜单导致 click 失效）
			if ((e.target as Element | null)?.closest?.('.ctx-menu')) return
			setMenu(null)
		}
		window.addEventListener('mousedown', close)
		window.addEventListener('blur', close)
		return () => {
			window.removeEventListener('mousedown', close)
			window.removeEventListener('blur', close)
		}
	}, [menu])

	const visibleWorkspaces = workspaces.filter((w) => !hidden.includes(w.cwd))

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
				{visibleWorkspaces.length === 0 && (
					<div className="sidebar-empty">还没有会话。打开一个工作区，或从磁盘中恢复 pi CLI 的历史会话。</div>
				)}
				{visibleWorkspaces.map((g) => {
					const isCollapsed = collapsed[g.cwd] ?? false
					return (
						<div key={g.cwd} className="ws-group">
							<div className="ws-header" onContextMenu={(e) => {
								e.preventDefault()
								setMenu({ cwd: g.cwd, x: e.clientX, y: e.clientY })
							}}>
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
									{(() => {
										// 分支树：fork 出的会话（parentSessionPath 指向组内会话）嵌套缩进展示
										const byPath = new Map(g.sessions.map((s) => [s.sessionPath, s]))
										const childrenOf = new Map<string, typeof g.sessions>()
										const roots: typeof g.sessions = []
										for (const s of g.sessions) {
											const parent = s.parentSessionPath ? byPath.get(s.parentSessionPath) : undefined
											if (parent) {
												const list = childrenOf.get(parent.sessionPath) ?? []
												list.push(s)
												childrenOf.set(parent.sessionPath, list)
											} else {
												roots.push(s)
											}
										}
										const rows: Array<{ s: (typeof g.sessions)[number]; depth: number }> = []
										const walk = (list: typeof g.sessions, depth: number) => {
											for (const s of list) {
												rows.push({ s, depth })
												walk(childrenOf.get(s.sessionPath) ?? [], depth + 1)
											}
										}
										walk(roots, 0)
										return rows.map(({ s, depth }) => {
											const tab = tabs.find((t) => t.sessionPath === s.sessionPath)
											const isActive = tab?.tabId === activeTabId
											return (
												<button
													key={s.sessionPath}
													type="button"
													className={isActive ? 'session-row active' : 'session-row'}
													style={depth > 0 ? { paddingLeft: 8 + depth * 14 } : undefined}
													onClick={() => onSessionClick(s.cwd, s.sessionPath)}
													title={s.cwd}
												>
													<span
														className={
															isRecentlyModified(s.modified) ? 'session-dot modified' : 'session-dot'
														}
													/>
													{depth > 0 && <span className="session-fork">⑂</span>}
													<span className="session-title">
														{sessionDisplayTitle(s.firstMessage, s.name)}
													</span>
													<span className="session-meta">{relativeTime(s.modified)}</span>
												</button>
											)
										})
									})()}
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

			{menu && (
				<div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
					<button
						type="button"
						className="ctx-item"
						onClick={() => {
							hideWorkspace(menu.cwd)
							setMenu(null)
						}}
					>
						从列表中移除该工作区
					</button>
					<div className="ctx-hint">仅隐藏显示，不删除任何文件或会话</div>
				</div>
			)}
		</aside>
	)
}
