// 단색 chroma key 배경 제거 — 알파 매팅 방식.
// 머리카락 외곽 같은 anti-aliasing 영역에서 캐릭터 색을 살리도록 매팅 방정식을 적용한다.
//
// 알고리즘 (3 영역):
//   distance ≤ innerBand  → 확정 배경 (alpha 0)
//   distance ≥ outerBand  → 확정 캐릭터 (alpha 255, 원본 색)
//   사이 (매팅 영역)      → 알파 매팅:
//       C = α·F + (1-α)·B
//       α = ((C - B) · (F - B)) / |F - B|²   ← 픽셀과 캐릭터·배경 색 차이의 투영
//       F = (C - (1 - α)·B) / α              ← 외곽 픽셀의 원본 색 복원 (despill)
//   여기서 F는 가까운 캐릭터 색을 단순화해서 "C가 배경에서 멀어진 방향"으로 가정.
//   이렇게 하면 매팅 영역에서 알파가 부드럽게 풀리고, 배경 색 성분이 자동으로 제거된다.
//
// innerBand / outerBand는 tolerance 슬라이더 한 개에서 자동 산출:
//   innerBand = tolerance * 0.5  (확정 배경 영역)
//   outerBand = tolerance * 1.5  (확정 캐릭터 영역)
// → 매팅 영역은 tolerance 중심으로 좌우 50% 폭

export const DEFAULT_BG_COLOR = { r: 0, g: 255, b: 255 } // cyan

export function detectBackgroundColor(imageData) {
  const { data, width, height } = imageData
  const pts = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [(width / 2) | 0, 0],
    [(width / 2) | 0, height - 1],
    [0, (height / 2) | 0],
    [width - 1, (height / 2) | 0],
  ]
  let r = 0, g = 0, b = 0
  for (const [x, y] of pts) {
    const i = (y * width + x) * 4
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  const n = pts.length
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

export async function detectBackgroundColorFromUrl(url) {
  const img = await loadImageFromUrl(url)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return detectBackgroundColor(id)
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = url
  })
}

export function applyChromaBackgroundRemoval(imageData, options = {}) {
  const bg = options.bgColor || DEFAULT_BG_COLOR
  const tolerance = clamp(options.tolerance ?? 80, 1, 441)
  const innerBand = tolerance * 0.5  // ≤ 이 거리는 확정 배경
  const outerBand = tolerance * 1.5  // ≥ 이 거리는 확정 캐릭터
  const data = imageData.data
  const br = bg.r
  const bgG = bg.g
  const bb = bg.b
  // |F - B|²의 가정값: 가장 두드러진 캐릭터 색은 배경의 정반대 (1 - bg)라고 가정.
  // 매팅 방정식에서 F를 정확히 추정하기 어려우니, 배경의 보색 방향으로 정사영.
  // 결과적으로 alpha = (C - B) 의 배경 보색 방향 성분 / 그 보색 크기
  const fInvR = 255 - br
  const fInvG = 255 - bgG
  const fInvB = 255 - bb
  const fbR = fInvR - br
  const fbG = fInvG - bgG
  const fbB = fInvB - bb
  const fbMagSq = fbR * fbR + fbG * fbG + fbB * fbB || 1

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const dr = r - br
    const dg = g - bgG
    const db = b - bb
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)

    if (dist <= innerBand) {
      // 확정 배경
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
    } else if (dist >= outerBand) {
      // 확정 캐릭터 — 원본 그대로
      data[i + 3] = 255
    } else {
      // 매팅 영역 — 알파 풀고 색 복원
      // α = ((C-B)·(F-B)) / |F-B|², F를 (1-B)로 근사
      let alpha = (dr * fbR + dg * fbG + db * fbB) / fbMagSq
      alpha = clamp01(alpha)
      if (alpha <= 0) {
        // 완전 배경
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = 0
      } else if (alpha >= 1) {
        data[i + 3] = 255
      } else {
        // unpremultiply: F = (C - (1-α)·B) / α
        const invA = 1 - alpha
        const fr = (r - invA * br) / alpha
        const fg = (g - invA * bgG) / alpha
        const fb = (b - invA * bb) / alpha
        data[i] = clampByte(Math.round(fr))
        data[i + 1] = clampByte(Math.round(fg))
        data[i + 2] = clampByte(Math.round(fb))
        data[i + 3] = Math.round(alpha * 255)
      }
    }
  }
  return imageData
}

export async function removeChromaBackground(imageUrl, options = {}) {
  const img = await loadImageFromUrl(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const bgColor = options.bgColor || detectBackgroundColor(id)
  applyChromaBackgroundRemoval(id, { ...options, bgColor })
  ctx.putImageData(id, 0, 0)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 실패'))), 'image/png')
  })
  return { blob, bgColor }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
