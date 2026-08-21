import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, extname } from 'node:path'
import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

const MAX_BYTES = 12 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.bmp': 'image/bmp',
	'.svg': 'image/svg+xml'
}

/**
 * show_image：agent 把本地图片文件"发送"到对话流给用户看。
 * 图像放在 details（仅 UI 渲染，不进 LLM 上下文），content 只返回文本——
 * 因此不依赖模型的视觉输入能力，任何模型都可用。
 */
export function createShowImageTool(cwd: string): ToolDefinition {
	return defineTool({
		name: 'show_image',
		label: '展示图片',
		description:
			'在对话界面中向用户展示一张本地图片文件（PNG/JPG/WebP/GIF/BMP/SVG）。生成图表、截图、渲染结果后应调用它让用户直接看到，而不是只给文件路径。',
		promptSnippet: 'show_image(path, caption?) - 在对话中向用户展示图片文件',
		promptGuidelines: [
			'生成或得到图片文件后（图表、截图、渲染输出等），调用 show_image(path) 展示给用户；用户界面会直接显示图片，与模型是否支持图像输入无关。',
			'SVG 也可以直接展示。展示后如需用户保存或转发，再补充说明文件路径。'
		],
		parameters: Type.Object({
			path: Type.String({ description: '图片文件路径（绝对路径，或相对当前工作区）' }),
			caption: Type.Optional(Type.String({ description: '图片说明文字' }))
		}),
		async execute(_toolCallId, params: { path: string; caption?: string }) {
			const resolved = isAbsolute(params.path) ? params.path : join(cwd, params.path)
			const ext = extname(resolved).toLowerCase()
			const mimeType = MIME_BY_EXT[ext]
			if (!mimeType) {
				return {
					details: undefined,
					content: [{ type: 'text', text: `不支持的图片格式：${ext || '(无扩展名)'}（支持 png/jpg/webp/gif/bmp/svg）` }]
				}
			}
			try {
				const info = await stat(resolved)
				if (!info.isFile()) throw new Error('不是文件')
				if (info.size > MAX_BYTES) {
					return {
						details: undefined,
						content: [{ type: 'text', text: `图片过大（${Math.round(info.size / 1024)}KB，上限 12MB），请压缩后重试` }]
					}
				}
				const buf = await readFile(resolved)
				const kb = Math.round(info.size / 1024)
				return {
					details: {
						images: [{ type: 'image', data: buf.toString('base64'), mimeType }]
					},
					content: [
						{
							type: 'text',
							text: `已向用户展示图片 ${params.path}（${kb}KB${params.caption ? `：${params.caption}` : ''}）`
						}
					]
				}
			} catch (err) {
				return {
					details: undefined,
					content: [{ type: 'text', text: `读取图片失败：${resolved}（${String(err)}）` }]
				}
			}
		}
	})
}
