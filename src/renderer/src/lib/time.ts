/** 相对时间：刚刚 / N秒前 / N分钟前 / N小时前 / N天前 / YYYY-MM-DD */
export function relativeTime(iso: string): string {
	const then = new Date(iso).getTime()
	if (Number.isNaN(then)) return ''
	const diff = Date.now() - then
	if (diff < 15_000) return '刚刚'
	if (diff < 60_000) return `${Math.floor(diff / 1000)}秒前`
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
	if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`
	const d = new Date(then)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 会话在最近 10 分钟内有活动（侧边栏"已修改"圆点） */
export function isRecentlyModified(iso: string): boolean {
	const then = new Date(iso).getTime()
	return !Number.isNaN(then) && Date.now() - then < 10 * 60_000
}
