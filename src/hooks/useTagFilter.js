import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function useTagFilter(storagePrefix = 'feedFilter') {
  const [selectedTags, setSelectedTags] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${storagePrefix}_tags`)) || [] }
    catch { return [] }
  })
  const [tagCategories, setTagCategories] = useState([])

  useEffect(() => {
    api.get('/characters/tags').then(({ categories }) => setTagCategories(categories)).catch(() => {})
  }, [])

  const applyTags = (tags) => {
    setSelectedTags(tags)
    localStorage.setItem(`${storagePrefix}_tags`, JSON.stringify(tags))
  }

  const filterByTags = (items, getTagsFn = (item) => item.tags) => {
    if (selectedTags.length === 0) return items
    // 같은 카테고리(prefix) 내 OR, 카테고리 간 AND
    const grouped = {}
    for (const tag of selectedTags) {
      const prefix = tag.split(':')[0]
      if (!grouped[prefix]) grouped[prefix] = []
      grouped[prefix].push(tag)
    }
    return items.filter((item) => {
      const tags = getTagsFn(item) || []
      return Object.values(grouped).every((group) => group.some((tag) => tags.includes(tag)))
    })
  }

  return { selectedTags, tagCategories, applyTags, filterByTags }
}
