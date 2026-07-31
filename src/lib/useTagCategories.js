import { useEffect, useState } from 'react'
import { api } from './api'

// /characters/tags 를 앱 전체에서 한 번만 불러와 공유(모듈 캐시).
let cache = null
let inflight = null

export function useTagCategories() {
  const [categories, setCategories] = useState(cache || [])

  useEffect(() => {
    if (cache) {
      setCategories(cache)
      return
    }
    if (!inflight) {
      inflight = api
        .get('/characters/tags')
        .then(({ categories }) => (cache = categories || []))
        .catch(() => (cache = []))
    }
    let mounted = true
    inflight.then((cats) => mounted && setCategories(cats))
    return () => {
      mounted = false
    }
  }, [])

  return categories
}
