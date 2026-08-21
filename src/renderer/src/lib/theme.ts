export interface ThemePrefs {
	theme: 'dark' | 'light'
	accent: AccentKey
	fontSize: number
	/** 背景图文件名（存于 userData/bg，经 pibg:// 协议加载）；null = 无背景 */
	bgName: string | null
	/** 背景毛玻璃模糊度 0-40px */
	bgBlur: number
}

export type AccentKey = 'purple' | 'blue' | 'green' | 'orange' | 'pink'

export const ACCENTS: Record<AccentKey, { base: string; hover: string; label: string }> = {
	purple: { base: '#7c6cf0', hover: '#8f81f5', label: '紫' },
	blue: { base: '#4f8ff7', hover: '#6ba2fa', label: '蓝' },
	green: { base: '#3fb37c', hover: '#55c490', label: '绿' },
	orange: { base: '#e0952f', hover: '#eaa64c', label: '橙' },
	pink: { base: '#e0639d', hover: '#e87cb0', label: '粉' }
}

const STORAGE_KEY = 'pi-desktop:theme'
const DEFAULTS: ThemePrefs = { theme: 'dark', accent: 'purple', fontSize: 14, bgName: null, bgBlur: 18 }

export function loadPrefs(): ThemePrefs {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULTS
		const parsed = JSON.parse(raw) as Partial<ThemePrefs>
		return {
			theme: parsed.theme === 'light' ? 'light' : 'dark',
			accent: parsed.accent && parsed.accent in ACCENTS ? (parsed.accent as AccentKey) : DEFAULTS.accent,
			fontSize:
				typeof parsed.fontSize === 'number' && parsed.fontSize >= 12 && parsed.fontSize <= 18
					? parsed.fontSize
					: DEFAULTS.fontSize,
			bgName: typeof parsed.bgName === 'string' ? parsed.bgName : null,
			bgBlur:
				typeof parsed.bgBlur === 'number' && parsed.bgBlur >= 0 && parsed.bgBlur <= 40
					? parsed.bgBlur
					: DEFAULTS.bgBlur
		}
	} catch {
		return DEFAULTS
	}
}

export function savePrefs(prefs: ThemePrefs): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function applyPrefs(prefs: ThemePrefs): void {
	const root = document.documentElement
	root.dataset.theme = prefs.theme
	const accent = ACCENTS[prefs.accent]
	root.style.setProperty('--accent', accent.base)
	root.style.setProperty('--accent-hover', accent.hover)
	root.style.setProperty('--base-font', `${prefs.fontSize}px`)
	root.style.setProperty('color-scheme', prefs.theme)
	root.dataset.bg = prefs.bgName ? 'on' : 'off'
	root.style.setProperty('--bg-image', prefs.bgName ? `url('pibg://local/${prefs.bgName}')` : 'none')
	root.style.setProperty('--bg-blur', `${prefs.bgBlur}px`)
	window.dispatchEvent(new CustomEvent('pi-theme-changed', { detail: prefs.theme }))
}
