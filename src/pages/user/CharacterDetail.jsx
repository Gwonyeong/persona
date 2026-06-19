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

function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
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
import ProfileVariantPicker from '../../components/ProfileVariantPicker'
import OnboardingSpotlight from '../../components/OnboardingSpotlight'
import useBackHandler from '../../hooks/useBackHandler'
import { shouldShowReview, requestInAppReview, markReviewShown } from '../../lib/review'

const NORMAL_EMOTIONS = ['NEUTRAL', 'HAPPY', 'ANGRY', 'SAD', 'SHY', 'WORRIED']
const AROUSED_EMOTIONS = ['AROUSED_TEASE', 'AROUSED_TOPLESS', 'AROUSED_NUDE', 'AROUSED_FOREPLAY', 'AROUSED_INSERT', 'AROUSED_INSERT_ALT', 'AROUSED_CLIMAX', 'AROUSED_AFTERGLOW']

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
  const [giftUnlocks, setGiftUnlocks] = useState([])
  const [giftViewer, setGiftViewer] = useState(null) // { gift, index }
  const [gallerySlideViewer, setGallerySlideViewer] = useState(null)
  const [expressionViewer, setExpressionViewer] = useState(null) // { images, initialIndex }
  const [playingVoice, setPlayingVoice] = useState(null) // null | 'normal' | 'aroused'
  const voiceAudioRef = useRef(null)
  const [unlockTarget, setUnlockTarget] = useState(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [v2Presets, setV2Presets] = useState(null)        // { v2Enabled, startingPresets } | null
  const [existingV2Conv, setExistingV2Conv] = useState(null) // V2(스토리) conversation 별도 체크
  // 통합 채팅 모달 — 메시지 보내기 버튼 클릭 시 진입점.
  //   step 'mode': 기본 채팅 vs 컨셉 채팅 선택
  //   step 'preset': 컨셉 채팅의 preset 3개 선택
  const [chatModal, setChatModal] = useState({ open: false, step: 'mode' })
  const [showReport, setShowReport] = useState(false)
  const [showProfilePicker, setShowProfilePicker] = useState(false)
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
  useBackHandler(!!expressionViewer, () => setExpressionViewer(null))
  useBackHandler(!!giftViewer, () => setGiftViewer(null))
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
    api.get(`/gifts/character/${id}/unlocks`)
      .then(({ unlocks }) => setGiftUnlocks(unlocks || []))
      .catch(() => setGiftUnlocks([]))
    api.get(`/characters/${id}/storylines`)
      .then(({ scenarios, storylines }) => {
        setScenarios(scenarios || [])
        setStorylines(storylines || [])
      })
      .catch(() => { setScenarios([]); setStorylines([]) })
  }, [id, i18n.language])

  useEffect(() => {
    if (!token) return
    // V1과 V2 conversation 별도 체크 — 모달에 각 모드별 "이어서" 상태 표시.
    api.get(`/conversations/check/${id}`)
      .then((data) => setExistingConv(data?.exists ? data : null))
      .catch(() => setExistingConv(null))
    api.get(`/v2/conversations/check/${id}`)
      .then((data) => setExistingV2Conv(data?.exists ? data : null))
      .catch(() => setExistingV2Conv(null))
    // V2 preset 정보 미리 fetch — 모달 1단계 카드 "컨셉 채팅" 비활성 여부 결정용
    api.get(`/v2/characters/${id}/presets`)
      .then((data) => setV2Presets(data))
      .catch(() => setV2Presets(null))
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

  // 메시지 보내기 버튼 클릭 진입점 — 항상 통합 모달 오픈.
  const openChatModal = () => {
    if (!token) { goToLogin(navigate); return }
    setChatModal({ open: true, step: 'mode' })
  }
  const closeChatModal = () => setChatModal({ open: false, step: 'mode' })

  // === 기본 채팅 (V1) ===
  // V1 conversation 이어서: 그대로 navigate. 없으면 새로 생성.
  const handleBasicResume = () => {
    if (!existingConv) return handleBasicStart()
    navigate(`/chats/${existingConv.conversationId}`)
  }
  const handleBasicStart = async () => {
    closeChatModal()
    setStarting(true)
    try {
      const { conversation, conversationCount } = await api.post('/conversations', { characterId: parseInt(id) })
      window.gtag?.('event', 'chat_start', { character_id: id, conversation_id: conversation.id })
      if (shouldShowReview(conversationCount)) {
        setShowReviewModal(true)
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
  // 기본 채팅 새로 시작 (existing reset)
  const handleBasicReset = async () => {
    if (!existingConv) return handleBasicStart()
    closeChatModal()
    setStarting(true)
    try {
      const { conversation } = await api.post(`/conversations/${existingConv.conversationId}/reset`)
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  // === 컨셉 채팅 (V2/스토리) ===
  // V2 conversation 이어서: 그대로 navigate.
  const handleConceptResume = () => {
    if (!existingV2Conv) return setChatModal({ open: true, step: 'preset' })
    navigate(`/chats-v2/${existingV2Conv.conversationId}`)
  }
  // preset 선택 → V2 conversation 생성/reset + init → /chats-v2 진입
  const handleConceptPresetPick = async (presetId) => {
    closeChatModal()
    setStarting(true)
    try {
      // 기존 V2 있으면 reset + 새 preset init, 없으면 신규 V2 conversation 생성
      let conversationId
      if (existingV2Conv) {
        await api.post(`/v2/conversations/${existingV2Conv.conversationId}/reset`)
        conversationId = existingV2Conv.conversationId
        await api.post(`/v2/conversations/${conversationId}/init`, { presetId })
      } else {
        const { conversation } = await api.post('/v2/conversations', { characterId: parseInt(id), presetId })
        conversationId = conversation.id
      }
      window.gtag?.('event', 'chat_start_v2', { character_id: id, conversation_id: conversationId, preset_id: presetId })
      navigate(`/chats-v2/${conversationId}`)
    } catch (error) {
      console.error('handleConceptPresetPick error:', error)
      if (error?.data?.error === 'CHARACTER_LIMIT_REACHED') {
        setToast(t('character.freeLimitReached', { limit: error.data.limit }))
      }
      setStarting(false)
    }
  }

  // 더 이상 사용 안 함 — 모달 핸들러로 대체. 외부 참조 회피 위해 안전 stub만 유지.
  const startChat = openChatModal
  const resumeChat = openChatModal

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

  // 음성 샘플 재생/정지 토글. 다른 샘플로 전환 시 기존 audio 정리. 언마운트/캐릭터 전환 시도 정리.
  const toggleVoiceSample = (kind, audioUrl) => {
    if (!audioUrl) return
    if (playingVoice === kind && voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
      setPlayingVoice(null)
      return
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
    }
    const audio = new Audio(audioUrl)
    voiceAudioRef.current = audio
    audio.onended = () => {
      if (voiceAudioRef.current === audio) voiceAudioRef.current = null
      setPlayingVoice((prev) => (prev === kind ? null : prev))
    }
    audio.play().catch(() => {
      if (voiceAudioRef.current === audio) voiceAudioRef.current = null
      setPlayingVoice((prev) => (prev === kind ? null : prev))
    })
    setPlayingVoice(kind)
  }

  useEffect(() => {
    return () => {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current = null
      }
    }
  }, [id])

  // 표정 슬라이드 — normal은 감정당 랜덤 1장, aroused는 모든 이미지 노출(갤러리 UI)
  // 이미지 row만 후보 (standalone 영상 row 제외)
  const expressionRows = useMemo(() => {
    const images = character?.styles?.[0]?.images
    if (!images?.length) return { normal: [], aroused: [] }
    const pickOne = (emotion) => {
      const matching = images.filter((img) => img.emotion === emotion && !isVideoUrl(img.filePath))
      return matching.length ? matching[Math.floor(Math.random() * matching.length)] : null
    }
    // aroused: 모든 이미지 노출 (seen 먼저 정렬 → unseen)
    const arousedAll = images
      .filter((img) => AROUSED_EMOTIONS.includes(img.emotion) && !isVideoUrl(img.filePath))
      .sort((a, b) => {
        if (a.seen && !b.seen) return -1
        if (!a.seen && b.seen) return 1
        return a.id - b.id
      })
    return {
      normal: NORMAL_EMOTIONS.map(pickOne).filter(Boolean),
      aroused: arousedAll,
    }
  }, [character])

  // 표정 영상 해금 — 10마스크
  const EXPRESSION_VIDEO_COST = 10
  const EXPRESSION_INITIAL_LIMIT = 9
  const [unlockingExpImageId, setUnlockingExpImageId] = useState(null)
  const [expVideoLightboxUrl, setExpVideoLightboxUrl] = useState(null)
  const [arousedExpanded, setArousedExpanded] = useState(false)

  const handleUnlockExpressionVideo = async (img) => {
    if (!user) return goToLogin()
    if ((user.masks ?? 0) < EXPRESSION_VIDEO_COST) {
      alert('마스크가 부족합니다.')
      navigate('/subscription')
      return
    }
    setUnlockingExpImageId(img.id)
    try {
      const res = await api.post(`/characters/${id}/images/${img.id}/unlock-video`, {})
      // 로컬 character state 업데이트
      setCharacter((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          styles: prev.styles.map((s) => ({
            ...s,
            images: s.images.map((i) =>
              i.id === img.id ? { ...i, seen: true, videoUnlocked: true } : i,
            ),
          })),
        }
      })
      if (res.masks !== undefined) setUser({ ...user, masks: res.masks })
    } catch (err) {
      if (err?.error === 'INSUFFICIENT_MASKS') {
        alert('마스크가 부족합니다.')
        navigate('/subscription')
      } else {
        alert('해금에 실패했어요.')
      }
    } finally {
      setUnlockingExpImageId(null)
    }
  }

  if (!character) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">{t('common.loading')}</div>
  }

  const mainStyle = character.styles?.[0]
  const mainImage = mainStyle?.images?.find((i) => i.emotion === 'NEUTRAL')
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

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-auto">
        {/* 히어로 이미지 — 풀 너비 + 하단 그라데이션 딤 + 플로팅 버튼 */}
        <div className="relative">
          <button
            onClick={() => { if (hasStories) { setStoryIndex(0); setShowStory(true) } }}
            className="relative block w-full aspect-[4/5] overflow-hidden bg-gray-900"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {profileUrl ? (
              <img src={profileUrl} alt={character.name} className="w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl text-gray-700">?</div>
            )}
            {/* 하단 그라데이션 딤드 — 페이지 bg(gray-950)와 일치해서 경계 안 보이게 */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-gray-950 via-gray-950/70 to-transparent pointer-events-none" />
            {/* 하단 오버레이 — 스토리 뱃지 + 이름 + 소개 */}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-5 pt-14 text-left pointer-events-none">
              {hasStories && (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2 ${storyViewed ? 'bg-gray-700/80' : 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span className="text-[10px] text-white font-semibold">스토리</span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-xl text-white">{character.name}</p>
                {onlineStatus === 'free' && (
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                )}
                {(existingConv?.affinity ?? 0) >= 20 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-600/30 text-indigo-200 rounded-full">
                    {isFollowing ? t('character.mutualFollow') : t('character.followsYou')}
                  </span>
                )}
              </div>
              {character.concept && (
                <p className="text-sm text-gray-300 mt-1">{character.concept}</p>
              )}
              {character.description && (
                <p className="text-sm text-gray-200 mt-1.5 leading-relaxed line-clamp-3">{character.description}</p>
              )}
            </div>
          </button>

          {/* 뒤로가기 (좌상단) */}
          <button
            onClick={() => navigate(-1)}
            className="absolute left-3 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="뒤로가기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* 프로필 이미지 변경 (우상단, 신고 왼쪽) */}
          {token && (
            <button
              onClick={() => setShowProfilePicker(true)}
              className="absolute right-16 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
              style={{ top: 'calc(env(safe-area-inset-top) + 12px)', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="프로필 이미지 변경"
              title="프로필 이미지 변경"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          )}

          {/* 신고 (우상단) */}
          <button
            onClick={() => setShowReport(true)}
            className="absolute right-3 z-10 w-10 h-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('report.title')}
            title={t('report.title')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>

        {/* 프로필 섹션 */}
        <div className="px-4 pt-2 pb-2">
          {/* 태그 */}
          {character.tags?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {character.tags.filter((t) => !['nationality', 'age', 'imageType', 'personality'].includes(t.split(':')[0])).map((tag) => {
                const info = getTagInfo(tag, tagCategories)
                return (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 text-xs text-indigo-300">
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

          {/* 표정 슬라이드 — 1행: 일반 / 2행: 흥분 (safetyMode면 블러) */}
          {(expressionRows.normal.length > 0 || expressionRows.aroused.length > 0) && (
            <div className="mt-4 space-y-2">
              {expressionRows.normal.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
                  {expressionRows.normal.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => setExpressionViewer({
                        images: expressionRows.normal.map((i) => ({ filePath: i.filePath })),
                        initialIndex: idx,
                      })}
                      className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-900"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <img src={img.filePath} alt={img.emotion} className="w-full h-full object-cover" draggable={false} />
                    </button>
                  ))}
                </div>
              )}

              {expressionRows.aroused.length > 0 && (
                <div className="relative">
                  <div className="grid grid-cols-3 gap-2">
                    {(arousedExpanded ? expressionRows.aroused : expressionRows.aroused.slice(0, EXPRESSION_INITIAL_LIMIT)).map((img) => {
                      const hasVideo = !!img.videoFilePath
                      const seen = !!img.seen
                      const videoUnlocked = !!img.videoUnlocked
                      const isUnlocking = unlockingExpImageId === img.id
                      return (
                        <div
                          key={img.id}
                          className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700"
                          style={{ aspectRatio: '9 / 16' }}
                        >
                          {/* 베이스 이미지 */}
                          <img
                            src={img.filePath}
                            alt={img.emotion}
                            className="absolute inset-0 w-full h-full object-cover"
                            style={!seen ? { filter: 'blur(16px)' } : undefined}
                            draggable={false}
                          />

                          {/* 안 본 이미지 → 블러 + 자물쇠 */}
                          {!seen && (
                            <>
                              <div className="absolute inset-0 bg-black/40" />
                              <div className="absolute inset-0 flex items-center justify-center text-white pointer-events-none">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                              </div>
                            </>
                          )}

                          {/* 본 + 영상 해금됨 → 선명 영상 */}
                          {seen && hasVideo && videoUnlocked && (
                            <video
                              src={img.videoFilePath}
                              className="absolute inset-0 w-full h-full object-cover"
                              autoPlay loop muted playsInline
                            />
                          )}

                          {/* 본 + 영상 미해금 → 블러 영상 */}
                          {seen && hasVideo && !videoUnlocked && (
                            <>
                              <video
                                src={img.videoFilePath}
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ filter: 'blur(14px)' }}
                                autoPlay loop muted playsInline
                              />
                              <div className="absolute inset-0 bg-black/30" />
                            </>
                          )}

                          {/* 영상 있는 본 이미지 → 중앙 재생 버튼 */}
                          {seen && hasVideo && (
                            <button
                              onClick={() => {
                                if (videoUnlocked) setExpVideoLightboxUrl(img.videoFilePath)
                                else handleUnlockExpressionVideo(img)
                              }}
                              disabled={isUnlocking}
                              className="absolute inset-0 flex items-center justify-center disabled:opacity-60"
                              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                              aria-label={videoUnlocked ? '영상 재생' : '영상 해금'}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
                                  {isUnlocking ? (
                                    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42 100" strokeLinecap="round" />
                                    </svg>
                                  ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  )}
                                </div>
                                {!videoUnlocked && !isUnlocking && (
                                  <div className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 flex items-center gap-1 text-[10px] text-white">
                                    <MaskIcon size={10} />
                                    <span>{EXPRESSION_VIDEO_COST}</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {expressionRows.aroused.length > EXPRESSION_INITIAL_LIMIT && (
                    <button
                      onClick={() => setArousedExpanded((v) => !v)}
                      className="mt-2 w-full py-2 text-xs text-gray-300 bg-gray-800/60 hover:bg-gray-800 rounded-lg"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {arousedExpanded
                        ? '접기'
                        : `더 보기 (+${expressionRows.aroused.length - EXPRESSION_INITIAL_LIMIT})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 음성 샘플 버블 — 일반 / 흥분. aroused는 safetyMode=false일 때만 재생 가능 */}
          {(character.voiceSamples?.normal?.text || character.voiceSamples?.aroused?.text) && (
            <div className="mt-4 flex flex-col gap-2">
              {['normal', 'aroused'].map((kind) => {
                const sample = character.voiceSamples?.[kind]
                if (!sample?.text) return null
                const isAroused = kind === 'aroused'
                const locked = isAroused && (!user || user?.safetyMode)
                const isPlaying = playingVoice === kind
                const canPlay = !!sample.audioUrl && !locked
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => canPlay && toggleVoiceSample(kind, sample.audioUrl)}
                    disabled={!canPlay}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl text-left transition-colors ${
                      isAroused
                        ? 'bg-pink-500/10 border border-pink-500/30 hover:bg-pink-500/15'
                        : 'bg-gray-800 border border-gray-700 hover:bg-gray-750'
                    } disabled:opacity-70 disabled:cursor-default`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* 재생/잠금 아이콘 */}
                    <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                      locked
                        ? 'bg-gray-700/60 text-gray-400'
                        : isAroused
                          ? 'bg-pink-500/80 text-white'
                          : 'bg-indigo-600 text-white'
                    }`}>
                      {locked ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      ) : isPlaying ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="6 4 20 12 6 20" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] mb-0.5 ${isAroused ? 'text-pink-300' : 'text-gray-400'}`}>
                        {isAroused ? '흥분' : '일반'}
                      </p>
                      <p className={`text-sm leading-snug line-clamp-2 ${locked ? 'text-gray-500' : 'text-gray-100'}`}>
                        {locked ? 'Safety Mode 해제 시 재생할 수 있어요' : sample.text}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 액션 버튼 (메시지 보내기는 하단 고정 CTA로 이동) */}
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={toggleFollow}
              className={`w-full py-2 text-sm font-semibold rounded-lg transition-colors ${
                isFollowing
                  ? 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="follow"
            >
              {isFollowing ? t('character.unfollow') : t('character.follow')}
            </button>
            {/* 새로하기 버튼은 통합 모달 안으로 이동 — 메인 화면에서 제거. */}
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
                    {/* 비디오라도 포스터 이미지가 있으면 <img>로 렌더 — 영상 다운로드 회피.
                        포스터 없는 레거시 비디오만 <video preload="metadata"> fallback. */}
                    {media.length > 0 ? (
                      media.map((m, idx) => {
                        const isActive = idx === activeIdx
                        const blur = !m.unlocked
                        const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`
                        if (m.type === 'video' && !m.posterUrl) {
                          return (
                            <video
                              key={idx}
                              src={m.url}
                              className={baseCls}
                              style={blur ? lockedMediaStyle : undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          )
                        }
                        return (
                          <img
                            key={idx}
                            src={m.type === 'video' ? m.posterUrl : m.url}
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
            <button
              onClick={() => setActiveTab('gift')}
              className={`flex-1 flex justify-center py-2.5 border-b-2 transition-colors ${activeTab === 'gift' ? 'border-white text-white' : 'border-transparent text-gray-500'}`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              data-onboarding-target="tab-gift"
              aria-label="선물"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" />
                <rect x="2" y="7" width="20" height="5" />
                <line x1="12" y1="22" x2="12" y2="7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
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

        {/* 선물 갤러리 — 아이템별 섹션 */}
        {activeTab === 'gift' && (
          giftUnlocks.length === 0 ? (
            <div className="text-center text-gray-500 py-16 px-6">
              <p className="text-sm">아직 선물한 항목이 없습니다.</p>
              <p className="text-xs text-gray-600 mt-1">채팅 화면의 🎁 버튼에서 선물할 수 있어요.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-3">
              {giftUnlocks.map((u) => (
                <section key={u.gift.id} className="px-3">
                  {/* 헤더: 썸네일 + 이름 + 콘텐츠 개수 */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0">
                      <img src={u.gift.imageUrl} alt={u.gift.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{u.gift.name}</p>
                      <p className="text-[11px] text-gray-500">
                        해금 콘텐츠 {u.gift.contents?.length || 0}개
                      </p>
                    </div>
                  </div>

                  {/* 콘텐츠 그리드 */}
                  {u.gift.contents?.length > 0 ? (
                    <div className="grid grid-cols-3 gap-[2px] bg-gray-900 rounded-lg overflow-hidden">
                      {u.gift.contents.map((c, idx) => (
                        <button
                          key={c.id}
                          onClick={() => setGiftViewer({ gift: u.gift, index: idx })}
                          className="aspect-square relative bg-gray-950 overflow-hidden"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          {c.type === 'VIDEO' ? (
                            <>
                              <video
                                src={c.filePath}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                                    <polygon points="8 5 19 12 8 19" />
                                  </svg>
                                </div>
                              </div>
                            </>
                          ) : (
                            <img
                              src={c.filePath}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-600 italic py-3 text-center bg-gray-900/50 rounded-lg">
                      해금된 콘텐츠가 없습니다
                    </div>
                  )}
                </section>
              ))}
            </div>
          )
        )}
      </div>

      {/* 하단 고정 CTA — 메시지 보내기 */}
      <div
        className="flex-shrink-0 px-4 pt-3 bg-gray-950 border-t border-gray-800/60"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <button
          onClick={openChatModal}
          disabled={starting}
          className="w-full py-3.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          data-onboarding-target="message"
        >
          {starting ? t('character.starting') : t('character.sendMessage')}
        </button>
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

      {/* 표정 슬라이드 뷰어 */}
      {expressionViewer && (
        <ImageSlideViewer
          images={expressionViewer.images}
          initialIndex={expressionViewer.initialIndex}
          onClose={() => setExpressionViewer(null)}
        />
      )}

      {/* 표정 영상 fullscreen 라이트박스 */}
      {expVideoLightboxUrl && (
        <div
          className="absolute inset-0 z-[60] bg-black/95 flex items-center justify-center"
          onClick={() => setExpVideoLightboxUrl(null)}
        >
          <video
            src={expVideoLightboxUrl}
            className="w-full h-full object-contain"
            autoPlay loop muted playsInline
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setExpVideoLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* 선물 콘텐츠 뷰어 — 이미지/비디오 혼합. ImageSlideViewer 재사용 */}
      {giftViewer && (
        <ImageSlideViewer
          images={giftViewer.gift.contents.map((c) => ({ filePath: c.filePath, type: c.type }))}
          initialIndex={giftViewer.index}
          title={`🎁 ${giftViewer.gift.name}`}
          onClose={() => setGiftViewer(null)}
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

      {/* 기존 리셋 모달은 통합 모달 안의 '새로 시작' 옵션으로 흡수됨 — 제거. */}

      {showReport && (
        <ReportModal
          targetType={existingConv ? 'CONVERSATION' : 'FEED_POST'}
          targetId={existingConv ? existingConv.conversationId : parseInt(id)}
          onClose={() => setShowReport(false)}
        />
      )}

      <ProfileVariantPicker
        open={showProfilePicker}
        characterId={parseInt(id)}
        onClose={() => setShowProfilePicker(false)}
        onApplied={() => {
          // 적용 후 캐릭터 다시 받아와서 새 profileImage 반영
          api.get(`/characters/${id}`).then(({ character }) => setCharacter(character)).catch(() => {})
        }}
      />


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

      {/* 통합 채팅 모드 모달 — 메시지 보내기 진입점. 2단계: 모드 선택 → (컨셉 채팅 시) preset 선택. */}
      {chatModal.open && (
        <div
          onClick={() => !starting && closeChatModal()}
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/55"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 max-h-[82vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {chatModal.step === 'mode' && (
                  <>
                    <h3 className="text-base font-bold text-white">대화 시작</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">{character?.name}와(과) 어떻게 만날까요?</p>
                  </>
                )}
                {chatModal.step === 'preset' && (
                  <>
                    <h3 className="text-base font-bold text-white">시작 상태 선택</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">관계의 출발점에 따라 호감도/친밀도가 달라집니다.</p>
                  </>
                )}
                {(chatModal.step === 'confirm-basic' || chatModal.step === 'confirm-concept') && (
                  <>
                    <h3 className="text-base font-bold text-white">대화를 새로 시작할까요?</h3>
                    <p className="text-[11px] text-red-300 mt-0.5">기존 대화 내용이 삭제되며 되돌릴 수 없습니다.</p>
                  </>
                )}
              </div>
              <button
                onClick={() => !starting && closeChatModal()}
                disabled={starting}
                className="text-gray-400 hover:text-white text-2xl leading-none"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ×
              </button>
            </div>

            {chatModal.step === 'mode' && (
              <div className="flex flex-col gap-2.5">
                {/* 기본 채팅 카드 */}
                <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl leading-none mt-0.5">💬</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">기본 채팅</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">자유롭게 대화하는 일반 모드</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={existingConv ? handleBasicResume : handleBasicStart}
                      disabled={starting}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {existingConv ? '이어서 대화' : '대화 시작'}
                    </button>
                    {existingConv && (
                      <button
                        onClick={() => setChatModal({ open: true, step: 'confirm-basic' })}
                        disabled={starting}
                        className="px-3 py-2.5 text-[11px] text-red-300 border border-red-400/40 hover:bg-red-400/10 disabled:opacity-50 rounded-xl transition-colors"
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        새로 시작
                      </button>
                    )}
                  </div>
                </div>

                {/* 컨셉 채팅 카드 — V2 활성 캐릭터에만 노출 */}
                {v2Presets?.v2Enabled && v2Presets?.startingPresets?.length > 0 && (
                  <div className="rounded-2xl border border-violet-500/40 bg-violet-500/8 p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl leading-none mt-0.5">🎬</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-violet-100">컨셉 채팅</p>
                          <span className="text-[9px] font-bold px-1.5 py-px rounded-md bg-violet-500/30 text-violet-200 border border-violet-400/40 tracking-wide">
                            스토리
                          </span>
                        </div>
                        <p className="text-[11px] text-violet-200/70 mt-0.5">에피소드·시간·관계가 진화하는 미연시 모드</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {existingV2Conv ? (
                        <>
                          <button
                            onClick={handleConceptResume}
                            disabled={starting}
                            className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            이어서 진행
                          </button>
                          <button
                            onClick={() => setChatModal({ open: true, step: 'confirm-concept' })}
                            disabled={starting}
                            className="px-3 py-2.5 text-[11px] text-violet-200 border border-violet-400/40 hover:bg-violet-400/10 disabled:opacity-50 rounded-xl transition-colors"
                            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                          >
                            새로 시작
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setChatModal({ open: true, step: 'preset' })}
                          disabled={starting}
                          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          스토리 시작
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {chatModal.step === 'preset' && v2Presets?.startingPresets?.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setChatModal({ open: true, step: 'mode' })}
                  disabled={starting}
                  className="self-start text-[11px] text-gray-400 hover:text-white mb-1 flex items-center gap-1"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  ← 모드 다시 선택
                </button>
                {v2Presets.startingPresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleConceptPresetPick(p.id)}
                    disabled={starting}
                    className="text-left p-3.5 rounded-2xl border border-violet-500/40 bg-violet-500/8 hover:bg-violet-500/15 disabled:opacity-50 transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="text-sm font-semibold text-violet-100">{p.label}</div>
                    <div className="text-[11px] text-violet-200/80 mt-1">{p.description}</div>
                    <div className="text-[10px] text-violet-300/60 mt-1.5 flex gap-2 flex-wrap">
                      <span>친밀도 {p.familiarity} · 호감도 {p.affinity}</span>
                      {p.userNickname && <span>· 호칭 <strong className="text-violet-200">{p.userNickname}</strong></span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(chatModal.step === 'confirm-basic' || chatModal.step === 'confirm-concept') && (
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none mt-0.5">⚠️</span>
                    <div className="flex-1 min-w-0 text-[12px] text-red-100/90 leading-relaxed">
                      {chatModal.step === 'confirm-basic'
                        ? '지금까지 나눈 기본 채팅 대화 기록이 모두 삭제되고 새 대화로 시작합니다.'
                        : '지금까지 진행된 컨셉 채팅(스토리)의 호감도·친밀도·에피소드 진행 상황이 모두 초기화됩니다.'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChatModal({ open: true, step: 'mode' })}
                    disabled={starting}
                    className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-sm font-semibold rounded-xl transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    취소
                  </button>
                  <button
                    onClick={() => {
                      if (chatModal.step === 'confirm-basic') handleBasicReset()
                      else setChatModal({ open: true, step: 'preset' })
                    }}
                    disabled={starting}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    삭제하고 새로 시작
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
