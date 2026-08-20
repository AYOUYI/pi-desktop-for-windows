import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '../store/session-store'
import { ACCENTS, applyPrefs, loadPrefs, savePrefs, type AccentKey, type ThemePrefs } from '../lib/theme'
import type {
	WireCustomProviderModel,
	WireCustomProviderRequest,
	WireExtensionInfo,
	WireGeneralSettings,
	WireProviderStatus,
	WireSkillInfo
} from '../../../shared/types'

type TabKey = 'general' | 'providers' | 'appearance' | 'skills' | 'extensions'

const TABS: { key: TabKey; label: string }[] = [
	{ key: 'general', label: '通用' },
	{ key: 'providers', label: '模型供应商' },
	{ key: 'appearance', label: '界面' },
	{ key: 'skills', label: '技能' },
	{ key: 'extensions', label: '扩展' }
]

function errMsg(err: unknown): string {
	return String(err).replace(/^Error:\s*/, '')
}

// ---------- 通用 ----------

function GeneralTab() {
	const cwd = useSessionStore((s) => s.tabs.find((t) => t.tabId === s.activeTabId)?.cwd ?? null)
	const models = useSessionStore((s) => s.models)
	const [settings, setSettings] = useState<WireGeneralSettings | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)

	const load = useCallback(() => {
		setError(null)
		window.piDesktop.getGeneralSettings(cwd).then(setSettings).catch((e) => setError(errMsg(e)))
	}, [cwd])

	useEffect(load, [load])

	const save = async (patch: Partial<WireGeneralSettings>) => {
		if (!settings) return
		const next = { ...settings, ...patch }
		setSettings(next)
		try {
			await window.piDesktop.setGeneralSettings(cwd, patch)
			setSaved(true)
			setTimeout(() => setSaved(false), 1200)
		} catch (e) {
			setError(errMsg(e))
		}
	}

	if (!settings) return <div className="settings-loading">{error ?? '加载中…'}</div>

	// settings.defaultModel 是 pi 的裸 ID；下拉选项是 "provider/model" 限定格式
	const selectValue = settings.defaultModel
		? models.find((m) => m.id.endsWith(`/${settings.defaultModel}`))?.id ?? ''
		: ''

	return (
		<div className="settings-form">
			<label className="field">
				<span className="field-label">默认模型</span>
				<select
					className="select"
					value={selectValue}
					onChange={(e) => void save({ defaultModel: e.target.value || null })}
				>
					<option value="">（跟随 pi 设置）</option>
					{models.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name} · {m.provider}
						</option>
					))}
				</select>
			</label>
			<label className="field">
				<span className="field-label">默认推理级别</span>
				<select
					className="select"
					value={settings.defaultThinkingLevel ?? 'medium'}
					onChange={(e) => void save({ defaultThinkingLevel: e.target.value as WireGeneralSettings['defaultThinkingLevel'] })}
				>
					{['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((l) => (
						<option key={l} value={l}>
							{l}
						</option>
					))}
				</select>
			</label>
			<label className="field">
				<span className="field-label">Shell 路径（bash 工具使用，默认自动探测 Git Bash）</span>
				<input
					className="input"
					type="text"
					placeholder="例如 C:\\Program Files\\Git\\bin\\bash.exe"
					defaultValue={settings.shellPath ?? ''}
					onBlur={(e) => {
						if (e.target.value !== (settings.shellPath ?? '')) {
							void save({ shellPath: e.target.value || null })
						}
					}}
				/>
			</label>
			{saved && <div className="settings-saved">已保存</div>}
			{error && <div className="settings-error">{error}</div>}
			<div className="settings-hint">写入 ~/.pi/agent/settings.json，与 pi CLI 完全一致。</div>
		</div>
	)
}

// ---------- 供应商 ----------

