import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import type { WireGitStats, WireSessionListItem, WireWorkspaceGroup } from '../../shared/types'

function toListItem(s: {
	path: string
	id: string
	cwd: string
	name?: string
	parentSessionPath?: string
	created: Date
	modified: Date
	messageCount: number
	firstMessage: string
}): WireSessionListItem {
	return {
		sessionPath: s.path,
		id: s.id,
		cwd: s.cwd,
		name: s.name ?? null,
		parentSessionPath: s.parentSessionPath ?? null,
		created: s.created.toISOString(),
		modified: s.modified.toISOString(),
		messageCount: s.messageCount,
		firstMessage: s.firstMessage
	}
}

/** Sidebar data: session listing across workspaces + git change stats. */
export class SessionsService {
	async listWorkspaces(): Promise<WireWorkspaceGroup[]> {
		const sessions = await SessionManager.listAll()
		const byCwd = new Map<string, WireSessionListItem[]>()
		for (const s of sessions) {
			const cwd = s.cwd || '(未知目录)'
			const list = byCwd.get(cwd) ?? []
			list.push(toListItem(s))
			byCwd.set(cwd, list)
		}
		// 最新会话在前；工作区按其最新会话排序
		const groups: WireWorkspaceGroup[] = [...byCwd.entries()].map(([cwd, list]) => ({
			cwd,
			label: basename(cwd) || cwd,
			sessions: list.sort((a, b) => b.modified.localeCompare(a.modified))
		}))
		groups.sort((a, b) => {
			const am = a.sessions[0]?.modified ?? ''
			const bm = b.sessions[0]?.modified ?? ''
			return bm.localeCompare(am)
		})
		return groups
	}

	async refreshWorkspaceSessions(cwd: string): Promise<WireSessionListItem[]> {
		const sessions = await SessionManager.list(cwd)
		return sessions.map(toListItem).sort((a, b) => b.modified.localeCompare(a.modified))
	}

	/** git 变更统计（非 git 仓库返回 null） */
	gitStats(cwd: string): Promise<WireGitStats | null> {
		return new Promise((resolve) => {
			execFile(
				'git',
				['status', '--porcelain'],
				{ cwd, windowsHide: true, timeout: 5000 },
				(err, stdout) => {
					if (err) {
						resolve(null)
						return
					}
					const changedFiles = stdout
						.split('\n')
						.map((l) => l.trim())
						.filter((l) => l.length > 0).length
					execFile(
						'git',
						['diff', '--shortstat', 'HEAD'],
						{ cwd, windowsHide: true, timeout: 5000 },
						(err2, diffOut) => {
							let insertions = 0
							let deletions = 0
							if (!err2 && diffOut) {
								const ins = /(\d+) insertions?\(\+\)/.exec(diffOut)
								const del = /(\d+) deletions?\(-\)/.exec(diffOut)
								insertions = ins ? Number(ins[1]) : 0
								deletions = del ? Number(del[1]) : 0
							}
							resolve({ changedFiles, insertions, deletions })
						}
					)
				}
			)
		})
	}
}
