import { createHighlighter, type Highlighter } from 'shiki'

const THEME = 'github-dark-default'

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
		themes: [THEME],
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
			theme: THEME
		})
	} catch {
		return null
	}
}
