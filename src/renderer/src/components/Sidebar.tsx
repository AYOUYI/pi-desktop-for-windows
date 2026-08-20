import { useState } from 'react'
import { useSessionStore } from '../store/session-store'
import type { WireThinkingLevel } from '../../../shared/types'

const THINKING_LEVELS: { value: WireThinkingLevel; label: string }[] = [
	{ value: 'minimal', label: '思考：关' },
	{ value: 'low', label: '思考：低' },
	{ value: 'medium', label: '思考：中' },
	{ value: 'high', label: '思考：高' },
	{ value: 'xhigh', label: '思考：极高' },
	{ value: 'max', label: '思考：最大' }
]

export function Sidebar() {
	const cwd = useSessionStore((s) => s.cwd)
	const models = useSessionStore((s) => s.models)
	const modelId = useSessionStore((s) => s.modelId)
	const thinkingLevel = useSessionStore((s) => s.thinkingLevel)
	const notice = useSessionStore((s) => s.notice)
	const setModelId = useSessionStore((s) => s.setModelId)
	const setThinkingLevel = useSessionStore((s) => s.setThinkingLevel)
	const setSession = useSessionStore((s) => s.setSession)
	const [opening, setOpening] = useState(false)

	const openWorkspace = async () => {
		if (opening) return
		setOpening(true)
		try {
			const dir = await window.piDesktop.selectWorkspace()
			if (dir) {
				const info = await window.piDesktop.createSession({ cwd: dir, modelId: modelId ?? undefined })
				setSession(info)
			}
		} catch (err) {
			console.error('[pi-desktop] create session failed:', err)
			useSessionStore.getState().setNotice(`创建会话失败：${String(err)}`)
		} finally {
			setOpening(false)
		}
	}

	const changeModel = async (id: string) => {
		setModelId(id)
		if (cwd) {
			try {
				await window.piDesktop.setModel(id)
				useSessionStore.getState().setNotice(null)
			} catch (err) {
				useSessionStore.getState().setNotice(`切换模型失败：${String(err).replace(/^Error:\s*/, '')}`)
			}
		}
	}

	const changeThinking = async (level: WireThinkingLevel) => {
		setThinkingLevel(level)
		if (cwd) {
			try {
				await window.piDesktop.setThinking(level)
			} catch (err) {
				useSessionStore.getState().setNotice(`设置推理级别失败：${String(err).replace(/^Error:\s*/, '')}`)
			}
		}
	}

	return (
		<aside className="sidebar">
			<div className="sidebar-brand">
				<span className="sidebar-logo">π</span>
				<span>Pi Desktop</span>
			</div>

			<div className="sidebar-section">
				<div className="sidebar-label">工作区</div>
				<button type="button" className="workspace-btn" onClick={openWorkspace} disabled={opening}>
					{cwd ? `📂 ${cwd}` : opening ? '选择中…' : '打开工作区'}
				</button>
			</div>

			<div className="sidebar-section">
				<div className="sidebar-label">模型</div>
				<select
					className="select"
					value={modelId ?? ''}
					onChange={(e) => void changeModel(e.target.value)}
					disabled={models.length === 0}
				>
					{models.length === 0 && <option value="">（未发现可用模型）</option>}
					{models.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name} · {m.provider}
						</option>
					))}
				</select>
			</div>

			<div className="sidebar-section">
				<div className="sidebar-label">推理级别</div>
				<select
					className="select"
					value={thinkingLevel}
					onChange={(e) => void changeThinking(e.target.value as WireThinkingLevel)}
				>
					{THINKING_LEVELS.map((l) => (
						<option key={l.value} value={l.value}>
							{l.label}
						</option>
					))}
				</select>
			</div>

			{notice && <div className="sidebar-notice">{notice}</div>}

			<div className="sidebar-footer">与 pi CLI 共享 ~/.pi/agent 配置与会话</div>
		</aside>
	)
}
