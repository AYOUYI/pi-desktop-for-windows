import { useMemo } from 'react'
import { parseDiff, Diff, Hunk as DiffHunk } from 'react-diff-view'
import 'react-diff-view/style/index.css'

interface DiffViewProps {
	/** Unified patch text (e.g. EditToolDetails.patch or synthesized for write). */
	patch: string
}

const MAX_DIFF_LINES = 800

function countChanges(patch: string): { added: number; removed: number } {
	let added = 0
	let removed = 0
	for (const line of patch.split('\n')) {
		if (line.startsWith('+++') || line.startsWith('---')) continue
		if (line.startsWith('+')) added++
		else if (line.startsWith('-')) removed++
	}
	return { added, removed }
}

/** Unified-diff renderer for edit/write tool results. */
export function DiffView({ patch }: DiffViewProps) {
	const files = useMemo(() => {
		try {
			return parseDiff(patch)
		} catch {
			return []
		}
	}, [patch])

	const stats = useMemo(() => countChanges(patch), [patch])
	const totalLines = patch.split('\n').length

	if (files.length === 0) {
		return (
			<pre className="diff-fallback">{patch}</pre>
		)
	}

	if (totalLines > MAX_DIFF_LINES) {
		return (
			<div className="diff-fallback">
				diff 共 {totalLines} 行，超过 {MAX_DIFF_LINES} 行已折叠（+{stats.added} / -{stats.removed}）。
			</div>
		)
	}

	return (
		<div className="diff-view">
			<div className="diff-stats">
				<span className="diff-added">+{stats.added}</span>
				<span className="diff-removed">-{stats.removed}</span>
			</div>
			{files.map((file, i) => (
				<Diff key={`${file.oldPath}→${file.newPath}:${i}`} viewType="unified" diffType={file.type} hunks={file.hunks}>
					{(hunks) => hunks.map((hunk) => <DiffHunk key={hunk.content} hunk={hunk} />)}
				</Diff>
			))}
		</div>
	)
}
