import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { getTagInfo } from '../../lib/tagLabel'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'
import MaskIcon from '../../components/MaskIcon'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function getCharacterOnlineStatus(activeHours) {
  if (!activeHours?.schedule) return 'free'
  const hour = new Date().getHours()
  const slot = activeHours.schedule.find((s) => {
    if (s.start < s.end) return hour >= s.start && hour < s.end
    return hour >= s.start || hour < s.end
  })
  return slot?.status || 'free'
}

import StoryViewer from '../../components/StoryViewer'
import GalleryGrid from '../../components/GalleryGrid'
import GalleryUnlockModal from '../../components/GalleryUnlockModal'
import ImageSlideViewer from '../../components/ImageSlideViewer'
import ReportModal from '../../components/ReportModal'
import OnboardingSpotlight from '../../components/OnboardingSpotlight'
import useBackHandler from '../../hooks/useBackHandler'
import { shouldShowReview, requestInAppReview, markReviewShown } from '../../lib/review'

export default function CharacterDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { token, user, setUser } = useStore()
  const [character, setCharacter] = useState(null)
  const [existingConv, setExistingConv] = useState(null)
  const [starting, setStarting] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showStory, setShowStory] = useState(false)
  const [storyIndex, setStoryIndex] = useState(0)
  const [storyViewed, setStoryViewed] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]')).has(parseInt(id)) }
    catch { return false }
  })
  const [isFollowing, setIsFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState('feed')
  const [galleryContents, setGalleryContents] = useState([])
  const [gallerySlideViewer, setGallerySlideViewer] = useState(null)
  const [unlockTarget, setUnlockTarget] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [tagCategories, setTagCategories] = useState([])
  const [storylines, setStorylines] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [toast, setToast] = useState(null)
  const [slideTick, setSlideTick] = useState(0)
  const storyTimerRef = useRef(null)
  const handleStorylineClick = (s) => {
    if (!token) {
      goToLogin(navigate)
      return
    }
    navigate(`/storylines/${s.id}`)
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const id = setInterval(() => setSlideTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  const stories = character?.stories || []
  const hasStories = stories.length > 0

  // 모달/오버레이 뒤로가기 처리
  useBackHandler(showStory, () => {
    setShowStory(false)
    setStoryViewed(true)
    try {
      const viewed = new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]'))
      viewed.add(parseInt(id))
      sessionStorage.setItem('viewedStories', JSON.stringify([...viewed]))
    } catch {}
  })
  useBackHandler(showResetModal, () => setShowResetModal(false))
  useBackHandler(!!gallerySlideViewer, () => setGallerySlideViewer(null))
  useBackHandler(!!unlockTarget, () => setUnlockTarget(null))
  useBackHandler(showReport, () => setShowReport(false))

  useEffect(() => {
    api.get(`/characters/${id}`).then(({ character }) => {
      setCharacter(character)
      window.gtag?.('event', 'character_view', { character_id: id, character_name: character.name })
    })
    api.get('/characters/tags').then(({ categories }) => setTagCategories(categories)).catch(() => {})
    api.get(`/characters/${id}/gallery`)
      .then(({ galleryContents }) => setGalleryContents(galleryContents || []))
      .catch(() => setGalleryContents([]))
    api.get(`/characters/${id}/storylines`)
      .then(({ scenarios, storylines }) => {
        setScenarios(scenarios || [])
        setStorylines(storylines || [])
      })
      .catch(() => { setScenarios([]); setStorylines([]) })
  }, [id, i18n.language])

  useEffect(() => {
    if (!token) return
    api.get(`/conversations/check/${id}`)
      .then((data) => {
        if (data.exists) setExistingConv(data)
        else setExistingConv(null)
      })
      .catch(() => setExistingConv(null))
    api.get(`/follows/${id}`)
      .then(({ following }) => setIsFollowing(following))
      .catch(() => {})
  }, [id, token])

  const toggleFollow = async () => {
    if (!token) { goToLogin(navigate); return }
    try {
      const { following } = await api.post(`/follows/${id}`)
      setIsFollowing(following)
      setCharacter(prev => ({
        ...prev,
        followerCount: (prev.followerCount || 0) + (following ? 1 : -1)
      }))
    } catch (error) {
      console.error('Toggle follow error:', error)
    }
  }

  const startChat = async () => {
    if (!token) { goToLogin(navigate); return }
    setStarting(true)
    try {
      const { conversation, conversationCount } = await api.post('/conversations', { characterId: parseInt(id) })
      window.gtag?.('event', 'chat_start', { character_id: id, conversation_id: conversation.id })
      if (shouldShowReview(conversationCount)) {
        setShowReviewModal(true)
        // 리뷰 모달 후 채팅으로 이동
        window.__pendingChatId = conversation.id
      } else {
        navigate(`/chats/${conversation.id}`)
      }
    } catch (error) {
      console.error(error)
      if (error?.data?.error === 'CHARACTER_LIMIT_REACHED') {
        setToast(t('character.freeLimitReached', { limit: error.data.limit }))
      }
      setStarting(false)
    }
  }

  const resumeChat = () => {
    if (!token) { goToLogin(navigate); return }
    if (existingConv) navigate(`/chats/${existingConv.conversationId}`)
  }

  const resetChat = async () => {
    setShowResetModal(false)
    setStarting(true)
    try {
      const { conversation } = await api.post(`/conversations/${existingConv.conversationId}/reset`)
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  // 캐릭터 상세 투어 (early return 위에 hook 호출 — Rules of Hooks)
  const tourActive = !!user && !user.onboardingState?.characterTour
  const tourSteps = useMemo(() => [
    { page: 'characterTour', key: 'follow', target: '[data-onboarding-target="follow"]', caption: t('characterTour.follow') },
    { page: 'characterTour', key: 'message', target: '[data-onboarding-target="message"]', caption: t('characterTour.message') },
    {
      page: 'characterTour', key: 'feedTab',
      target: '[data-onboarding-target="tab-feed"]',
      caption: t('characterTour.feedTab'),
      onEnter: () => setActiveTab('feed'),
    },
    {
      page: 'characterTour', key: 'affinityTab',
      target: '[data-onboarding-target="tab-affinity"]',
      caption: t('characterTour.affinityTab', { name: user?.name || '' }),
      onEnter: () => setActiveTab('affinity'),
    },
    {
      page: 'characterTour', key: 'missionTab',
      target: '[data-onboarding-target="tab-mission"]',
      caption: t('characterTour.missionTab'),
      onEnter: () => setActiveTab('mission'),
    },
    { page: 'characterTour', key: 'reset', target: '[data-onboarding-target="restart"]', caption: t('characterTour.reset') },
  ], [user?.name, t])

  if (!character) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">{t('common.loading')}</div>
  }

  const mainStyle = character.styles?.[0]
  const mainImage = mainStyle?.images?.find((i) => i.emotion === 'NEUTRAL') || mainStyle?.images?.[0]
  const profileUrl = getImageUrl(character.profileImage) || getImageUrl(mainImage?.filePath)
  const onlineStatus = getCharacterOnlineStatus(character.activeHours)

  const feedPosts = character.feedPosts || []
  const completeTour = () => {
    setUser({
      ...user,
      onboardingState: { ...(user.onboardingState || {}), characterTour: true },
    })
    api.patch('/auth/onboarding', { key: 'characterTour' }).catch(() => {})
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100">
      <Helmet>
        <title>{character.name} - Pesona</title>
        <meta name="description" content={character.description} />
      </Helmet>

      {/* 헤더 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5 flex-1">
          <span className="font-bold text-base">{character.name}</span>
          {onlineStatus === 'free' && (
            <div className="w-2 h-2 rounded-full bg-green-500" />
          )}
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="text-gray-500 hover:text-red-400 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title={t('report.title')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </header>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-auto">
        {/* 프로필 섹션 */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-6">
            {/* 프로필 이미지 (스토리가 있으면 그라데이션 링) */}
            <button
              onClick={() => { if (hasStories) { setStoryIndex(0); setShowStory(true) } }}
              className="flex-shrink-0"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className={`w-[90px] h-[90px] rounded-full p-[3px] ${hasStories ? (storyViewed ? 'bg-gray-600' : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400') : ''}`}>
                <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                  <div className="w-full h-full rounded-full bg-gray-800 overflow-hidden">
                    {profileUrl ? (
                      <img src={profileUrl} alt={character.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">?</div>
                    )}
                  </div>
                </div>
              </div>
            </button>

            {/* 통계 */}
            <div className="flex flex-1 justify-around">
              <div className="text-center">
                <p className="text-lg font-bold">{feedPosts.length}</p>
                <p className="text-xs text-gray-400">{t('character.posts')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{(character.followerCount || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">{t('character.followers')}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{(character.followingCount || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">{t('character.following')}</p>
              </div>
            </div>
          </div>

          {/* 이름 + 소개 */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm">{character.name}</p>
              {(existingConv?.affinity ?? 0) >= 20 && (
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-600/20 text-indigo-400 rounded-full">
                  {isFollowing ? t('character.mutualFollow') : t('character.followsYou')}
                </span>
              )}
            </div>
            {character.concept && (
              <p className="text-sm text-gray-400 mt-0.5">{character.concept}</p>
            )}
            {character.description && (
              <p className="text-sm text-gray-300 mt-1 leading-relaxed">{character.description}</p>
            )}
            {character.tags?.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {character.tags.filter((t) => !['nationality', 'age', 'imageType', 'personality'].includes(t.split(':')[0])).map((tag) => {
                  const info = getTagInfo(tag, tagCategories)
                  return (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs text-indigo-400">
                      {info.flag && (
                        <img
                          src={`https://flagcdn.com/w40/${info.flag}.png`}
                          alt={info.label}
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      )}
                      #{info.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={toggleFollow}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isFollowing
                    ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                    : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                data-onboarding-target="follow"
              >
                {isFollowing ? t('character.unfollow') : t('character.follow')}
              </button>
              <button
                onClick={existingConv ? resumeChat : startChat}
                disabled={starting}
                className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                data-onboarding-target="message"
              >
                {starting ? t('character.starting') : t('character.sendMessage')}
              </button>
            </div>
            {(existingConv || tourActive) && (
              <div className="flex justify-end">
                <button
                  onClick={() => existingConv && !tourActive && setShowResetModal(true)}
                  disabled={starting}
                  className="py-1.5 px-4 text-xs text-red-400 font-semibold rounded-lg border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  data-onboarding-target="restart"
                >
                  {t('character.restart')}
                </button>
              </div>
            )}
          </div>

          {/* 스토리 목록 — 시나리오 카드 + 단독 스토리 카드 혼합 노출 */}
          {(scenarios.length > 0 || storylines.length > 0) && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-200">스토리</h3>
                <span className="text-[11px] text-gray-500">{scenarios.length + storylines.length}개</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
                {/* 시나리오 카드 */}
                {scenarios.map((sc) => (
                  <button
                    key={`sc-${sc.id}`}
                    onClick={() => navigate(`/scenarios/${sc.id}`)}
                    className="flex-shrink-0 w-[180px] aspect-[9/16] rounded-xl overflow-hidden relative bg-gray-900 border border-indigo-500/40 hover:border-indigo-500 transition-colors snap-start"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {sc.thumbnailImage ? (
                      <img src={sc.thumbnailImage} alt={sc.title} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 to-purple-900/40 flex items-center justify-center text-indigo-300/40">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </div>
                    )}
                    {/* 시나리오 뱃지 + TEST 표시 */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full font-semibold">
                      시나리오
                    </div>
                    {sc.status === 'TEST' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pt-10 pb-3 text-left">
                      <p className="font-semibold text-sm text-white line-clamp-1">{sc.title}</p>
                      <p className="text-[11px] text-gray-300 mt-1">파트 {sc.partCount}개</p>
                    </div>
                  </button>
                ))}
                {/* 단독 스토리 카드 — 시나리오에 안 묶인 것만 */}
                {storylines.map((s) => {
                  const media = Array.isArray(s.premiumMedia) ? s.premiumMedia : []
                  const isMulti = media.length > 1
                  const activeIdx = isMulti ? slideTick % media.length : 0
                  const lockedMediaStyle = { filter: 'blur(3px)', transform: 'scale(1.03)' }
                  return (
                  <button
                    key={s.id}
                    onClick={() => handleStorylineClick(s)}
                    className="flex-shrink-0 w-[180px] aspect-[9/16] rounded-xl overflow-hidden relative bg-gray-900 border border-gray-800 hover:border-indigo-500 transition-colors snap-start"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* 슬라이드쇼 — premiumMedia 항목들을 페이드 회전, 잠긴 항목은 약한 블러 */}
                    {media.length > 0 ? (
                      media.map((m, idx) => {
                        const isActive = idx === activeIdx
                        const blur = !m.unlocked
                        const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`
                        return m.type === 'video' ? (
                          <video
                            key={idx}
                            src={m.url}
                            className={baseCls}
                            style={blur ? lockedMediaStyle : undefined}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            key={idx}
                            src={m.url}
                            alt=""
                            className={baseCls}
                            style={blur ? lockedMediaStyle : undefined}
                            draggable={false}
                          />
                        )
                      })
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-purple-900/30 flex items-center justify-center text-gray-700">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                      </div>
                    )}

                    {/* 상단 페이드 — 뱃지 가독성 확보 */}
                    {(s.progress?.status === 'COMPLETED' || s.progress?.status === 'IN_PROGRESS') && (
                      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                    )}

                    {s.progress?.status === 'COMPLETED' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600/90 text-white text-[10px] rounded-full font-semibold">
                        완료
                      </div>
                    )}
                    {s.progress?.status === 'IN_PROGRESS' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full font-semibold">
                        진행 중
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pt-10 pb-3 text-left">
                      <p className="font-semibold text-sm text-white line-clamp-1">{s.title}</p>
                      {s.description && (
                        <p className="text-[11px] text-gray-300 line-clamp-2 mt-1 leading-relaxed">{s.description}</p>
                      )}
                    </div>
                  </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 탭 바 */}
        <div className="border-t border-gray-800 mt-2">
          <div className="flex">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${activeTab === 'feed' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="tab-feed"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              onClick={() => setActiveTab('affinity')}
              className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${activeTab === 'affinity' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="tab-affinity"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <button
              onClick={() => setActiveTab('mission')}
              className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${activeTab === 'mission' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="tab-mission"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 피드 그리드 (3열) */}
        {activeTab === 'feed' && (
          <>
            <div className="grid grid-cols-3 gap-[1px]">
              {feedPosts.map((post) => {
                const imageList = post.images?.length ? post.images : (post.filePath ? [{ filePath: post.filePath }] : [])
                const isMulti = imageList.length > 1
                const activeIdx = isMulti ? slideTick % imageList.length : 0
                return (
                  <button
                    key={post.id}
                    onClick={() => navigate(`/characters/${id}/feed?postId=${post.id}`)}
                    className="aspect-[3/4] overflow-hidden relative bg-gray-900"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {imageList.length > 0 ? (
                      imageList.map((img, idx) => (
                        <img
                          key={img.id ?? idx}
                          src={img.filePath}
                          alt={post.caption || ''}
                          className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ${idx === activeIdx ? 'opacity-100' : 'opacity-0'}`}
                          loading="lazy"
                          draggable={false}
                        />
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                    )}
                    {isMulti && (
                      <div className="absolute top-1.5 right-1.5">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="drop-shadow">
                          <rect x="3" y="3" width="15" height="15" rx="2" />
                          <rect x="6" y="6" width="15" height="15" rx="2" />
                        </svg>
                      </div>
                    )}

                    {/* 좋아요 인디케이터 (좌측 하단) */}
                    <div className="absolute bottom-1 left-1 pointer-events-none drop-shadow">
                      {post.liked ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {feedPosts.length === 0 && (
              <div className="text-center text-gray-500 py-16">
                <p className="text-sm">{t('character.emptyPosts')}</p>
              </div>
            )}
          </>
        )}

        {/* 호감도 갤러리 */}
        {activeTab === 'affinity' && (
          <GalleryGrid
            contents={galleryContents.filter((c) => c.unlockType === 'AFFINITY')}
            affinity={existingConv?.affinity ?? 0}
            onContentClick={(content) => setGallerySlideViewer({
              images: content.images,
              title: content.title,
              description: content.description,
              initialIndex: 0,
            })}
            onLockedClick={(content) => setUnlockTarget(content)}
          />
        )}

        {/* 미션 갤러리 */}
        {activeTab === 'mission' && (
          <GalleryGrid
            contents={galleryContents.filter((c) => c.unlockType === 'MISSION')}
            affinity={existingConv?.affinity ?? 0}
            onContentClick={(content) => setGallerySlideViewer({
              images: content.images,
              title: content.title,
              description: content.description,
              initialIndex: 0,
            })}
            onLockedClick={(content) => setUnlockTarget(content)}
          />
        )}
      </div>

      {/* 스토리 뷰어 */}
      {showStory && hasStories && (
        <StoryViewer
          stories={stories}
          character={character}
          profileUrl={profileUrl}
          currentIndex={storyIndex}
          onIndexChange={setStoryIndex}
          onClose={() => {
            setShowStory(false)
            setStoryViewed(true)
            // 스토리 본 기록 저장 (Feed와 공유)
            try {
              const viewed = new Set(JSON.parse(sessionStorage.getItem('viewedStories') || '[]'))
              viewed.add(character.id)
              sessionStorage.setItem('viewedStories', JSON.stringify([...viewed]))
            } catch {}
          }}
        />
      )}

      {/* 갤러리 슬라이드 뷰어 */}
      {gallerySlideViewer && (
        <ImageSlideViewer
          images={gallerySlideViewer.images}
          initialIndex={gallerySlideViewer.initialIndex}
          title={gallerySlideViewer.title}
          description={gallerySlideViewer.description}
          onClose={() => setGallerySlideViewer(null)}
        />
      )}

      {/* 갤러리 해금 모달 */}
      {unlockTarget && (
        <GalleryUnlockModal
          content={unlockTarget}
          characterId={parseInt(id)}
          onClose={() => setUnlockTarget(null)}
          onUnlocked={(contentId) => {
            setGalleryContents((prev) =>
              prev.map((c) => c.id === contentId ? { ...c, unlocked: true } : c)
            )
            setUnlockTarget(null)
          }}
        />
      )}

      {/* 후기 유도 모달 */}
      {showReviewModal && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-4"><MaskIcon /></p>
            <h3 className="text-lg font-bold text-white mb-2">{t('character.reviewTitle')}</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-2 whitespace-pre-line">
              {t('character.reviewDesc', { name: character?.name })}
            </p>
            <p className="text-sm text-amber-400 font-semibold mb-6">
              {t('character.reviewReward')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowReviewModal(false)
                  await requestInAppReview()
                  try {
                    const result = await api.post('/masks/review-reward')
                    if (result.masks) useStore.getState().setMasks(result.masks)
                  } catch {}
                  const chatId = window.__pendingChatId
                  delete window.__pendingChatId
                  if (chatId) navigate(`/chats/${chatId}`)
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('character.reviewButton')}
              </button>
              <button
                onClick={() => {
                  setShowReviewModal(false)
                  markReviewShown()
                  const chatId = window.__pendingChatId
                  delete window.__pendingChatId
                  if (chatId) navigate(`/chats/${chatId}`)
                }}
                className="w-full py-2.5 text-gray-500 text-sm hover:text-gray-300 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('character.reviewLater')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리셋 경고 모달 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">{t('character.restartTitle')}</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              {t('character.restartDesc')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={resetChat}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('character.restartConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <ReportModal
          targetType={existingConv ? 'CONVERSATION' : 'FEED_POST'}
          targetId={existingConv ? existingConv.conversationId : parseInt(id)}
          onClose={() => setShowReport(false)}
        />
      )}

      {toast && (
        <div
          className="absolute left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
        >
          <div className="bg-gray-900/95 text-white text-sm px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm border border-gray-700 pointer-events-auto flex flex-col gap-2 max-w-xs">
            <p className="leading-snug">{toast}</p>
            <button
              onClick={() => { setToast(null); navigate('/subscription') }}
              className="self-stretch py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('character.freeLimitCta')}
            </button>
          </div>
        </div>
      )}

      <OnboardingSpotlight
        active={tourActive}
        steps={tourSteps}
        onComplete={completeTour}
      />
    </div>
  )
}
