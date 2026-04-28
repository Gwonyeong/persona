import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import TagFilterBar from '../../components/TagFilterBar'
import useTagFilter from '../../hooks/useTagFilter'
import { getTagLabel } from '../../lib/tagLabel'
// import AdBanner from '../../components/AdBanner'

const LANGUAGES = [
  { code: 'ko', flag: 'kr', label: '한국어' },
  { code: 'en', flag: 'us', label: 'English' },
  { code: 'ja', flag: 'jp', label: '日本語' },
]

function getImageUrl(filePath) {
  if (!filePath) return null
  // Supabase public URL은 그대로 사용
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function Home() {
  const { t, i18n: i18nInstance } = useTranslation()
  const { token, masks, setMasks } = useStore()
  const [characters, setCharacters] = useState([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('default')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [showLangModal, setShowLangModal] = useState(false)
  const { selectedTags, tagCategories, applyTags, filterByTags } = useTagFilter('homeFilter')
  const navigate = useNavigate()

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language?.split('-')[0]) || LANGUAGES[1]

  const changeLanguage = async (code) => {
    await i18n.changeLanguage(code)
    setShowLangModal(false)
    if (token) {
      api.put('/auth/language', { language: code }).catch(() => {})
    }
  }

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
    if (sort !== 'default') params.set('sort', sort)
    api.get(`/characters?${params}`).then(({ characters }) => setCharacters(characters))
  }, [search, sort, i18nInstance.language])

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLangModal(true)}
              className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-gray-700 hover:ring-gray-500 transition-all"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <img
                src={`https://flagcdn.com/w80/${currentLang.flag}.png`}
                alt={currentLang.label}
                className="w-full h-full object-cover"
              />
            </button>
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

        </div>

        {/* 정렬 탭 + 필터 */}
        <div className="flex items-center gap-2 pb-2">
          <div className="flex gap-1.5">
            {['default', 'popular', 'follow'].map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sort === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t(`home.sort.${key}`)}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0">
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
                {/* TTS 마이크 배지 */}
                {c.voiceId && (
                  <div
                    className="absolute top-2 left-2 z-[1] w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center ring-1 ring-emerald-400/60"
                    style={{ boxShadow: '0 0 8px 2px rgba(16, 185, 129, 0.7), 0 0 16px 4px rgba(16, 185, 129, 0.35)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-300" style={{ filter: 'drop-shadow(0 0 2px rgba(16, 185, 129, 0.9))' }}>
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
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

      {/* 언어 선택 모달 */}
      {showLangModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLangModal(false)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full max-w-xs">
            <h2 className="text-base font-bold text-white text-center mb-4">Language</h2>
            <div className="flex flex-col gap-1.5">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    currentLang.code === lang.code
                      ? 'bg-indigo-600/15 border border-indigo-500/50'
                      : 'bg-gray-800/50 border border-gray-700 hover:border-gray-600'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-black/20 flex-shrink-0">
                    <img
                      src={`https://flagcdn.com/w80/${lang.flag}.png`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className={`text-sm font-medium ${currentLang.code === lang.code ? 'text-indigo-300' : 'text-gray-200'}`}>
                    {lang.label}
                  </span>
                  {currentLang.code === lang.code && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-indigo-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
