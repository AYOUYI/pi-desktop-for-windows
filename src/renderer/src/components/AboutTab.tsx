import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/session-store'
import { Lightbox } from './Lightbox'
import wechatQr from '../assets/wechat-qr.jpg'
import type { AppInfo, WireAppBehavior } from '../../../shared/types'

const REPO_URL = 'https://github.com/AYOUYI/pi-desktop-for-windows'
const DEV_URL = 'https://github.com/AYOUYI'
const PI_URL = 'https://github.com/earendil-works/pi'

/** 设置 → 关于我们：项目介绍、开发者信息、应用内更新（参考 Cherry Studio 布局） */
export function AboutTab() {
	const [info, setInfo] = useState<AppInfo | null>(null)
	const [behavior, setBehavior] = useState<WireAppBehavior | null>(null)
	const [qrOpen, setQrOpen] = useState(false)
	const update = useSessionStore((s) => s.update)

	useEffect(() => {
		void window.piDesktop.getAppInfo().then(setInfo)
		void window.piDesktop.getAppBehavior().then(setBehavior)
	}, [])

	const open = (url: string) => {
		// 外链走系统浏览器（渲染端 CSP 允许 anchor 默认行为被拦截，用 shell 更稳）
		const a = document.createElement('a')
		a.href = url
		a.target = '_blank'
		a.rel = 'noreferrer'
		a.click()
	}

	const setAutoUpdate = async (on: boolean) => {
		const next = await window.piDesktop.setAppBehavior({ autoUpdateCheck: on })
		setBehavior(next)
	}

	return (
		<div className="about">
			<div className="about-card">
				<div className="about-head">
					<div className="about-logo">π</div>
					<div className="about-title-block">
						<div className="about-name">Pi Desktop for Windows</div>
						<div className="about-slogan">为 pi coding agent 而生的 Windows 原生桌面客户端</div>
						<span className="about-version">v{info?.appVersion ?? '0.0.0'}</span>
					</div>
					<button
						type="button"
						className="btn-secondary"
						disabled={update.status === 'checking' || update.status === 'downloading'}
						onClick={() => void window.piDesktop.checkUpdate()}
					>
						{update.status === 'checking'
							? '检查中…'
							: update.status === 'downloading'
								? `下载中 ${update.percent != null ? update.percent + '%' : ''}`
								: '检查更新'}
					</button>
				</div>

				{update.status === 'ready' && (
					<div className="about-update-card ready">
						<div>
							发现新版本 <strong>v{update.version}</strong> 已下载完成
						</div>
						<button type="button" className="update-btn" onClick={() => void window.piDesktop.installUpdate()}>
							↻ 立即重启更新
						</button>
					</div>
				)}
				{update.status === 'latest' && <div className="about-update-note">当前已是最新版本 ✔</div>}
				{update.status === 'error' && <div className="about-update-note error">{update.message}</div>}

				<label className="check-row about-row">
					<input
						type="checkbox"
						checked={behavior?.autoUpdateCheck ?? true}
						onChange={(e) => void setAutoUpdate(e.target.checked)}
					/>
					<span>自动检查更新（启动后与每 4 小时）</span>
				</label>
				<label className="check-row about-row">
					<input
						type="checkbox"
						checked={behavior?.closeToTray ?? false}
						onChange={(e) => void window.piDesktop.setAppBehavior({ closeToTray: e.target.checked }).then(setBehavior)}
					/>
					<span>关闭按钮最小化到系统托盘</span>
				</label>
			</div>

			<div className="about-card">
				<div className="about-section-title">关于本项目</div>
				<p className="about-text">
					Pi Desktop 基于 <a href={PI_URL} onClick={(e) => { e.preventDefault(); open(PI_URL) }}>pi coding agent</a> 官方
					SDK 构建，SDK 进程内运行：多会话标签页、内嵌可操作浏览器、工具卡片与 diff、会话分支树、
					图片收发、自定义主题与毛玻璃背景，并与 pi CLI 共享 ~/.pi/agent 的配置与会话。
				</p>
				<div className="about-links">
					<button type="button" className="btn-ghost" onClick={() => open(REPO_URL)}>GitHub 仓库</button>
					<button type="button" className="btn-ghost" onClick={() => open(`${REPO_URL}/releases`)}>版本发布</button>
					<button type="button" className="btn-ghost" onClick={() => open(`${REPO_URL}/issues`)}>问题反馈</button>
				</div>
			</div>

			<div className="about-card">
				<div className="about-section-title">开发者</div>
				<div className="about-dev">
					<div className="about-dev-avatar">A</div>
					<div className="about-dev-main">
						<div className="about-dev-name">AARON</div>
						<div className="about-slogan">中国大陆 · 北京 · 独立开发者</div>
					</div>
					<div className="about-qr-wrap">
						<img
							className="about-qr"
							src={wechatQr}
							alt="微信二维码"
							title="点击放大，扫码加微信"
							onClick={() => setQrOpen(true)}
						/>
						<span className="about-slogan">微信联系我</span>
					</div>
					<button type="button" className="btn-ghost" onClick={() => open(DEV_URL)}>
						GitHub 主页
					</button>
				</div>
				{qrOpen && <Lightbox src={wechatQr} onClose={() => setQrOpen(false)} />}
			</div>

			<div className="about-license">MIT License · 依赖 pi（MIT, Copyright Earendil Works）</div>
		</div>
	)
}
