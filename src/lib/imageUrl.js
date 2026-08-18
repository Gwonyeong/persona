// Supabase Storage 이미지 변환 URL 생성.
//
// 원본 경로(/storage/v1/object/public/)를 렌더 경로(/storage/v1/render/image/public/)로
// 바꾸고 width/quality 파라미터를 붙인다. 원본 파일은 그대로 두므로, 되돌리려면
// 호출부에서 이 함수만 빼면 된다.
//
// 왜: 캐릭터 프로필 이미지 91장이 원본 해상도(중앙 224KB, 최대 584KB)로 하루 5.8만 회
// 내려가면서 Supabase egress의 44%(월 484GB)를 차지하고 있었다. width=480 변환 시
// 584KB → 56KB (90% 감소). 홈 로딩 체감 속도도 같이 개선된다.
//
// 과금: 변환 API는 "변환한 원본 이미지 수" 기준(월 1,000장당 $5, Pro는 100장 무료)이며
// 요청 수와는 무관하다. 프로필 이미지는 91장이라 무료 한도 안에 들어간다.
// 따라서 이 헬퍼를 피드·갤러리처럼 원본 장수가 많은 곳에 무분별하게 쓰면 과금이 늘어난다.

const OBJECT_PATH = '/storage/v1/object/public/'
const RENDER_PATH = '/storage/v1/render/image/public/'

// 변환 API는 정지 이미지 전용. 영상은 물론이고 GIF도 변환하면 애니메이션이 죽는다.
const NON_TRANSFORMABLE = /\.(mp4|webm|mov|m4v|gif)(\?|$)/i

/**
 * @param {string|null|undefined} url  Supabase 공개 URL (그 외 값은 그대로 반환)
 * @param {number} width               렌더 폭(px). DPR 고려해 CSS 폭의 약 2배를 권장
 * @param {number} [quality=75]        JPEG 품질 20~100
 * @returns {string|null|undefined}
 */
export function resizedImageUrl(url, width, quality = 75) {
  if (!url || typeof url !== 'string') return url
  // Supabase 스토리지 원본 URL이 아니면 손대지 않는다 (외부 CDN·데이터 URL 등).
  if (!url.includes(OBJECT_PATH)) return url
  if (NON_TRANSFORMABLE.test(url)) return url
  // 이미 쿼리스트링이 붙어 있으면(서명 URL 등) 변환 대상에서 제외.
  if (url.includes('?')) return url
  return `${url.replace(OBJECT_PATH, RENDER_PATH)}?width=${width}&quality=${quality}`
}

// 화면별 권장 폭. CSS 폭 × 2(레티나) 기준으로 잡았다.
// #root가 max-width 480px이라 전폭 요소도 480 CSS px를 넘지 않는다.
export const IMG_W = {
  LIST_THUMB: 128, // 채팅 목록 등 작은 원형 썸네일 (~56px)
  CARD_COMPACT: 320, // 3열 카드 (~150px)
  CARD: 480, // 홈 2열 카드 (~225px)
  HERO: 720, // 전폭 슬라이더 (~360px)
}
