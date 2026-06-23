// 백엔드 응답 텍스트에 박혀 있는 {userName} placeholder 를 사용자 닉네임으로 치환.
// 한국어 격조사 자동 변환 — 이름 받침 유무에 따라 이/가, 을/를, 와/과 등 처리.
// 서버 src/lib/ai.js 의 renderUserNameTokens 동일 로직 (Korean grammar parity).
//
// API 응답 인터셉터에서 호출 (lib/api.js). 컴포넌트 코드는 별도 처리 X.

export function renderUserName(text, userName) {
  if (!text || typeof text !== 'string') return text
  // placeholder 가 없으면 빠르게 통과 (성능: 대부분 응답 텍스트는 placeholder 없음)
  if (!text.includes('{userName}')) return text

  const u = userName || '유저'

  // 받침 판단 — 마지막 음절의 종성 코드
  const ch = u[u.length - 1]
  const code = ch.charCodeAt(0)
  const isHangul = code >= 0xac00 && code <= 0xd7a3
  const hasJong = isHangul ? (code - 0xac00) % 28 !== 0 : true // 비한글은 보수적으로 받침 있다고 가정

  return text.replace(
    /\{userName\}(이가|이를|이한테|한테|가|을|를|와|과|은|는|이|아|야)?/g,
    (_, josa) => {
      if (!josa) return u
      if (josa === '이가' || josa === '가') return u + (hasJong ? '이가' : '가')
      if (josa === '이를' || josa === '를' || josa === '을') return u + (hasJong ? '이를' : '를')
      if (josa === '이한테' || josa === '한테') return u + (hasJong ? '이한테' : '한테')
      if (josa === '와' || josa === '과') return u + (hasJong ? '과' : '와')
      if (josa === '은' || josa === '는') return u + (hasJong ? '은' : '는')
      if (josa === '이') return u + (hasJong ? '이' : '')
      if (josa === '아' || josa === '야') return u + (hasJong ? '아' : '')
      return u + josa
    },
  )
}

// 임의 깊이 객체/배열의 모든 문자열 필드에서 {userName} 치환.
// 원본 mutate 안 함 — 새 객체 반환. 토큰 없으면 원본 그대로 (얕은 복사도 X).
export function transformUserNameTokens(obj, userName) {
  if (typeof obj === 'string') return renderUserName(obj, userName)
  if (Array.isArray(obj)) {
    let mutated = false
    const next = obj.map((v) => {
      const nv = transformUserNameTokens(v, userName)
      if (nv !== v) mutated = true
      return nv
    })
    return mutated ? next : obj
  }
  if (obj && typeof obj === 'object') {
    let mutated = false
    const next = {}
    for (const [k, v] of Object.entries(obj)) {
      const nv = transformUserNameTokens(v, userName)
      if (nv !== v) mutated = true
      next[k] = nv
    }
    return mutated ? next : obj
  }
  return obj
}
