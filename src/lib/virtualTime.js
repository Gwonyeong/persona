// 채팅 내 가상 시간(virtualTime) 표시 현지화.
// 저장값·LLM 입출력은 항상 한국어 토큰(weekday '금', season '초가을', dayPart '저녁')으로 유지되고,
// 여기서 "표시할 때만" 언어별로 변환한다. (저장값을 바꾸면 LLM 프롬프트 어휘와 어긋나므로 표시 계층에서만 처리.)
//
// 대상 언어: ko(원본) / en / ja. 알 수 없는 토큰은 원문 그대로 폴백.

const WEEKDAY = {
  '월': { en: 'Mon', ja: '月' },
  '화': { en: 'Tue', ja: '火' },
  '수': { en: 'Wed', ja: '水' },
  '목': { en: 'Thu', ja: '木' },
  '금': { en: 'Fri', ja: '金' },
  '토': { en: 'Sat', ja: '土' },
  '일': { en: 'Sun', ja: '日' },
}

const SEASON = {
  '봄': { en: 'Spring', ja: '春' },
  '초여름': { en: 'Early Summer', ja: '初夏' },
  '한여름': { en: 'Midsummer', ja: '真夏' },
  '늦여름': { en: 'Late Summer', ja: '晩夏' },
  '초가을': { en: 'Early Autumn', ja: '初秋' },
  '늦가을': { en: 'Late Autumn', ja: '晩秋' },
  '초겨울': { en: 'Early Winter', ja: '初冬' },
  '한겨울': { en: 'Midwinter', ja: '真冬' },
}

const DAYPART = {
  '새벽': { en: 'Dawn', ja: '明け方' },
  '아침': { en: 'Morning', ja: '朝' },
  '오전': { en: 'Late Morning', ja: '午前' },
  '점심': { en: 'Noon', ja: '昼' },
  '오후': { en: 'Afternoon', ja: '午後' },
  '저녁': { en: 'Evening', ja: '夕方' },
  '밤': { en: 'Night', ja: '夜' },
  '심야': { en: 'Late Night', ja: '深夜' },
}

// "N월 X째주" → 언어별. 주차 서수: 첫/둘/셋/넷/다섯(째), 마지막.
const WEEK_ORD = {
  '첫': 1, '둘': 2, '셋': 3, '넷': 4, '다섯': 5,
}
const EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EN_ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' }

function normLang(lang) {
  const l = String(lang || 'ko').slice(0, 2)
  return l === 'en' || l === 'ja' ? l : 'ko'
}

function mapToken(map, tok, lang) {
  if (!tok) return null
  if (lang === 'ko') return tok
  return map[tok]?.[lang] || tok
}

function formatWeekday(wd, lang) {
  if (!wd) return null
  if (lang === 'ko') return `${wd}요일`
  if (lang === 'ja') return `${WEEKDAY[wd]?.ja || wd}曜日`
  return WEEKDAY[wd]?.en || wd
}

function formatHour(h, lang) {
  if (!Number.isInteger(h)) return null
  if (lang === 'ko') return `${h}시`
  if (lang === 'ja') return `${h}時`
  // en: 12시간제
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${period}`
}

function formatMonthDay(md, lang) {
  if (!md) return null
  if (lang === 'ko') return md
  const m = /^(\d{1,2})월\s*(첫|둘|셋|넷|다섯)째?\s*주$/.exec(String(md).trim())
  if (!m) return md // 파싱 불가 형식은 원문 폴백
  const month = parseInt(m[1], 10)
  const ord = WEEK_ORD[m[2]]
  if (!month || !ord || month < 1 || month > 12) return md
  if (lang === 'ja') return `${month}月第${ord}週`
  return `${EN_ORD[ord]} week of ${EN_MONTH[month - 1]}`
}

// virtualTime 객체 → 표시용 파트 배열(순서: 계절·월주차·요일·시간대·시각). 빈 값 제거.
export function formatVirtualTimeParts(vt, lang) {
  if (!vt || typeof vt !== 'object') return []
  const l = normLang(lang)
  return [
    mapToken(SEASON, vt.season, l),
    formatMonthDay(vt.monthDay, l),
    formatWeekday(vt.weekday, l),
    mapToken(DAYPART, vt.dayPart, l),
    formatHour(vt.hour, l),
  ].filter(Boolean)
}
