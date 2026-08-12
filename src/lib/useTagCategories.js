import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from './api'

// /characters/tags 를 앱 전체에서 공유(모듈 캐시).
//
// 태그 라벨은 서버가 Accept-Language 를 보고 언어별로 내려준다. 따라서 캐시는
// 반드시 **언어별로** 잡아야 한다. 예전엔 단일 캐시라, 앱에서 언어를 바꿔도
// 처음 받아온 언어(대개 한국어) 라벨이 그대로 남아 홈 카드 태그만 한글로 보였다.
const cache = new Map() // lang -> categories
const inflight = new Map() // lang -> Promise

function fetchCategories(lang) {
  if (cache.has(lang)) return Promise.resolve(cache.get(lang))
  if (inflight.has(lang)) return inflight.get(lang)

  const p = api
    .get('/characters/tags')
    .then(({ categories }) => {
      const list = categories || []
      cache.set(lang, list)
      return list
    })
    .catch(() => {
      // 실패는 캐시하지 않는다 — 다음 마운트에서 다시 시도할 수 있게.
      return []
    })
    .finally(() => inflight.delete(lang))

  inflight.set(lang, p)
  return p
}

export function useTagCategories() {
  const { i18n } = useTranslation()
  const lang = i18n.language || 'ko'
  const [categories, setCategories] = useState(() => cache.get(lang) || [])

  useEffect(() => {
    let mounted = true
    // 언어가 바뀌면 그 언어의 캐시로 즉시 교체하고, 없으면 받아온다.
    setCategories(cache.get(lang) || [])
    fetchCategories(lang).then((cats) => mounted && setCategories(cats))
    return () => {
      mounted = false
    }
  }, [lang])

  return categories
}
