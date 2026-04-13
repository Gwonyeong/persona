// 태그 값("age:20-25")을 사람이 읽기 좋은 라벨로 변환
// tagCategories는 서버에서 받아온 카테고리 배열

let cachedMap = null
let cachedCategories = null

function buildMap(tagCategories) {
  if (cachedCategories === tagCategories && cachedMap) return cachedMap
  cachedCategories = tagCategories
  cachedMap = new Map()
  for (const cat of tagCategories) {
    for (const opt of cat.options) {
      cachedMap.set(opt.value, { label: opt.label, flag: opt.flag || null })
    }
  }
  return cachedMap
}

export function getTagInfo(tag, tagCategories) {
  if (!tagCategories?.length) return { label: tag, flag: null }
  const map = buildMap(tagCategories)
  const entry = map.get(tag)
  if (!entry) return { label: tag, flag: null }
  return entry
}

export function getTagLabel(tag, tagCategories) {
  return getTagInfo(tag, tagCategories).label
}
