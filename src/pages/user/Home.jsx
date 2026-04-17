import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import TagFilterBar from '../../components/TagFilterBar'
import useTagFilter from '../../hooks/useTagFilter'
import { getTagLabel } from '../../lib/tagLabel'
// import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  // Supabase public URL은 그대로 사용
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function Home() {
  const { t } = useTranslation()
  const { token, masks, setMasks } = useStore()
  const [characters, setCharacters] = useState([])
  const [search, setSearch] = useState('')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const { selectedTags, tagCategories, applyTags, filterByTags } = useTagFilter('homeFilter')
  const navigate = useNavigate()

  useEffect(() => {
    const scrollEl = document.querySelector('.user-layout > main')
    if (!scrollEl) return
    const onScroll = () => {
      setHeaderCollapsed(scrollEl.scrollTop > 10)
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (token) {
      api.get('/masks/balance').then(({ masks }) => setMasks(masks)).catch(() => {})
    }
  }, [token])

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    api.get(`/characters?${params}`).then(({ characters }) => setCharacters(characters))
  }, [search])

  return (
    <div className="px-4 pt-4 pb-2">
      <Helmet>
        <title>{t('home.title')}</title>
        <meta name="description" content={t('home.metaDescription')} />
        <meta property="og:title" content={t('home.ogTitle')} />
        <meta property="og:description" content={t('home.ogDescription')} />
      </Helmet>

      {/* 헤더 + 검색 + 필터 + 광고 (sticky) */}
      <div className="sticky top-0 z-10 bg-gray-950 pb-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Pesona</h1>
          {token && (
            <button
              onClick={() => navigate('/my')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-full hover:border-gray-600 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="text-sm">🎭</span>
              <span className="text-sm font-semibold text-gray-100">{masks}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-indigo-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {/* 검색바 + 장르 필터 (스크롤 방향에 따라 접힘) */}
        <div
          style={{ display: headerCollapsed ? 'none' : 'block' }}
        >
          {/* 검색바 */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* 태그 필터 */}
          <div className="pb-3">
            <TagFilterBar
              selectedTags={selectedTags}
              tagCategories={tagCategories}
              onApply={applyTags}
            />
          </div>
        </div>

        {/* 광고 */}
        {/* <AdBanner slot="3193498609" /> */}
      </div>

      {/* 캐릭터 그리드 */}
      {filterByTags(characters).length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p>{t('home.emptyCharacters')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filterByTags(characters).map((c) => {
            const thumb = c.styles?.[0]?.images?.[0]
            const thumbUrl = getImageUrl(c.profileImage) || getImageUrl(thumb?.filePath)

            const flagTag = c.tags.find((t) => t.startsWith('nationality:'))
            const flagCode = flagTag?.split(':')[1]

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/characters/${c.id}`)}
                className="relative rounded-xl overflow-hidden text-left hover:ring-1 hover:ring-gray-700 transition-all"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {/* 국기 배지 */}
                {flagCode && (
                  <div className="absolute top-2 right-2 z-[1] w-6 h-6 rounded-full overflow-hidden shadow-lg ring-1 ring-black/20">
                    <img
                      src={`https://flagcdn.com/w80/${flagCode}.png`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* 이미지 */}
                <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl text-gray-600">?</span>
                  )}
                </div>
                {/* 그라데이션 오버레이 + 정보 */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-14">
                  <p className="font-semibold text-sm truncate text-white">{c.name}</p>
                  <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{c.description}</p>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {c.tags.filter((t) => !['nationality', 'age', 'imageType', 'personality'].includes(t.split(':')[0])).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-white/15 rounded text-[10px] text-gray-200">
                        {getTagLabel(tag, tagCategories)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}
