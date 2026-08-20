// Supabase Storage 이미지 변환 URL 생성.
//
// 원본 경로(/storage/v1/object/public/)를 렌더 경로(/storage/v1/render/image/public/)로
// 바꾸고 width/quality 파라미터를 붙인다. 원본 파일은 그대로 두므로, 되돌리려면
// 호출부에서 이 함수만 빼면 된다.
//
// 왜: 캐릭터 프로필 이미지 91장이 원본 해상도(중앙 224KB, 최대 584KB)로 하루 5.8만 회
// 내려가면서 Supabase egress의 44%(월 484GB)를 차지하고 있었다. 홈 로딩 체감 속도도
// 같이 개선된다.
//
// 과금: 변환 API는 "변환한 원본 이미지 수" 기준(월 1,000장당 $5, Pro는 100장 무료)이며
// 요청 수·변형(variant) 수와는 무관하다. 프로필 이미지는 91장이라 무료 한도 안에 들어간다.
// 따라서 이 헬퍼를 피드·갤러리처럼 원본 장수가 많은 곳에 무분별하게 쓰면 과금이 늘어난다.

const OBJECT_PATH = '/storage/v1/object/public/'
const RENDER_PATH = '/storage/v1/render/image/public/'

// 변환 API는 정지 이미지 전용. 영상은 물론이고 GIF도 변환하면 애니메이션이 죽는다.
const NON_TRANSFORMABLE = /\.(mp4|webm|mov|m4v|gif)(\?|$)/i

// 기기 픽셀비. 안드로이드 실기기는 대부분 DPR 2.6~3.5라 "CSS 폭 × 2"로 폭을 잡으면
// 항상 1.4~2배 업스케일돼서 눈에 띄게 뭉개진다. 그래서 요청 폭을 DPR에 맞춰 계산한다.
// 캐시 변형이 무한정 늘어나지 않도록 1/2/3 세 단계로만 끊는다(변형 수는 과금과 무관하고
// CDN 캐시 적중률에만 영향을 준다).
const DPR_BUCKETS = [1, 2, 3]
const DPR = (() => {
  const raw = (typeof window !== 'undefined' && window.devicePixelRatio) || 2
  return DPR_BUCKETS.find((b) => raw <= b) ?? 3
})()

/**
 * @param {string|null|undefined} url  Supabase 공개 URL (그 외 값은 그대로 반환)
 * @param {number} cssWidth            표시되는 CSS 폭(px). 실제 요청 폭은 여기에 DPR을 곱한 값
 * @param {number} [quality=85]        품질 20~100
 * @returns {string|null|undefined}
 */
export function resizedImageUrl(url, cssWidth, quality = 85) {
  if (!url || typeof url !== 'string') return url
  // Supabase 스토리지 원본 URL이 아니면 손대지 않는다 (외부 CDN·데이터 URL 등).
  if (!url.includes(OBJECT_PATH)) return url
  if (NON_TRANSFORMABLE.test(url)) return url
  // 이미 쿼리스트링이 붙어 있으면(서명 URL 등) 변환 대상에서 제외.
  if (url.includes('?')) return url
  const width = Math.round(cssWidth * DPR)
  // resize=contain 필수. Supabase는 resize 기본값이 cover이고 height를 생략하면 원본 높이를
  // 그대로 목표 높이로 잡기 때문에, width만 주면 세로는 안 줄이고 가로만 잘라낸다
  // (720x1280 원본 + width=480 -> 480x1280 가운데 크롭). 그 위에 CSS object-cover가
  // 한 번 더 크롭되면서 기기에서 이미지가 확대돼 보였다. contain이면 비율이 유지된다.
  return `${url.replace(OBJECT_PATH, RENDER_PATH)}?width=${width}&quality=${quality}&resize=contain`
}

// 품질 85. 672px(카드 실폭) 기준 실측 q80 65KB / q85 79KB / q90 108KB 으로,
// q90은 체감 대비 66% 더 비싸서 85에서 끊었다.
//
// 화면별 실제 CSS 폭(px). 요청 폭은 여기에 기기 DPR(최대 3)을 곱한 값이 된다.
// #root가 max-width 480px, 페이지 좌우 패딩이 px-4(16px씩)라 전폭 요소는 448px.
// 원본보다 큰 폭을 요청해도 Supabase는 업스케일하지 않고 원본 해상도 그대로 돌려주므로
// 넉넉하게 잡아도 낭비가 없다(실측: 720px 원본에 width=1440을 줘도 720px 응답).
export const IMG_W = {
  AVATAR_TINY: 16, // 로우 캡션 옆 미니 아바타 (w-3.5 = 14px)
  LIST_THUMB: 64, // 원형 썸네일 (w-16) · 채팅 목록 (w-14)
  CARD: 224, // 2열 카드 — (480 - 32 패딩 - 12 gap) / 2 = 218
  HERO: 448, // 전폭 슬라이더
}
