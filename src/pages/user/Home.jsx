import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import MaskChargeModal from '../../components/MaskChargeModal'
import AdBanner from '../../components/AdBanner'

function getImageUrl(filePath) {
  if (!filePath) return null
  // Supabase public URL은 그대로 사용
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function Home() {
  const { token, masks, setMasks } = useStore()
  const [characters, setCharacters] = useState([])
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
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
    if (selectedTag) params.set('tag', selectedTag)
    api.get(`/characters?${params}`).then(({ characters }) => setCharacters(characters))
  }, [search, selectedTag])

  const GENRES = [
    '일상/로맨스', '미스테리/RPG', '학원물', '현대 판타지',
    '로맨스 판타지', '무협/시대극', '집착/피폐', 'BL', '철벽/혐관', '다각관계',
  ]

  return (
    <div className="px-4 pt-4 pb-2">
      <Helmet>
        <title>Pesona - AI 캐릭터 채팅 플랫폼</title>
        <meta name="description" content="감정 표현이 가능한 AI 캐릭터와 실시간으로 대화하세요. 다양한 장르의 독창적인 캐릭터를 만나보세요." />
        <meta property="og:title" content="Pesona - AI 캐릭터 채팅 플랫폼" />
        <meta property="og:description" content="감정 표현이 가능한 AI 캐릭터와 실시간으로 대화하세요." />
      </Helmet>

      {/* 헤더 + 검색 + 필터 + 광고 (sticky) */}
      <div className="sticky top-0 z-10 bg-gray-950 pb-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Pesona</h1>
          {token && (
            <button
              onClick={() => setShowChargeModal(true)}
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
              placeholder="캐릭터 검색..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* 장르 필터 */}
          <div className="flex gap-1 overflow-x-auto pb-3 scrollbar-hide">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap font-medium transition-colors ${
                !selectedTag ? 'bg-indigo-600 text-white' : 'text-gray-500'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              전체
            </button>
            {GENRES.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedTag(selectedTag === genre ? null : genre)}
                className={`px-1 py-1 rounded-full text-xs whitespace-nowrap font-medium transition-colors ${
                  selectedTag === genre ? 'bg-indigo-600 text-white px-2.5' : 'text-gray-500'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        {/* 광고 */}
        <AdBanner slot="3193498609" />
      </div>

      {/* 캐릭터 그리드 */}
      {characters.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          <p>등록된 캐릭터가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {characters.map((c) => {
            const thumb = c.styles?.[0]?.images?.[0]
            const thumbUrl = getImageUrl(thumb?.filePath)

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/characters/${c.id}`)}
                className="relative rounded-xl overflow-hidden text-left hover:ring-1 hover:ring-gray-700 transition-all"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
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
                    {c.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-white/15 rounded text-[10px] text-gray-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}


      {showChargeModal && <MaskChargeModal onClose={() => setShowChargeModal(false)} />}
    </div>
  )
}