function ProvidersTab() {
	const refreshModels = useCallback(() => {
		void window.piDesktop.listModels().then((models) => useSessionStore.getState().setModels(models))
	}, [])

	const [providers, setProviders] = useState<WireProviderStatus[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [editing, setEditing] = useState<string | null>(null)
	const [keyValue, setKeyValue] = useState('')
	const [addingCustom, setAddingCustom] = useState(false)

	const load = useCallback(() => {
		setError(null)
		window.piDesktop
			.listProviders()
			.then(setProviders)
			.catch((e) => setError(errMsg(e)))
	}, [])

	useEffect(load, [load])

	const submitKey = async (providerId: string) => {
		if (!keyValue.trim()) return
		try {
			await window.piDesktop.setProviderApiKey(providerId, keyValue.trim())
			setEditing(null)
			setKeyValue('')
			load()
			refreshModels()
		} catch (e) {
			setError(errMsg(e))
		}
	}

	const logout = async (providerId: string) => {
		try {
			await window.piDesktop.logoutProvider(providerId)
			load()
			refreshModels()
		} catch (e) {
			setError(errMsg(e))
		}
	}

	const removeCustom = async (providerId: string) => {
		if (!window.confirm(`删除自定义供应商 ${providerId}？（models.json 中的条目将被移除）`)) return
		try {
			await window.piDesktop.removeCustomProvider(providerId)
			load()
			refreshModels()
		} catch (e) {
			setError(errMsg(e))
		}
	}

	if (addingCustom) {
		return (
			<CustomProviderForm
				onDone={() => {
					setAddingCustom(false)
					load()
					refreshModels()
				}}
			/>
		)
	}

	if (!providers) return <div className="settings-loading">{error ?? '加载中…'}</div>

	return (
		<div className="settings-providers">
			<div className="settings-toolbar">
				<button type="button" className="btn-secondary" onClick={() => setAddingCustom(true)}>
					+ 添加自定义供应商（Ollama / vLLM / OpenAI 兼容）
				</button>
			</div>
			{providers.map((p) => (
				<div key={p.id} className="provider-row">
					<div className="provider-main">
						<span className="provider-id">{p.id}</span>
						{p.custom && <span className="tag">自定义</span>}
						<span className="provider-count">{p.modelCount} 个模型</span>
					</div>
					<div className="provider-side">
						{p.configured ? (
							<span className="badge ok">
								已配置{p.source === 'environment' ? '（环境变量）' : p.source === 'stored' ? '（auth.json）' : ''}
							</span>
						) : (
							<span className="badge dim">未配置</span>
						)}
						{editing === p.id ? (
							<span className="provider-keyedit">
								<input
									className="input"
									type="password"
									placeholder="API Key"
									value={keyValue}
									autoFocus
									onChange={(e) => setKeyValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') void submitKey(p.id)
										if (e.key === 'Escape') setEditing(null)
									}}
								/>
								<button type="button" className="btn-primary" onClick={() => void submitKey(p.id)}>
									保存
								</button>
								<button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
									取消
								</button>
							</span>
						) : (
							<>
								<button
									type="button"
									className="btn-secondary"
									onClick={() => {
										setEditing(p.id)
										setKeyValue('')
									}}
								>
									{p.configured ? '更换密钥' : '配置密钥'}
								</button>
								{p.configured && (
									<button type="button" className="btn-ghost" onClick={() => void logout(p.id)}>
										登出
									</button>
								)}
								{p.custom && (
									<button type="button" className="btn-danger" onClick={() => void removeCustom(p.id)}>
										删除
									</button>
								)}
							</>
						)}
					</div>
				</div>
			))}
			{error && <div className="settings-error">{error}</div>}
			<div className="settings-hint">密钥写入 ~/.pi/agent/auth.json（pi 热加载，无需重启）。</div>
		</div>
	)
}

