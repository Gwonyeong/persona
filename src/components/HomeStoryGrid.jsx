import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import StoryGridCard from './StoryGridCard'

// 홈 — 최근 공개 스토리 썸네일 그리드 (한 줄 3개 × 최대 2줄). 전부 보려면 헤더의 "전체보기" → /storylines.
// 데이터는 /storylines/recent (완료한 스토리 제외, publishedAt 최신순). 썸네일은 서버가
// thumbnailImage → coverImage → 캐릭터 프로필 순으로 폴백해서 내려준다.
const COLS = 3
const MAX_ROWS = 2
const LIMIT = COLS * MAX_ROWS

export default function HomeStoryGrid() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [stories, setStories] = useState(null)

  // 스토리 번역 데이터가 채워지기 전까지는 한국어 UI 에서만 노출 (CharacterDetail 과 같은 게이트).
  // 어드민 번역 탭으로 공개 스토리 번역이 끝나면 이 조건을 제거한다.
  const isKoreanUi = (i18n.language || '').startsWith('ko')

  useEffect(() => {
    if (!isKoreanUi) return
    api
      .get(`/storylines/recent?limit=${LIMIT}`)
      .then(({ storylines }) => setStories((storylines || []).slice(0, LIMIT)))
      .catch(() => setStories([]))
  }, [isKoreanUi])

  if (!isKoreanUi || !stories || stories.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <h2 className="text-lg font-bold text-white">{t('home.recentStories')}</h2>
        <span
          className="px-1.5 py-[1px] bg-red-500 text-white text-[9px] font-bold rounded-md leading-none"
          style={{ letterSpacing: '0.03em' }}
        >
          NEW
        </span>
        <button
          onClick={() => navigate('/storylines')}
          className="ml-auto flex items-center gap-0.5 text-xs text-gray-400 active:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {t('storyline.viewAll')}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stories.map((s) => <StoryGridCard key={s.id} story={s} />)}
      </div>
    </div>
  )
}
