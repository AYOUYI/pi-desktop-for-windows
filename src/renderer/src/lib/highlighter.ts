import { createHighlighter, type Highlighter } from 'shiki'

const DARK_THEME = 'github-dark-default'
const LIGHT_THEME = 'github-light-default'

let currentTheme: typeof DARK_THEME | typeof LIGHT_THEME = DARK_THEME

/** 跟随应用主题切换 shiki 高亮主题 */
export function setShikiTheme(mode: 'dark' | 'light'): void {
	currentTheme = mode === 'light' ? LIGHT_THEME : DARK_THEME
}

const LANGS = [
	'typescript',
	'tsx',
	'javascript',
	'jsx',
	'json',
	'bash',
	'shell',
	'python',
	'css',
	'html',
	'markdown',
	'yaml',
	'sql',
	'c',
	'cpp',
	'csharp',
	'go',
	'java',
	'rust',
	'php',
	'ruby',
	'xml',
	'ini',
	'toml',
	'diff'
] as const

let highlighterPromise: Promise<Highlighter> | null = null

/** Lazy singleton highlighter; loads grammars once on first code block. */
export function getHighlighter(): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({
		themes: [DARK_THEME, LIGHT_THEME],
		langs: [...LANGS]
	})
	return highlighterPromise
}

/** Returns highlighted HTML, or null while the highlighter is loading / for unknown langs. */
export async function highlightCode(code: string, lang: string): Promise<string | null> {
	try {
		const highlighter = await getHighlighter()
		return highlighter.codeToHtml(code, {
			lang: highlighter.getLoadedLanguages().includes(lang as never) ? lang : 'plaintext',
			theme: currentTheme
		})
	} catch {
		return null
	}
}