function CustomProviderForm({ onDone }: { onDone: () => void }) {
	const [providerId, setProviderId] = useState('')
	const [name, setName] = useState('')
	const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1')
	const [api, setApi] = useState('openai-completions')
	const [apiKey, setApiKey] = useState('')
	const [models, setModels] = useState<WireCustomProviderModel[]>([{ id: '', name: '' }])
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const submit = async () => {
		const cleanModels = models.filter((m) => m.id.trim())
		const req: WireCustomProviderRequest = {
			providerId: providerId.trim(),
			name: name.trim(),
			baseUrl: baseUrl.trim(),
			api,
			apiKey: apiKey.trim(),
			models: cleanModels.map((m) => ({ id: m.id.trim(), name: m.name.trim() || m.id.trim() }))
		}
		setBusy(true)
		setError(null)
		try {
			await window.piDesktop.addCustomProvider(req)
			onDone()
		} catch (e) {
			setError(errMsg(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="settings-form">
			<h3 className="settings-subtitle">添加自定义供应商</h3>
			<div className="field-row">
				<label className="field">
					<span className="field-label">供应商 ID（唯一，小写字母/数字/连字符）</span>
					<input className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="my-ollama" />
				</label>
				<label className="field">
					<span className="field-label">显示名称</span>
					<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="本地 Ollama" />
				</label>
			</div>
			<div className="field-row">
				<label className="field">
					<span className="field-label">Base URL</span>
					<input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
				</label>
				<label className="field">
					<span className="field-label">API 适配器</span>
					<select className="select" value={api} onChange={(e) => setApi(e.target.value)}>
						<option value="openai-completions">openai-completions（OpenAI 兼容）</option>
						<option value="anthropic-messages">anthropic-messages</option>
						<option value="openai-responses">openai-responses</option>
						<option value="google-generative-ai">google-generative-ai</option>
						<option value="mistral-conversations">mistral-conversations</option>
					</select>
				</label>
			</div>
			<label className="field">
				<span className="field-label">API Key（可选，本地服务可留空）</span>
				<input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
			</label>
			<div className="field">
				<span className="field-label">模型列表</span>
				{models.map((m, i) => (
					<div key={i} className="field-row">
						<input
							className="input"
							placeholder="模型 ID，如 llama3.1:8b"
							value={m.id}
							onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
						/>
						<input
							className="input"
							placeholder="显示名称"
							value={m.name}
							onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
						/>
						<button type="button" className="btn-ghost" onClick={() => setModels(models.filter((_, j) => j !== i))}>
							移除
						</button>
					</div>
				))}
				<button type="button" className="btn-secondary" onClick={() => setModels([...models, { id: '', name: '' }])}>
					+ 添加模型
				</button>
			</div>
			{error && <div className="settings-error">{error}</div>}
			<div className="settings-actions">
				<button type="button" className="btn-primary" disabled={busy || !providerId.trim() || !baseUrl.trim()} onClick={() => void submit()}>
					{busy ? '保存中…' : '保存供应商'}
				</button>
				<button type="button" className="btn-ghost" onClick={onDone} disabled={busy}>
					取消
				</button>
			</div>
			<div className="settings-hint">写入 ~/.pi/agent/models.json；模型上下文窗口等参数可稍后手动编辑该文件微调。</div>
		</div>
	)
}

// ---------- 界面 ----------

function AppearanceTab() {
	const [prefs, setPrefs] = useState<ThemePrefs>(() => loadPrefs())

	const update = (patch: Partial<ThemePrefs>) => {
		const next = { ...prefs, ...patch }
		setPrefs(next)
		applyPrefs(next)
		savePrefs(next)
	}

	return (
		<div className="settings-form">
			<label className="field">
				<span className="field-label">主题</span>
				<div className="segmented">
					<button
						type="button"
						className={prefs.theme === 'dark' ? 'seg active' : 'seg'}
						onClick={() => update({ theme: 'dark' })}
					>
						深色
					</button>
					<button
						type="button"
						className={prefs.theme === 'light' ? 'seg active' : 'seg'}
						onClick={() => update({ theme: 'light' })}
					>
						浅色
					</button>
				</div>
			</label>
			<label className="field">
				<span className="field-label">强调色</span>
				<div className="swatches">
					{(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
						<button
							key={key}
							type="button"
							title={ACCENTS[key].label}
							className={prefs.accent === key ? 'swatch active' : 'swatch'}
							style={{ background: ACCENTS[key].base }}
							onClick={() => update({ accent: key })}
						/>
					))}
				</div>
			</label>
			<label className="field">
				<span className="field-label">正文字号：{prefs.fontSize}px</span>
				<input
					type="range"
					min={12}
					max={18}
					step={1}
					value={prefs.fontSize}
					onChange={(e) => update({ fontSize: Number(e.target.value) })}
				/>
			</label>
			<div className="settings-hint">仅影响本应用外观，保存在本地。</div>
		</div>
	)
}

// ---------- 技能 ----------

function SkillsTab() {
	const cwd = useSessionStore((s) => s.tabs.find((t) => t.tabId === s.activeTabId)?.cwd ?? null)
	const [skills, setSkills] = useState<WireSkillInfo[] | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		setError(null)
		window.piDesktop
			.listSkills(cwd)
			.then(setSkills)
			.catch((e) => setError(errMsg(e)))
	}, [cwd])

	return (
		<div className="settings-list">
			<div className="settings-toolbar">
				<button type="button" className="btn-secondary" onClick={() => void window.piDesktop.openSettingsDir('skills')}>
					打开全局技能目录
				</button>
			</div>
			{!skills ? (
				<div className="settings-loading">{error ?? '加载中…'}</div>
			) : skills.length === 0 ? (
				<div className="settings-hint">暂无技能。在技能目录中创建子目录并放入 SKILL.md（frontmatter 含 name 和 description）即可被发现。</div>
			) : (
				skills.map((s) => (
					<div key={`${s.source}:${s.filePath}`} className="list-row">
						<div className="list-main">
							<span className="list-title">{s.name}</span>
							<span className="tag">{s.source === 'project' ? '项目' : '全局'}</span>
							{s.disableModelInvocation && <span className="tag dim">仅手动调用</span>}
						</div>
						<div className="list-desc" title={s.filePath}>
							{s.description}
						</div>
					</div>
				))
			)}
			{error && <div className="settings-error">{error}</div>}
			<div className="settings-hint">项目级技能放在工作区 .pi/skills/，全局技能在 ~/.pi/agent/skills/。</div>
		</div>
	)
}

