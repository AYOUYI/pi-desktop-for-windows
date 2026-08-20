import { useSessionStore, getTabTitle } from '../store/session-store'

export function TabBar() {
	const tabs = useSessionStore((s) => s.tabs)
	const activeTabId = useSessionStore((s) => s.activeTabId)
	const workspaces = useSessionStore((s) => s.workspaces)
	const activateTab = useSessionStore((s) => s.activateTab)
	const closeTab = useSessionStore((s) => s.closeTab)
	const createTab = useSessionStore((s) => s.createTab)

	const activeCwd = tabs.find((t) => t.tabId === activeTabId)?.cwd

	const newTab = async () => {
		const cwd = activeCwd ?? workspaces[0]?.cwd
		if (cwd) {
			await createTab(cwd)
		} else {
			const dir = await window.piDesktop.selectWorkspace()
			if (dir) await createTab(dir)
		}
	}

	return (
		<div className="tabbar">
			<div className="tabbar-list">
				{tabs.map((t) => (
					<button
						key={t.tabId}
						type="button"
						className={t.tabId === activeTabId ? 'tab active' : 'tab'}
						onClick={() => activateTab(t.tabId)}
						title={t.cwd}
					>
						{t.busy && <span className="tab-busy" />}
						<span className="tab-title">{getTabTitle(t)}</span>
						<span
							className="tab-close"
							onClick={(e) => {
								e.stopPropagation()
								void closeTab(t.tabId)
							}}
						>
							✕
						</span>
					</button>
				))}
			</div>
			<button type="button" className="tab-new" title="新建会话" onClick={() => void newTab()}>
				＋
			</button>
		</div>
	)
}
