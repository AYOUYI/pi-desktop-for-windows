import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyPrefs, loadPrefs } from './lib/theme'
import { setShikiTheme } from './lib/highlighter'
import './app.css'

// Apply theme before first paint to avoid a flash of the wrong theme.
const initialPrefs = loadPrefs()
applyPrefs(initialPrefs)
setShikiTheme(initialPrefs.theme)

createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
)