// ---------- 扩展 ----------

function ExtensionsTab() {
	const cwd = useSessionStore((s) => s.tabs.find((t) => t.tabId === s.activeTabId)?.cwd ?? null)
	const [extensions, setExtensions] = useState<WireExtensionInfo[] | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		setError(null)
		window.piDesktop
			.listExtensions(cwd)
			.then(setExtensions)
			.catch((e) => setError(errMsg(e)))
	}, [cwd])

	return (
		<div className="settings-list">
			<div className="settings-toolbar">
				<button type="button" className="btn-secondary" onClick={() => void window.piDesktop.openSettingsDir('extensions')}>
					打开全局扩展目录
				</button>
			</div>
			{!extensions ? (
				<div className="settings-loading">{error ?? '加载中…'}</div>
			) : extensions.length === 0 ? (
				<div className="settings-hint">
					暂无扩展。扩展是 TS/JS 模块，默认导出一个接收 pi 对象的函数，放入扩展目录即自动加载，可注册工具、命令、供应商等。
				</div>
			) : (
				extensions.map((e) => (
					<div key={e.filePath} className="list-row">
						<div className="list-main">
							<span className="list-title mono">{e.filePath}</span>
							<span className="tag">{e.source === 'project' ? '项目' : '全局'}</span>
							<span className="tag dim">{e.kind === 'package' ? '包' : '文件'}</span>
						</div>
					</div>
				))
			)}
			<div className="mcp-note">
				<strong>关于 MCP：</strong>pi 官方设计上不内置 MCP 支持——推荐用「技能」（带 README 的 CLI 工具）替代，或编写扩展调用
				pi.registerTool() 桥接 MCP 服务器。扩展放入上方目录即可生效。
			</div>
			{error && <div className="settings-error">{error}</div>}
		</div>
	)
}

// ---------- Dialog shell ----------

export function SettingsDialog({ onClose }: { onClose: () => void }) {
	const [tab, setTab] = useState<TabKey>('general')

	return (
		<div className="settings-overlay" onClick={onClose}>
			<div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
				<div className="settings-header">
					<span className="settings-title">设置</span>
					<button type="button" className="btn-ghost" onClick={onClose}>
						✕
					</button>
				</div>
				<div className="settings-body">
					<div className="settings-tabs">
						{TABS.map((t) => (
							<button
								key={t.key}
								type="button"
								className={tab === t.key ? 'settings-tab active' : 'settings-tab'}
								onClick={() => setTab(t.key)}
							>
								{t.label}
							</button>
						))}
					</div>
					<div className="settings-content">
						{tab === 'general' && <GeneralTab />}
						{tab === 'providers' && <ProvidersTab />}
						{tab === 'appearance' && <AppearanceTab />}
						{tab === 'skills' && <SkillsTab />}
						{tab === 'extensions' && <ExtensionsTab />}
					</div>
				</div>
			</div>
		</div>
	)
}
