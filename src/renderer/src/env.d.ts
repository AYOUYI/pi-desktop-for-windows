import type { PiDesktopApi } from '../../shared/types'

declare global {
	interface Window {
		piDesktop: PiDesktopApi
	}
}

export {}
