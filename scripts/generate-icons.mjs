/**
 * 生成应用图标：build/icon.png (256) 和 build/icon.ico (16-256)。
 * 纯 Node 实现（zlib PNG 编码 + PNG 内嵌 ICO），无第三方依赖。
 * 图形：紫色圆角方块 + 白色 π 字形（圆角矩形拼绘）。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		t[n] = c >>> 0
	}
	return t
})()

function crc32(buf) {
	let c = 0xffffffff
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length)
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(body))
	return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(width, 0)
	ihdr.writeUInt32BE(height, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 6 // RGBA
	const stride = width * 4
	const raw = Buffer.alloc((stride + 1) * height)
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0 // filter: none
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
	}
	return Buffer.concat([
		sig,
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', deflateSync(raw, { level: 9 })),
		pngChunk('IEND', Buffer.alloc(0))
	])
}

// ---------- 绘制 ----------
const BG = [124, 108, 240]
const FG = [255, 255, 255]

/** 圆角矩形内的点判定（带 0.5 像素中心采样）。 */
function inRR(px, py, x0, y0, x1, y1, r) {
	if (px < x0 || px > x1 || py < y0 || py > y1) return false
	if (px >= x0 + r && px <= x1 - r) return true
	if (py >= y0 + r && py <= y1 - r) return true
	const dx = Math.max(x0 + r - px, 0, px - (x1 - r))
	const dy = Math.max(y0 + r - py, 0, py - (y1 - r))
	return dx * dx + dy * dy <= r * r
}

/** 在 256x256 设计坐标里画图标，输出 RGBA。 */
function draw256() {
	const S = 256
	const px = new Uint8Array(S * S * 4)
	// π 字形各部件（设计坐标）
	const parts = [
		// 顶部横杠
		{ x0: 56, y0: 66, x1: 200, y1: 92, r: 13 },
		// 左腿 / 右腿
		{ x0: 86, y0: 66, x1: 110, y1: 196, r: 12 },
		{ x0: 146, y0: 66, x1: 170, y1: 196, r: 12 },
		// 左脚 / 右脚
		{ x0: 72, y0: 182, x1: 124, y1: 204, r: 11 },
		{ x0: 132, y0: 182, x1: 184, y1: 204, r: 11 }
	]
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const cx = x + 0.5
			const cy = y + 0.5
			const i = (y * S + x) * 4
			let color = null
			if (inRR(cx, cy, 0, 0, 255, 255, 52)) color = BG
			for (const p of parts) {
				if (color === BG && inRR(cx, cy, p.x0, p.y0, p.x1, p.y1, p.r)) {
					color = FG
					break
				}
			}
			if (color) {
				px[i] = color[0]
				px[i + 1] = color[1]
				px[i + 2] = color[2]
				px[i + 3] = 255
			}
		}
	}
	return Buffer.from(px.buffer)
}

/** 最近邻缩放。 */
function resize(src, srcSize, dstSize) {
	const out = Buffer.alloc(dstSize * dstSize * 4)
	for (let y = 0; y < dstSize; y++) {
		const sy = Math.min(srcSize - 1, Math.floor((y * srcSize) / dstSize))
		for (let x = 0; x < dstSize; x++) {
			const sx = Math.min(srcSize - 1, Math.floor((x * srcSize) / dstSize))
			const si = (sy * srcSize + sx) * 4
			const di = (y * dstSize + x) * 4
			out[di] = src[si]
			out[di + 1] = src[si + 1]
			out[di + 2] = src[si + 2]
			out[di + 3] = src[si + 3]
		}
	}
	return out
}

/** PNG 内嵌式 ICO。 */
function writeIco(entries) {
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(entries.length, 4)
	let offset = 6 + entries.length * 16
	const dirs = []
	const blobs = []
	for (const e of entries) {
		const d = Buffer.alloc(16)
		d[0] = e.size >= 256 ? 0 : e.size
		d[1] = e.size >= 256 ? 0 : e.size
		d.writeUInt16LE(1, 4) // planes
		d.writeUInt16LE(32, 6) // bpp
		d.writeUInt32LE(e.png.length, 8)
		d.writeUInt32LE(offset, 12)
		dirs.push(d)
		blobs.push(e.png)
		offset += e.png.length
	}
	return Buffer.concat([header, ...dirs, ...blobs])
}

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const base = draw256()
mkdirSync(join(ROOT, 'build'), { recursive: true })
writeFileSync(join(ROOT, 'build', 'icon.png'), encodePNG(256, 256, base))
writeFileSync(
	join(ROOT, 'build', 'icon.ico'),
	writeIco(SIZES.map((size) => ({ size, png: encodePNG(size, size, resize(base, 256, size)) })))
)
console.log(`[icons] wrote build/icon.png (256) and build/icon.ico (${SIZES.join('/')})`)
