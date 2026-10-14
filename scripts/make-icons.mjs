/**
 * PWA 아이콘 생성. 의존성 없이 (node:zlib 로 PNG 직접 인코딩).
 *   node scripts/make-icons.mjs
 * 결과: public/icon-192.png, public/icon-512.png, public/icon-512-maskable.png, public/favicon.png
 *
 * 왜 스크립트인가: 바이너리를 리포에 넣고 "어떻게 만들었는지 모르는 파일"로 두지 않는다.
 * 디자인을 바꾸려면 이 파일의 숫자만 고치면 된다.
 *
 * 모양: 짙은 남색 바탕에 두 개의 겹친 원 (부부 두 사람 = '궁합'). 겹친 부분이 합의다.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

const BG = [31, 41, 55] // --ink #1f2937
const A = [255, 255, 255] // 남편 원
const B = [217, 119, 6] // --yellow #d97706 아내 원
const OVERLAP = [22, 163, 74] // --green #16a34a 겹친 부분 = 합의

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = pixel(x, y)
      const o = y * stride + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 안티앨리어싱: 픽셀을 2×2 로 나눠 평균한다 (작은 크기에서 원 테두리가 거칠지 않게) */
function sample(x, y, f) {
  const acc = [0, 0, 0]
  for (const dx of [0.25, 0.75]) for (const dy of [0.25, 0.75]) {
    const c = f(x + dx, y + dy)
    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
  }
  return [acc[0] / 4, acc[1] / 4, acc[2] / 4]
}

/**
 * @param size 한 변 픽셀
 * @param safe 내용이 들어갈 비율 (maskable 은 0.72 — 원형 마스크에 잘려도 살아남게)
 */
function draw(size, safe) {
  const cx = size / 2, cy = size / 2
  const r = (size * safe) / 2 * 0.52     // 원 반지름
  const off = r * 0.52                   // 두 원의 중심 간격 절반
  const corner = size * 0.22             // 바탕 둥근 모서리

  const inRounded = (x, y) => {
    const dx = Math.min(x, size - x), dy = Math.min(y, size - y)
    if (dx >= corner || dy >= corner) return dx >= 0 && dy >= 0
    return (corner - dx) ** 2 + (corner - dy) ** 2 <= corner ** 2
  }

  const at = (x, y) => {
    if (!inRounded(x, y)) return BG // 모서리 밖도 배경색 (투명 대신 — iOS 가 흰색으로 채우지 않게)
    const inA = (x - (cx - off)) ** 2 + (y - cy) ** 2 <= r * r
    const inB = (x - (cx + off)) ** 2 + (y - cy) ** 2 <= r * r
    if (inA && inB) return OVERLAP
    if (inA) return A
    if (inB) return B
    return BG
  }

  return png(size, (x, y) => sample(x, y, at))
}

mkdirSync(OUT, { recursive: true })
const files = [
  ['icon-192.png', draw(192, 1)],
  ['icon-512.png', draw(512, 1)],
  ['icon-512-maskable.png', draw(512, 0.72)],
  ['favicon.png', draw(64, 1)],
]
for (const [name, buf] of files) {
  writeFileSync(resolve(OUT, name), buf)
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)}KB`)
}
