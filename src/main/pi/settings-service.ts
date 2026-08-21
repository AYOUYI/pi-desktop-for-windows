import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import stripJsonComments from 'strip-json-comments'
import { SettingsManager, getAgentDir, loadSkills, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { AuthInteraction } from '@earendil-works/pi-ai'
import type {
	WireCustomProviderRequest,
	WireExtensionInfo,
	WireGeneralSettings,
	WireGeneralSettingsPatch,
	WireProviderStatus,
	WireSkillInfo
} from '../../shared/types'

interface ModelsJsonShape {
	providers: Record<string, Record<string, unknown>>
}

/**
 * Read/write pi's user-facing configuration (~/.pi/agent/*) for the settings UI.
 * All writes go through pi's own ModelRuntime/SettingsManager APIs where possible
 * so the running session hot-reloads changes exactly like the CLI does.
 */
export class SettingsService {
	constructor(private readonly runtime: ModelRuntime) {}

	private get agentDir(): string {
		return getAgentDir()
	}

	private get modelsJsonPath(): string {
		return join(this.agentDir, 'models.json')
	}

	// ---------- Providers ----------

	async listProviders(): Promise<WireProviderStatus[]> {
		const models = this.runtime.getModels()
		const byProvider = new Map<string, number>()
		for (const m of models) {
			const id = String(m.provider)
			byProvider.set(id, (byProvider.get(id) ?? 0) + 1)
		}
		const custom = await this.readCustomProviderIds()
		const statuses = [...byProvider.entries()].map(([id, modelCount]) => {
			const status = this.runtime.getProviderAuthStatus(id)
			return {
				id,
				name: id,
				configured: status?.configured ?? false,
				source: status?.source,
				label: status?.label,
				modelCount,
				custom: custom.has(id)
			}
		})
		statuses.sort((a, b) => {
			if (a.configured !== b.configured) return a.configured ? -1 : 1
			return a.id.localeCompare(b.id)
		})
		return statuses
	}

	async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
		const interaction: AuthInteraction = {
			prompt: async () => apiKey,
			notify: () => {}
		}
		await this.runtime.login(providerId, 'api_key', interaction)
	}

	async logoutProvider(providerId: string): Promise<void> {
		await this.runtime.logout(providerId)
	}

	private async readModelsJson(): Promise<ModelsJsonShape> {
		try {
			const raw = await readFile(this.modelsJsonPath, 'utf-8')
			const parsed = JSON.parse(stripJsonComments(raw)) as ModelsJsonShape
			return parsed && typeof parsed === 'object' && parsed.providers ? parsed : { providers: {} }
		} catch {
			return { providers: {} }
		}
	}

	private async writeModelsJson(data: ModelsJsonShape): Promise<void> {
		await mkdir(this.agentDir, { recursive: true })
		await writeFile(this.modelsJsonPath, `${JSON.stringify(data, null, '\t')}\n`, 'utf-8')
	}

	private async readCustomProviderIds(): Promise<Set<string>> {
		const data = await this.readModelsJson()
		return new Set(Object.keys(data.providers))
	}

	async addCustomProvider(req: WireCustomProviderRequest): Promise<void> {
		if (!req.providerId || !/^[a-z0-9][a-z0-9-]*$/i.test(req.providerId)) {
			throw new Error('供应商 ID 只能包含字母、数字和连字符')
		}
		if (!req.baseUrl) throw new Error('Base URL 不能为空')
		if (req.models.length === 0) throw new Error('至少需要添加一个模型')

		const data = await this.readModelsJson()
		if (data.providers[req.providerId]) {
			throw new Error(`供应商 ${req.providerId} 已存在于 models.json`)
		}
		data.providers[req.providerId] = {
			name: req.name || req.providerId,
			baseUrl: req.baseUrl,
			api: req.api || 'openai-completions',
			...(req.apiKey ? { apiKey: req.apiKey } : {}),
			models: req.models.map((m) => ({
				id: m.id,
				name: m.name || m.id,
				reasoning: false,
				input: ['text'],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192
			}))
		}
		await this.writeModelsJson(data)
		await this.runtime.refresh()
	}

	async removeCustomProvider(providerId: string): Promise<void> {
		const data = await this.readModelsJson()
		if (!data.providers[providerId]) {
			throw new Error(`供应商 ${providerId} 不在 models.json 中`)
		}
		delete data.providers[providerId]
		await this.writeModelsJson(data)
		await this.runtime.refresh()
	}

	// ---------- Skills ----------

	listSkills(cwd: string | null): WireSkillInfo[] {
		// 同时列出 ~/.agents/skills（跨工具标准目录，agent 常装到这里）
		const agentsDir = join(homedir(), '.agents', 'skills')
		const extra = existsSync(agentsDir) ? [agentsDir] : []
		const result = loadSkills({
			cwd: cwd ?? homedir(),
			agentDir: this.agentDir,
			skillPaths: extra,
			includeDefaults: true
		})
		return result.skills.map((s) => ({
			name: s.name,
			description: s.description,
			filePath: s.filePath,
			source: s.sourceInfo?.source ?? 'user',
			disableModelInvocation: s.disableModelInvocation
		}))
	}

	// ---------- Extensions (lightweight directory scan; never executes code) ----------

	async listExtensions(cwd: string | null): Promise<WireExtensionInfo[]> {
		const out: WireExtensionInfo[] = []
		const roots: Array<{ dir: string; source: 'user' | 'project' }> = [
			{ dir: join(this.agentDir, 'extensions'), source: 'user' },
			...(cwd ? [{ dir: join(cwd, '.pi', 'extensions'), source: 'project' as const }] : [])
		]
		for (const root of roots) {
			if (!existsSync(root.dir)) continue
			let entries: Dirent[]
			try {
				entries = await readdir(root.dir, { withFileTypes: true })
			} catch {
				continue
			}
			for (const entry of entries) {
				if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
				if (entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name)) {
					out.push({ filePath: join(root.dir, entry.name), source: root.source, kind: 'file' })
				} else if (entry.isDirectory()) {
					const hasIndex = ['index.ts', 'index.js'].some((f) => existsSync(join(root.dir, entry.name, f)))
					const hasManifest = existsSync(join(root.dir, entry.name, 'package.json'))
					if (hasIndex || hasManifest) {
						out.push({ filePath: join(root.dir, entry.name), source: root.source, kind: 'package' })
					}
				}
			}
		}
		return out
	}

	async openDir(kind: 'skills' | 'extensions' | 'agent'): Promise<void> {
		const { shell } = await import('electron')
		const dir =
			kind === 'agent' ? this.agentDir : join(this.agentDir, kind === 'skills' ? 'skills' : 'extensions')
		await mkdir(dir, { recursive: true })
		await shell.openPath(dir)
	}

	// ---------- General settings ----------

	private async settingsManager(cwd: string | null): Promise<SettingsManager> {
		return SettingsManager.create(cwd ?? homedir(), this.agentDir)
	}

	async getGeneralSettings(cwd: string | null): Promise<WireGeneralSettings> {
		const manager = await this.settingsManager(cwd)
		const settings = manager.getGlobalSettings()
		const thinking = settings.defaultThinkingLevel
		const validLevels = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
		return {
			defaultModel: settings.defaultModel ?? null,
			defaultThinkingLevel: thinking && validLevels.includes(thinking) ? (thinking as WireGeneralSettings['defaultThinkingLevel']) : null,
			shellPath: settings.shellPath ?? null
		}
	}

	async setGeneralSettings(cwd: string | null, patch: WireGeneralSettingsPatch): Promise<void> {
		const manager = await this.settingsManager(cwd)
		if (patch.defaultModel) {
			// pi 的 settings.defaultModel 存裸 ID；UI 传的是 "provider/model" 限定格式
			const slash = patch.defaultModel.indexOf('/')
			const rawId = slash >= 0 ? patch.defaultModel.slice(slash + 1) : patch.defaultModel
			manager.setDefaultModel(rawId)
		}
		if (patch.defaultThinkingLevel) {
			manager.setDefaultThinkingLevel(patch.defaultThinkingLevel)
		}
		if (patch.shellPath !== undefined) {
			manager.setShellPath(patch.shellPath ?? undefined)
		}
		await manager.flush()
	}
}
