/** 侧边栏隐藏的工作区（仅影响显示，不动任何文件/会话）。 */
const KEY = 'pi-desktop:hidden-workspaces'
const EVENT = 'pi-hidden-ws-changed'

export function getHiddenWorkspaces(): string[] {
	try {
		const raw = localStorage.getItem(KEY)
		const list = raw ? (JSON.parse(raw) as unknown) : []
		return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []
	} catch {
		return []
	}
}

export function setHiddenWorkspaces(list: string[]): void {
	localStorage.setItem(KEY, JSON.stringify(list))
	window.dispatchEvent(new CustomEvent(EVENT))
}

export function hideWorkspace(cwd: string): void {
	const list = getHiddenWorkspaces()
	if (!list.includes(cwd)) setHiddenWorkspaces([...list, cwd])
}

/** 订阅隐藏列表变化（返回取消函数）。 */
export function onHiddenWorkspacesChanged(cb: () => void): () => void {
	window.addEventListener(EVENT, cb)
	return () => window.removeEventListener(EVENT, cb)
}
