import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import i18n from '../../i18n'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import TagFilterBar from '../../components/TagFilterBar'
import useTagFilter from '../../hooks/useTagFilter'
import usePrefersReducedData from '../../hooks/usePrefersReducedData'
import HomeBannerSlider from '../../components/HomeBannerSlider'
import RecentStoriesRow from '../../components/RecentStoriesRow'
import FeaturedCharacterSlider from '../../components/FeaturedCharacterSlider'
import RecentJoinedRow from '../../components/RecentJoinedRow'
import CharacterCard from '../../components/CharacterCard'
import MaskIcon from '../../components/MaskIcon'
// import AdBanner from '../../components/AdBanner'

const LANGUAGES = [
  { code: 'ko', flag: 'kr', label: '한국어' },
  { code: 'en', flag: 'us', label: 'English' },
  { code: 'ja', flag: 'jp', label: '日本語' },
]

export default function Home() {
  const { t, i18n: i18nInstance } = useTranslation()
  const { token, masks, setMasks, user, setSafetyMode } = useStore()
  const adultVerified = !!user?.adultVerified
  // 비로그인 유저도 항상 SAFE(ON)로 표시.
  const safetyMode = !token ? true : user?.safetyMode !== false
  const [safetyBusy, setSafetyBusy] = useState(false)

  const toggleSafety = async () => {
    if (!token) {
      navigate('/login')
      return
    }
    if (safetyMode && !adultVerified) {
      // ON → OFF 시도하는데 미인증 → 본인인증 페이지로
      navigate('/adult-verify')
      return
    }
    if (safetyBusy) return
    setSafetyBusy(true)
    const next = !safetyMode
    try {
      const { safetyMode: confirmed } = await api.put('/auth/safety', { safetyMode: next })
      setSafetyMode(confirmed)
    } catch (e) {
      // 서버에서 거부된 경우 (인증 만료 등)
      console.warn('safety toggle failed', e)
    } finally {
      setSafetyBusy(false)
    }
  }
  const [characters, setCharacters] = useState([])
  const [featuredCharacters, setFeaturedCharacters] = useState([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('default')
  const [showLangModal, setShowLangModal] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [appVersion, setAppVersion] = useState(null)
  const { selectedTags, tagCategories, applyTags, filterByTags } = useTagFilter('homeFilter')
  const reducedData = usePrefersReducedData()
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
    if (token) {
      api.get('/masks/balance').then(({ masks }) => setMasks(masks)).catch(() => {})
      api.get('/notifications/unread-count').then(({ count }) => setUnreadNotifCount(count)).catch(() => {})
    }
  }, [token])

  // 앱 버전 — 어느 빌드를 깔았는지 디버깅용으로 노출 (네이티브에서만 정확한 versionName/build를 알 수 있음)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app')
        .then(({ App }) => App.getInfo())
        .then((info) => setAppVersion(`v${info.version} (${info.build})`))
        .catch(() => setAppVersion('app'))
    } else {
      setAppVersion('web')
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (sort !== 'default') params.set('sort', sort)
    api.get(`/characters?${params}`).then(({ characters }) => setCharacters(characters))
  }, [search, sort, i18nInstance.language, safetyMode])

  // 1:1 슬라이더는 search/sort/filter와 무관 — AROUSED 이미지 보유 캐릭터를
  // 가장 최근 흥분 이미지 업로드 시점 기준 최신순으로 로드.
  useEffect(() => {
    api
      .get('/characters/featured?limit=5')
      .then(({ characters }) => setFeaturedCharacters(characters || []))
      .catch(() => setFeaturedCharacters([]))
  }, [i18nInstance.language, safetyMode])

  // 최근 합류 4명 — 가로 슬라이드에서만 노출, 하단 그리드에서는 제외
  const recentJoined = useMemo(() => {
    return [...characters]
      .filter((c) => c.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 4)
  }, [characters])

  const recentJoinedIds = useMemo(
    () => new Set(recentJoined.map((c) => c.id)),
    [recentJoined]
  )

  const gridCharacters = useMemo(
    () => characters.filter((c) => !recentJoinedIds.has(c.id)),
    [characters, recentJoinedIds]
  )

  return (
    <div className="relative px-4 pt-4 pb-2">
      <Helmet>
        <title>{t('home.title')}</title>
        <meta name="description" content={t('home.metaDescription')} />
        <meta property="og:title" content={t('home.ogTitle')} />
        <meta property="og:description" content={t('home.ogDescription')} />
      </Helmet>

      {/* 헤더 + 검색 + 필터 + 광고 */}
      <div className="bg-gray-950 pb-4 mb-4 -mx-4 px-4 border-b border-gray-700">
        {/* 검색 모달 — 헤더 영역에 absolute로 떠 있음 (sticky 부모를 따라 항상 최상단) */}
        {showSearchModal && (
          <div
            className="absolute top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800 -mx-4 px-4 pt-4 pb-3"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearchModal(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 flex-shrink-0 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('home.searchPlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') setShowSearchModal(false) }}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-9 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="Clear"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-300"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Pesona</h1>
          <div className="flex items-center gap-2">
            {/* 언어 깃발 버튼 — 마이페이지로 이동 예정
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
            */}
            <button
              onClick={() => setShowSearchModal(true)}
              aria-label={t('home.searchPlaceholder')}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {token && (
              <button
                onClick={() => navigate('/notifications')}
                aria-label={t('notifications.title')}
                className="relative w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unreadNotifCount > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-gray-950" />
                )}
              </button>
            )}
            {token && (
              <button
                onClick={() => navigate('/mask-shop')}
                className="flex items-center gap-1.5"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', background: 'transparent' }}
              >
                <MaskIcon className="text-xl" />
                <span className="text-sm font-semibold text-gray-100">{masks}</span>
              </button>
            )}
          </div>
        </div>

        {/* 광고 배너 (어드민 관리) */}
        <HomeBannerSlider />

        {/* 최근 공개된 스토리 */}
        <RecentStoriesRow />

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
          <button
            onClick={toggleSafety}
            disabled={safetyBusy}
            aria-label="Safety toggle"
            title={safetyMode ? 'Safety ON' : 'Safety OFF'}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors flex-shrink-0 ${
              safetyMode
                ? 'bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-rose-600/15 text-rose-300 ring-1 ring-rose-500/40'
            } ${safetyBusy ? 'opacity-50' : ''}`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              {safetyMode ? (
                <>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </>
              ) : (
                <>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                </>
              )}
            </svg>
            <span>{safetyMode ? 'SAFE' : '19+'}</span>
          </button>
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

      {/* 검색 모달 오버레이 — sticky 헤더 아래 영역만 어둡게 처리 */}
      {showSearchModal && (
        <div
          className="absolute inset-x-0 bottom-0 top-0 z-40 bg-black/40"
          onClick={() => setShowSearchModal(false)}
        />
      )}

      {/* 추천 캐릭터 슬라이더 — AROUSED 표정 이미지 보유 캐릭터, 최신 업로드순 */}
      <FeaturedCharacterSlider
        characters={featuredCharacters}
        reducedData={reducedData}
      />

      {/* 최근에 합류한 페소나들 — 최근 생성된 4명 가로 슬라이드 */}
      <RecentJoinedRow
        characters={recentJoined}
        reducedData={reducedData}
      />

      {/* 캐릭터 그리드 — 최근 합류 4명 제외 */}
      {filterByTags(gridCharacters).length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p>{t('home.emptyCharacters')}</p>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-medium text-gray-400 mb-2">
            다른 매력적인 페소나들
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {filterByTags(gridCharacters).map((c) => (
              <CharacterCard
                key={c.id}
                character={c}
                reducedData={reducedData}
              />
            ))}
          </div>
        </>
      )}

      {/* 사업자 정보 푸터 */}
      <footer className="mt-8 pt-6 pb-4 border-t border-gray-800 text-[11px] text-gray-500 leading-relaxed">
        <p className="font-semibold text-gray-400 mb-2">사업자 정보</p>
        <dl className="space-y-1">
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">상호</dt>
            <dd>파드켓</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">대표자</dt>
            <dd>조권영</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">사업자등록번호</dt>
            <dd>467-15-02791</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">주소</dt>
            <dd>서울특별시 마포구 월드컵북로6길 19-10</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">유선전화</dt>
            <dd>070-8094-0654</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 flex-shrink-0 text-gray-600">통신판매신고번호</dt>
            <dd>2025-서울마포-2857</dd>
          </div>
        </dl>
        {appVersion && (
          <p className="mt-3 text-center text-[10px] text-gray-700">Pesona {appVersion}</p>
        )}
      </footer>

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
