import { useEffect, useMemo, useRef, useState } from 'react'
import { highlightCode } from '../lib/highlighter'

interface CodeBlockProps {
	code: string
	lang: string
}

/** Highlighted code block with language label and copy button. Debounced for streaming. */
export function CodeBlock({ code, lang }: CodeBlockProps) {
	const [html, setHtml] = useState<string | null>(null)
	const [debounced, setDebounced] = useState(code)
	const [copied, setCopied] = useState(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	// Re-highlight at most every 250ms while the block streams in.
	useEffect(() => {
		clearTimeout(timerRef.current)
		timerRef.current = setTimeout(() => setDebounced(code), 250)
		return () => clearTimeout(timerRef.current)
	}, [code])

	const cacheKey = useMemo(() => `${lang} ${debounced}`, [lang, debounced])
	useEffect(() => {
		let cancelled = false
		void highlightCode(debounced, lang).then((out) => {
			if (!cancelled && out) setHtml(out)
		})
		return () => {
			cancelled = true
		}
	}, [cacheKey, debounced, lang])

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			/* clipboard unavailable */
		}
	}

	return (
		<div className="codeblock">
			<div className="codeblock-bar">
				<span className="codeblock-lang">{lang}</span>
				<button type="button" className="codeblock-copy" onClick={() => void copy()}>
					{copied ? '已复制' : '复制'}
				</button>
			</div>
			{html ? (
				<div className="codeblock-body" dangerouslySetInnerHTML={{ __html: html }} />
			) : (
				<pre className="codeblock-plain">
					<code>{debounced}</code>
				</pre>
			)}
		</div>
	)
}
