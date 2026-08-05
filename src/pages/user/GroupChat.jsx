import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { formatChatTime } from '../../lib/timeFormat'
import MaskIcon from '../../components/MaskIcon'
import { isVideoUrl, CrossfadeMedia, SpriteMedia } from '../../components/SpriteMedia'

// 단톡방 메시지당 마스크 비용 — 서버 routes/groupChats.js와 동기. 모델별(기본1/고급3) + 음성 추가요금.
const GROUP_MODEL_COSTS = { BASIC: 1, ADVANCED: 3 }
const GROUP_VOICE_SURCHARGE = 4
const GROUP_NSFW_VOICE_EXTRA = 3
// 표정영상 해금 비용 — 서버 routes/groupChats.js의 EMOTION_VIDEO_MASK_COST와 동기.
const EMOTION_VIDEO_MASK_COST = 10

const MAX_MEMBERS = 4

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function getNeutralImage(character) {
  const styles = character?.styles || []
  for (const s of styles) {
    const img = s.images?.find((i) => i.emotion === 'NEUTRAL')
    if (img) return getImageUrl(img.filePath)
  }
  return getImageUrl(character?.profileImage)
}

// 감정에 맞는 표정 sprite 이미지 객체 선택 (V1 채팅과 동일한 emotion→이미지 매칭 규칙).
// 반환: { url, id, videoFilePath } — id/videoFilePath는 표정영상(해금) 렌더에 사용. 매칭 실패 시 null.
// 우선순위: 착용 스타일(currentStyleId) + 감정 → 착용 스타일 + NEUTRAL → 임의 스타일 + 감정 → NEUTRAL 기본.
// seed: 같은 감정에 이미지가 여러 장이면 seed로 변형을 로테이션(발화할 때마다 다른 컷).
function pickSpriteImage(character, styleId, emotion, seed = 0) {
  const styles = character?.styles || []
  const preferred = styles.find((s) => s.id === styleId) || styles[0]
  // 해당 스타일+감정의 정적 이미지 객체 목록(영상 파일 자체는 제외 — videoFilePath로 따라옴).
  const poolOf = (style, emo) => {
    if (!style) return []
    return (style.images || []).filter((i) => i.emotion === emo && !isVideoUrl(i.filePath))
  }
  let pool = poolOf(preferred, emotion)
  if (!pool.length) pool = poolOf(preferred, 'NEUTRAL')
  if (!pool.length) {
    for (const s of styles) {
      const p = poolOf(s, emotion)
      if (p.length) { pool = p; break }
    }
  }
  if (!pool.length) {
    const url = getNeutralImage(character)
    return url ? { url, id: null, videoFilePath: null } : null
  }
  const idx = (((seed % pool.length) + pool.length) % pool.length)
  const img = pool[idx]
  return { url: getImageUrl(img.filePath), id: img.id ?? null, videoFilePath: img.videoFilePath || null }
}

function parseMessageSegments(content, role) {
  if (!content || typeof content !== 'string') return [{ type: 'text', value: content || '' }]
  const pattern = role === 'USER' ? /(\([^()\n]+\))/g : /(《[^》\n]+》)/g
  const parts = content.split(pattern).filter((p) => p !== '' && p != null)
  return parts.map((p) => {
    if (role === 'USER' && /^\(.+\)$/.test(p)) return { type: 'action', value: p.slice(1, -1) }
    if (role !== 'USER' && /^《.+》$/.test(p)) return { type: 'action', value: p.slice(1, -1) }
    return { type: 'text', value: p }
  })
}

// 메시지 한 개를 렌더링하는 메모이즈된 컴포넌트.
// 부모(GroupChat) 리렌더(특히 인풋 타이핑 시 setInput)로 인한 전체 메시지 리스트 재렌더 lag를
// 차단하기 위해 React.memo로 감싼다. (V1 Chat.jsx의 MessageBubble과 동일한 목적)
// props(msg / character / 그룹핑 플래그)는 부모에서 참조 안정적으로 넘겨야 memo가 실제로 동작한다.
const GroupMessageBubble = memo(function GroupMessageBubble({ msg, character, isConsecutivePrev, isLastInGroup }) {
  const segs = useMemo(
    () => (msg.role === 'NARRATION' ? null : parseMessageSegments(msg.content, msg.role === 'USER' ? 'USER' : 'CHARACTER')),
    [msg.content, msg.role]
  )

  if (msg.role === 'NARRATION') {
    return (
      <div className="my-3 mx-4 px-3 py-2 bg-gray-900/70 rounded-lg text-center text-xs text-gray-300 italic leading-relaxed">
        {msg.content}
      </div>
    )
  }
  if (msg.role === 'USER') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] px-3 py-2 rounded-2xl rounded-tr-md bg-indigo-600 text-white text-sm leading-relaxed whitespace-pre-wrap">
          {segs.map((s, i) => (
            <span key={i}>
              {i > 0 && '\n\n'}
              {s.type === 'action'
                ? <span className="italic text-indigo-200/70">{s.value}</span>
                : s.value}
            </span>
          ))}
          {isLastInGroup && (
            <div className="text-[10px] text-indigo-200/70 mt-0.5 text-right">{formatChatTime(msg.createdAt)}</div>
          )}
        </div>
      </div>
    )
  }
  if (msg.role === 'CHARACTER') {
    const avatar = getNeutralImage(character)
    return (
      <div className="flex items-start gap-2">
        {/* 아바타 — 그룹의 첫 버블에만 표시. 연속이면 동일 너비 공백 spacer로 정렬 유지 */}
        <div className="w-8 flex-shrink-0">
          {!isConsecutivePrev && (
            <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
              {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
            </div>
          )}
        </div>
        <div className="max-w-[75%]">
          {!isConsecutivePrev && (
            <div className="text-xs text-gray-400 mb-0.5">{character?.name || '...'}</div>
          )}
          <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-gray-800 text-white text-sm leading-relaxed whitespace-pre-wrap">
            {segs.map((s, i) => (
              <span key={i}>
                {i > 0 && '\n\n'}
                {s.type === 'action'
                  ? <span className="italic text-gray-400/80">{s.value}</span>
                  : s.value}
              </span>
            ))}
            {msg.audioUrl && (
              <audio controls src={msg.audioUrl} className="block mt-1 w-full h-8" />
            )}
          </div>
          {isLastInGroup && (
            <div className="text-[10px] text-gray-500 mt-0.5">{formatChatTime(msg.createdAt)}</div>
          )}
        </div>
      </div>
    )
  }
  return null
})

export default function GroupChat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { token, user, setMasks } = useStore()
  const [groupChat, setGroupChat] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [chatModel, setChatModel] = useState('BASIC') // 'BASIC'(기본) | 'ADVANCED'(고급)
  const [showModelSheet, setShowModelSheet] = useState(false)
  const [videoUnlockedImageIds, setVideoUnlockedImageIds] = useState(new Set()) // 해금된 characterImageId 집합
  const [unlockingVideoId, setUnlockingVideoId] = useState(null) // 해금 처리 중인 imageId
  const [showDelete, setShowDelete] = useState(false)
  const [enlargedSprite, setEnlargedSprite] = useState(null) // 표정 스프라이트 확대 뷰 { url, name } | null
  // 스트리밍 중인 버블들 — 응답이 done되면 비워짐
  // 키: `${turnIdx}_${bubbleIdx}` → { turnIdx, characterId, bubbleIdx, role, content, complete }
  const [streamingBubbles, setStreamingBubbles] = useState([])
  const [presenceModeToast, setPresenceModeToast] = useState(null) // 'PHONE_AUTO' | 'PHONE' | 'IN_PERSON' | null
  const [blockToast, setBlockToast] = useState(null) // 검열 차단 안내 메시지(문자열) | null
  const [safetyConfirmVisible, setSafetyConfirmVisible] = useState(false)
  const [showStatusPanel, setShowStatusPanel] = useState(true) // 상단 캐릭터 상태 패널 접기/펼치기 (1:1 채팅과 동일)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  // 페이지네이션 — 초기엔 최근 PAGE_SIZE개만 서버에서 받고(전송량 절감), 위로 스크롤 시
  // IntersectionObserver가 top sentinel을 감지해 이전 청크를 서버에서 fetch·prepend한다.
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollContainerRef = useRef(null)
  const topSentinelRef = useRef(null)
  // 서버에 아직 안 받은 이전 메시지가 남았는지. windowStartRef = 현재 보유한 첫 메시지의 전체 배열 내 절대 인덱스.
  const [hasMoreBefore, setHasMoreBefore] = useState(false)
  const windowStartRef = useRef(0)
  const loadingOlderRef = useRef(false)
  // 상단 오버레이(헤더+캐릭터 정보+토글) 높이 — 메시지 영역이 그 아래에서 시작하도록 top 오프셋에 반영
  const topBarRef = useRef(null)
  const [topBarHeight, setTopBarHeight] = useState(0)
  // 하단 오버레이(스프라이트 행 + 인풋 바) 높이 — 메시지 영역이 인풋 박스 위에서 잘리도록 bottom 오프셋에 반영
  const bottomBarRef = useRef(null)
  const [bottomBarHeight, setBottomBarHeight] = useState(0)

  // 입력창에 (행동) 형식의 괄호를 삽입. 선택된 텍스트가 있으면 감싸고, 없으면 빈 ()를 넣고 가운데로 포커스.
  function insertActionParens() {
    const ta = inputRef.current
    if (!ta) return
    const start = ta.selectionStart ?? input.length
    const end = ta.selectionEnd ?? input.length
    const before = input.slice(0, start)
    const selected = input.slice(start, end)
    const after = input.slice(end)
    const inserted = selected ? `(${selected})` : '()'
    const next = before + inserted + after
    setInput(next)
    // 다음 tick에 selection 복원 — selected가 있으면 끝, 없으면 ( 다음 위치
    requestAnimationFrame(() => {
      const ta2 = inputRef.current
      if (!ta2) return
      const caret = selected ? before.length + inserted.length : before.length + 1
      ta2.focus()
      ta2.setSelectionRange(caret, caret)
      ta2.style.height = 'auto'
      ta2.style.height = Math.min(ta2.scrollHeight, 116) + 'px'
    })
  }

  useEffect(() => {
    if (!token) return
    // 초기엔 최근 PAGE_SIZE개만 요청 — 히스토리 많은 방의 초기 전송량/파싱 비용 절감.
    api.get(`/group-chats/${id}?limit=${PAGE_SIZE}`).then(({ groupChat, videoUnlockedImageIds }) => {
      setGroupChat(groupChat)
      setVoiceMode(!!groupChat.voiceMode)
      setChatModel(groupChat.chatModel === 'ADVANCED' ? 'ADVANCED' : 'BASIC')
      windowStartRef.current = groupChat.messageWindowStart ?? 0
      setHasMoreBefore(!!groupChat.hasMoreBefore)
      setVideoUnlockedImageIds(new Set(Array.isArray(videoUnlockedImageIds) ? videoUnlockedImageIds : []))
    }).catch((err) => {
      console.error(err)
      if (err.status === 404) navigate('/group-chats', { replace: true })
    })
  }, [id, token])

  // 스크롤은 항상 즉시 바닥으로 — 페이지 진입·새 메시지·스트리밍 delta 모두 동일.
  // 'smooth' 애니메이션을 쓰면 진입 시 상→하 스크롤이 보이고 스트리밍 중 따라가지 못함.
  // dep는 "마지막 메시지 시각" — 위로 스크롤해 이전 청크를 prepend할 땐 마지막 메시지가 안 바뀌므로
  // 바닥으로 튕기지 않는다(개수 dep면 prepend 때도 발동함). streamingBubbles는 delta마다 재스크롤용.
  const lastMessageAt = groupChat?.messages?.length
    ? groupChat.messages[groupChat.messages.length - 1].createdAt
    : null
  useEffect(() => {
    // scrollIntoView(block:'end')는 마지막 요소를 "보이는 하단 가장자리"에 맞춰, 하단 스프라이트+인풋
    // 오버레이 뒤로 새 버블이 가려진다. 컨테이너를 scrollHeight까지 밀면 확보해둔 paddingBottom
    // (=bottomBarHeight+8, 스프라이트 행 포함)만큼 아래로 스크롤돼 새 버블이 오버레이 위로 온전히 보인다.
    // ResizeObserver로 bottomBarHeight(=paddingBottom)가 갱신된 다음 프레임에 한 번 더 맞춰 스프라이트가
    // 방금 늘어난 경우까지 커버.
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const raf = requestAnimationFrame(() => {
      const el2 = scrollContainerRef.current
      if (el2) el2.scrollTop = el2.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [lastMessageAt, streamingBubbles, bottomBarHeight])

  // 상·하단 오버레이 높이 측정 — presence 칩 개수/스프라이트 행 유무에 따라 가변이므로 ResizeObserver로 추적.
  // 메시지 영역 top/bottom 오프셋에 반영해 상단 아래에서 시작하고 인풋 박스 위에서 잘리게 함.
  useLayoutEffect(() => {
    const topEl = topBarRef.current
    const bottomEl = bottomBarRef.current
    const update = () => {
      if (topEl) setTopBarHeight(topEl.offsetHeight)
      if (bottomEl) setBottomBarHeight(bottomEl.offsetHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    if (topEl) ro.observe(topEl)
    if (bottomEl) ro.observe(bottomEl)
    return () => ro.disconnect()
    // spriteMode(=groupChat.spriteMode 파생)·스프라이트 행 높이 변화는 groupChat 변경 + ResizeObserver로 커버됨.
  }, [groupChat])

  const memberById = useMemo(() => {
    const map = new Map()
    if (groupChat?.members) {
      for (const m of groupChat.members) map.set(m.characterId, m)
    }
    return map
  }, [groupChat?.members])

  const activeCount = useMemo(() => {
    return (groupChat?.members || []).filter((m) => m.isActive).length
  }, [groupChat?.members])

  const withUserCount = useMemo(() => {
    return (groupChat?.members || []).filter((m) => m.isWithUser).length
  }, [groupChat?.members])

  const presenceMode = groupChat?.presenceMode || 'PHONE'
  const isInPerson = presenceMode === 'IN_PERSON'
  // 상황극(컨셉) 방 — 캐스팅이 고정이라 진행 중 멤버 변경 불가. 멤버 관리 버튼 숨김.
  const isConcept = groupChat?.conceptData != null

  const safetyMode = groupChat?.safetyMode !== false // 기본 SFW
  // 이번 메시지 마스크 비용 — 모델(기본1/고급3) + 음성 추가요금(+4, NSFW 음성 +3).
  const msgCost = GROUP_MODEL_COSTS[chatModel] + (voiceMode ? GROUP_VOICE_SURCHARGE + (safetyMode ? 0 : GROUP_NSFW_VOICE_EXTRA) : 0)
  // 표정 이미지 출력 방식 — 서버(GroupChat.spriteMode) 값. 'BUBBLE'(기본) | 'OFF'(없음). 설정 페이지에서 변경.
  const spriteMode = groupChat?.spriteMode === 'OFF' ? 'OFF' : 'BUBBLE'
  const toggleDisabled = withUserCount === 0 && !isInPerson // IN_PERSON으로 전환할 멤버가 없음

  // 채팅에 참여중인 캐릭터인지 판정 — 색상 규칙의 핵심
  function isParticipating(m) {
    if (!m.isActive) return false
    if (isInPerson) return m.isWithUser
    return true
  }

  const headerTitle = useMemo(() => {
    if (!groupChat) return ''
    if (groupChat.title) return groupChat.title
    return (groupChat.members || []).map((m) => m.character?.name).filter(Boolean).join(', ')
  }, [groupChat])

  // 각 캐릭터의 최신 발화 감정 — messages를 역순 스캔해 characterId별 첫(=가장 최근) emotion.
  const latestEmotionByChar = useMemo(() => {
    const map = new Map()
    const msgs = groupChat?.messages || []
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role !== 'CHARACTER' || !m.characterId) continue
      if (!map.has(m.characterId)) map.set(m.characterId, m.emotion || 'NEUTRAL')
    }
    return map
  }, [groupChat?.messages])

  // 캐릭터별 발화 횟수 — 표정 이미지 변형(seed)용. 발화가 늘 때마다 같은 감정이라도 다른 컷으로 로테이션.
  const speakCountByChar = useMemo(() => {
    const map = new Map()
    for (const m of groupChat?.messages || []) {
      if (m.role === 'CHARACTER' && m.characterId) map.set(m.characterId, (map.get(m.characterId) || 0) + 1)
    }
    return map
  }, [groupChat?.messages])

  // 방금 말한(강조 대상) 캐릭터 — 스트리밍 중이면 마지막 스트리밍 버블, 아니면 마지막 CHARACTER 메시지.
  const speakingCharacterId = useMemo(() => {
    for (let i = streamingBubbles.length - 1; i >= 0; i--) {
      const b = streamingBubbles[i]
      if (b.role === 'CHARACTER' && b.characterId) return b.characterId
    }
    const msgs = groupChat?.messages || []
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'CHARACTER' && m.characterId) return m.characterId
    }
    return null
  }, [groupChat?.messages, streamingBubbles])

  // 인풋 위 1줄에 그릴 참여 페소나 표정 sprite (최대 4명, order순).
  const spriteParticipants = useMemo(() => {
    return (groupChat?.members || [])
      .filter((m) => isParticipating(m))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, MAX_MEMBERS)
      .map((m) => {
        const emotion = latestEmotionByChar.get(m.characterId) || 'NEUTRAL'
        // 발화 횟수를 seed로 — 같은 감정에 이미지가 여러 장이면 발화마다 다른 컷으로.
        const seed = speakCountByChar.get(m.characterId) || 0
        const img = pickSpriteImage(m.character, m.currentStyleId, emotion, seed)
        if (!img) return null
        // 이 이미지에 표정영상이 있고 해금됐는지 — 해금 시 영상 재생, 미해금 시 블러+CTA.
        const hasVideo = !!img.videoFilePath
        const unlocked = hasVideo && img.id != null && videoUnlockedImageIds.has(img.id)
        const activeUrl = hasVideo && unlocked ? img.videoFilePath : img.url
        return {
          characterId: m.characterId,
          name: m.character?.name || '',
          imageId: img.id,
          videoFilePath: img.videoFilePath,
          activeUrl,
          needsUnlock: hasVideo && !unlocked,
          isExcited: !!m.characterStatus?.isExcited,
          isSpeaking: m.characterId === speakingCharacterId,
        }
      })
      .filter((p) => p && p.activeUrl)
  }, [groupChat?.members, latestEmotionByChar, speakCountByChar, speakingCharacterId, isInPerson, videoUnlockedImageIds])

  // 표정영상 해금 — 마스크 10 소모 후 해당 이미지 영상을 재생.
  async function handleUnlockGroupVideo(imageId) {
    if (!imageId || unlockingVideoId) return
    setUnlockingVideoId(imageId)
    try {
      const res = await api.post(`/group-chats/${id}/unlock-image-video`, { characterImageId: imageId })
      setVideoUnlockedImageIds((prev) => new Set([...prev, imageId]))
      if (typeof res.masks === 'number') setMasks(res.masks)
    } catch (err) {
      if (err.status === 402 || err.data?.error === 'INSUFFICIENT_MASKS' || err.message?.includes('INSUFFICIENT')) {
        navigate('/mask-shop')
        return
      }
      console.error('group video unlock failed:', err)
    } finally {
      setUnlockingVideoId(null)
    }
  }

  // 추천 답변 — 마지막 CHARACTER 메시지에 부착된 suggestedReplies. 유저 차례(마지막이 유저 아님)에만 노출.
  const activeSuggestedReplies = useMemo(() => {
    const msgs = groupChat?.messages || []
    const last = msgs[msgs.length - 1]
    if (!last || last.role === 'USER') return null
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'CHARACTER') return msgs[i].suggestedReplies || null
    }
    return null
  }, [groupChat?.messages])

  async function handleSend(overrideText) {
    const text = typeof overrideText === 'string' && overrideText.trim() ? overrideText.trim() : input.trim()
    if (!text || sending || !groupChat) return
    if (activeCount === 0) return

    const userMsg = {
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    }

    // 낙관적 업데이트
    setGroupChat((prev) => prev ? ({
      ...prev,
      messages: [...(prev.messages || []), userMsg],
    }) : prev)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = ''
    setSending(true)

    try {
      let receivedMessages = null
      let memberUpdates = null
      let receivedUserLocation = null
      let receivedPresenceModeChanged = null

      // 스트리밍 버블 누적 — Map 형태로 turn/bubble 인덱스별 최신 상태 유지
      const bubbleMap = new Map() // key=`${turnIdx}_${bubbleIdx}` → bubble obj

      await api.stream(`/group-chats/${id}/messages`, {
        content: userMsg.content,
        voiceWithChat: voiceMode,
        chatModel,
      }, (eventType, data) => {
        if (eventType === 'delta') {
          // delta: { turnIdx, characterId, bubbleIdx, role, content, complete }
          const key = `${data.turnIdx}_${data.bubbleIdx}`
          bubbleMap.set(key, data)
          // 정렬된 배열로 변환 (turnIdx → bubbleIdx 순)
          const sorted = Array.from(bubbleMap.values()).sort((a, b) => {
            if (a.turnIdx !== b.turnIdx) return a.turnIdx - b.turnIdx
            return a.bubbleIdx - b.bubbleIdx
          })
          setStreamingBubbles(sorted)
        } else if (eventType === 'done') {
          receivedMessages = data.responseMessages
          memberUpdates = data.memberUpdates
          receivedUserLocation = data.userLocation || null
          receivedPresenceModeChanged = data.presenceModeChanged || null
        } else if (eventType === 'error') {
          throw new Error(data.error || 'Stream error')
        }
      })

      // SSE done 이후 일괄 반영 — 스트리밍 버블 비우고 실제 메시지 추가
      if (receivedMessages) {
        setGroupChat((prev) => {
          if (!prev) return prev
          const updatedMembers = (prev.members || []).map((m) => {
            const upd = memberUpdates?.find((u) => u.characterId === m.characterId)
            if (!upd) return m
            return {
              ...m,
              affinity: upd.affinity,
              currentStyleId: upd.currentStyleId,
              characterStatus: upd.characterStatus,
              isWithUser: typeof upd.isWithUser === 'boolean' ? upd.isWithUser : m.isWithUser,
            }
          })
          return {
            ...prev,
            messages: [...(prev.messages || []), ...receivedMessages],
            members: updatedMembers,
            ...(receivedUserLocation ? { userLocation: receivedUserLocation } : {}),
            ...(receivedPresenceModeChanged ? { presenceMode: receivedPresenceModeChanged } : {}),
          }
        })
        setStreamingBubbles([])
        if (receivedPresenceModeChanged === 'PHONE') setPresenceModeToast('PHONE_AUTO')
      }

      // 마스크 잔액 새로고침
      try {
        const me = await api.get('/auth/me')
        if (typeof me.masks === 'number') setMasks(me.masks)
      } catch {}
    } catch (err) {
      console.error(err)
      // 유저 메시지를 롤백 + 부분 스트리밍 버블 제거
      setGroupChat((prev) => prev ? ({
        ...prev,
        messages: (prev.messages || []).filter((m) => m !== userMsg),
      }) : prev)
      setStreamingBubbles([])
      // 미성년 성적 콘텐츠 검열 차단 — 메시지 증발이 아니라 검열임을 명확히 안내(V1 채팅과 동일 토스트).
      if (err.data?.error === 'MINOR_CONTENT_BLOCKED' || err.message === 'MINOR_CONTENT_BLOCKED') {
        setSending(false)
        setBlockToast(err.data?.warned ? t('chat.minorBlockedWarned') : t('chat.minorBlocked'))
        return
      }
      // 마스크 부족(402) → 마스크 상점으로 이동. 재시도해도 의미 없으므로 즉시 분기.
      if (err.message?.includes('Insufficient masks')) {
        setSending(false)
        navigate('/mask-shop')
        return
      }
    } finally {
      setSending(false)
    }
  }

  async function setSafetyMode(enabled) {
    if (!groupChat) return
    const prev = groupChat.safetyMode !== false
    setGroupChat((p) => p ? { ...p, safetyMode: enabled } : p)
    try {
      await api.patch(`/group-chats/${id}/safety-mode`, { enabled })
    } catch (err) {
      setGroupChat((p) => p ? { ...p, safetyMode: prev } : p)
      if (err?.data?.error === 'ADULT_VERIFICATION_REQUIRED') navigate('/adult-verify')
    }
  }

  async function togglePresenceMode() {
    if (!groupChat || toggleDisabled) return
    const nextMode = isInPerson ? 'PHONE' : 'IN_PERSON'
    const prevMode = presenceMode
    // 낙관적 업데이트
    setGroupChat((prev) => prev ? { ...prev, presenceMode: nextMode } : prev)
    setPresenceModeToast(nextMode)
    try {
      const { groupChat: updated } = await api.patch(`/group-chats/${id}/presence-mode`, { mode: nextMode })
      setGroupChat(updated)
    } catch (err) {
      console.error(err)
      setGroupChat((prev) => prev ? { ...prev, presenceMode: prevMode } : prev)
      setPresenceModeToast(null)
    }
  }

  // 토스트 자동 닫힘 (3초)
  useEffect(() => {
    if (!presenceModeToast) return
    const t = setTimeout(() => setPresenceModeToast(null), 3000)
    return () => clearTimeout(t)
  }, [presenceModeToast])

  useEffect(() => {
    if (!blockToast) return
    const timer = setTimeout(() => setBlockToast(null), 5000)
    return () => clearTimeout(timer)
  }, [blockToast])


  // 렌더 가능한 메시지 전체 목록 (memoize — 인풋 타이핑 리렌더마다 filter 재계산 방지).
  const renderableMessages = useMemo(
    () => (groupChat?.messages || []).filter((m) => m.content || m.role === 'GENERATED_IMAGE'),
    [groupChat?.messages]
  )

  // 렌더 페이지네이션 — 최근 visibleCount개만 DOM에 그림. slice는 뒤(최신)에서 잘라 항상 최신이 보이게.
  const visibleStart = Math.max(0, renderableMessages.length - visibleCount)
  const visibleMessages = useMemo(
    () => renderableMessages.slice(visibleStart),
    [renderableMessages, visibleStart]
  )

  // 위로 스크롤 시 이전 메시지 로드 (스크롤 위치 보존). V1 Chat.jsx의 loadMore와 동일 전략:
  //  1) 로컬에 아직 안 그린 메시지가 있으면 그것부터 노출(네트워크 X)
  //  2) 다 그렸는데 서버에 이전 청크가 더 있으면(hasMoreBefore) 서버에서 fetch해 앞에 prepend
  const loadMore = useCallback(async () => {
    const container = scrollContainerRef.current
    const prevHeight = container?.scrollHeight ?? 0
    const prevTop = container?.scrollTop ?? 0
    const restoreScroll = () => requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight + prevTop
    })

    if (visibleStart > 0) {
      setVisibleCount((c) => Math.min(renderableMessages.length, c + PAGE_SIZE))
      restoreScroll()
      return
    }

    if (!hasMoreBefore || loadingOlderRef.current) return
    loadingOlderRef.current = true
    try {
      const resp = await api.get(
        `/group-chats/${id}/messages?limit=${PAGE_SIZE}&before=${windowStartRef.current}`
      )
      windowStartRef.current = resp.messageWindowStart ?? 0
      setHasMoreBefore(!!resp.hasMoreBefore)
      const older = Array.isArray(resp.messages) ? resp.messages : []
      if (older.length) {
        const olderRenderable = older.filter((m) => m.content || m.role === 'GENERATED_IMAGE').length
        setGroupChat((prev) => prev ? { ...prev, messages: [...older, ...(prev.messages || [])] } : prev)
        // prepend한 렌더 가능한 개수만큼 window를 넓혀 새로 붙은 이전 메시지를 노출.
        setVisibleCount((c) => c + olderRenderable)
        restoreScroll()
      }
    } catch {
      // 이전 청크 로드 실패는 조용히 무시 (다음 스크롤에서 재시도)
    } finally {
      loadingOlderRef.current = false
    }
  }, [visibleStart, renderableMessages.length, hasMoreBefore, id])

  useEffect(() => {
    // 로컬에 안 그린 게 남았거나(visibleStart>0) 서버에 이전 청크가 더 있으면 옵저버 부착.
    if (visibleStart <= 0 && !hasMoreBefore) return
    const sentinel = topSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0, root: scrollContainerRef.current, rootMargin: '200px 0px 0px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleStart, hasMoreBefore, loadMore])

  async function handleDelete() {
    try {
      await api.delete(`/group-chats/${id}`)
      navigate('/group-chats', { replace: true })
    } catch (err) {
      console.error(err)
    }
  }

  if (!groupChat) {
    return (
      <div className="pt-10 text-center text-gray-500 text-sm">{t('common.loading', { defaultValue: '...' })}</div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <Helmet>
        <title>{headerTitle || t('groupChat.title')}</title>
      </Helmet>


      {/* 상단 오버레이 — 헤더(슬림 바) + 상태 패널(보더 카드) + 모드 토글. 1:1 채팅과 동일하게 헤더/상태 패널 분리. */}
      <div ref={topBarRef} className="absolute top-0 left-0 right-0 z-20">
      {/* 헤더 — 슬림 글래스 바 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/30 bg-gray-900/30">
        <button
          onClick={() => navigate('/group-chats')}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-800"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 멤버 아바타 콜라주 — 표시 전용 (멤버 시트는 하단 사람 아이콘 버튼으로 진입) */}
        <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <div className="flex -space-x-2">
            {(groupChat.members || []).slice(0, 4).map((m) => {
              const src = getNeutralImage(m.character)
              return (
                <div key={m.characterId} className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-950 overflow-hidden">
                  {src && <img src={src} alt="" className={`w-full h-full object-cover ${m.isActive ? '' : 'grayscale opacity-40'}`} />}
                </div>
              )
            })}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{headerTitle}</div>
            <div className="text-xs text-gray-500">{t('groupChat.members')}: {activeCount}/{(groupChat.members || []).length}</div>
          </div>
        </div>

        {/* 상태 패널 접기/펼치기 — 셰브론 (1:1 채팅과 동일) */}
        <button
          onClick={() => setShowStatusPanel((v) => !v)}
          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-800"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label={showStatusPanel ? t('groupChat.collapseStatus', { defaultValue: '상태 패널 접기' }) : t('groupChat.expandStatus', { defaultValue: '상태 패널 펼치기' })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showStatusPanel ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
          </svg>
        </button>

      </div>

      {/* 상태 패널 — 유저 장소 + 동행/원격 그룹. 헤더와 분리된 보더 카드 (1:1 채팅 상태 패널과 동일 스타일). 셰브론으로 접기/펼치기. */}
      {showStatusPanel && (
      <div className="mx-3 mt-2 px-3 py-2 rounded-2xl border border-gray-800/50 bg-gray-900/75 flex-shrink-0 space-y-2">
        <div className="text-[11px] text-gray-400">
          {t('groupChat.yourLocation')}: <span className="text-gray-100 font-medium">{groupChat.userLocation || '집'}</span>
        </div>

        {[
          { key: 'withYou', members: (groupChat.members || []).filter((m) => m.isWithUser), label: t('groupChat.withYou'), dotClass: 'bg-emerald-400', headerClass: 'text-emerald-400' },
          { key: 'elsewhere', members: (groupChat.members || []).filter((m) => !m.isWithUser), label: t('groupChat.elsewhere'), dotClass: 'bg-gray-500', headerClass: 'text-gray-500' },
        ].map((section) => (
          <div key={section.key}>
            <div className={`text-[10px] mb-1 flex items-center gap-1 ${section.headerClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${section.dotClass}`} />
              {section.label}
            </div>
            {/* overflow-x-auto는 overflow-y도 auto가 되어 세로 클립됨 → 칩의 ring-2(바깥 2px)/좌측이 잘리지 않게 padding 확보 */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-0.5">
              {section.members.length === 0 ? (
                <span className="text-[10px] text-gray-600">-</span>
              ) : (
                section.members.map((m) => {
                  const avatar = getNeutralImage(m.character)
                  const mood = m.characterStatus?.mood
                  const emoji = m.characterStatus?.emoji
                  const excited = !!m.characterStatus?.isExcited
                  const participating = isParticipating(m)
                  // 색상: 참여중(초록) > 비참여(검정/제외) > 비활성(회색)
                  const chipClass = !m.isActive
                    ? 'bg-gray-900/70 border-gray-800 opacity-40'
                    : participating
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-black/80 border-gray-800'
                  const nameClass = !m.isActive
                    ? 'text-gray-400'
                    : participating
                      ? 'text-emerald-100'
                      : 'text-gray-500'
                  const moodClass = !m.isActive
                    ? 'text-gray-500'
                    : participating
                      ? 'text-emerald-200/70'
                      : 'text-gray-600'
                  return (
                    <div
                      key={m.characterId}
                      className={`relative flex-shrink-0 flex items-center gap-2 px-2 py-1.5 rounded-full border ${chipClass} ${excited ? 'ring-2 ring-pink-500/70 animate-pulse' : ''}`}
                      title={excited ? t('groupChat.excitedHint', { defaultValue: '흥분 상태' }) : ''}
                    >
                      <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                        {avatar && <img src={avatar} alt="" className={`w-full h-full object-cover ${participating && m.isActive ? '' : 'grayscale'}`} />}
                      </div>
                      <div className="min-w-0 max-w-[140px]">
                        <div className={`text-[11px] leading-tight truncate flex items-center gap-0.5 ${nameClass}`}>
                          {m.character?.name}
                          {excited && <span className="text-pink-400">♥</span>}
                        </div>
                        {/* mood — 자르지 않고 전부 출력 (LLM에 10자 이내 지시). 길면 줄바꿈. */}
                        <div className={`text-[10px] leading-tight break-words ${moodClass}`}>
                          {emoji ? <span className="mr-0.5">{emoji}</span> : null}
                          {mood || '-'}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* 모드 토글 행 — 좌측: Safety + 메신저 모드(대면/전화) 토글, 우측: 설정(표정 출력 방식) */}
      <div className="flex justify-between items-center px-3 py-2 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (!user?.adultVerified) {
              navigate('/adult-verify')
              return
            }
            if (safetyMode) {
              setSafetyConfirmVisible(true)
            } else {
              setSafetyMode(true)
            }
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            !user?.adultVerified
              ? 'text-gray-500 hover:text-gray-300 bg-gray-800/60'
              : safetyMode
                ? 'text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/20'
                : 'text-pink-300 bg-pink-500/15 hover:bg-pink-500/20'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          title={!user?.adultVerified ? t('safetyMode.verifyRequired') : safetyMode ? t('safetyMode.tooltipOn') : t('safetyMode.tooltipOff')}
        >
          {!user?.adultVerified ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <span className="w-2 h-2 rounded-full" style={{ background: safetyMode ? '#34d399' : '#f472b6' }} />
          )}
          <span>{safetyMode ? 'Safety ON' : 'Safety OFF'}</span>
        </button>

        <button
          onClick={togglePresenceMode}
          disabled={toggleDisabled}
          title={
            toggleDisabled
              ? t('groupChat.presenceMode.disabledHint')
              : isInPerson
                ? t('groupChat.presenceMode.switchToPhoneHint')
                : t('groupChat.presenceMode.switchToInPersonHint')
          }
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
            toggleDisabled
              ? 'bg-gray-900/60 border border-gray-800 opacity-50 cursor-not-allowed text-gray-500'
              : isInPerson
                ? 'bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-200'
                : 'bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-200'
          }`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {isInPerson ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2.5" />
              <line x1="12" y1="18" x2="12" y2="18" />
            </svg>
          )}
        </button>
        </div>

        <div className="flex items-center gap-2">
          {/* 멤버 — 멤버 관리 페이지로 이동. 1:1 채팅의 사람 아이콘 위치와 동일.
              상황극(컨셉) 방은 캐스팅 고정이라 멤버 변경 불가 → 버튼 숨김. */}
          {!isConcept && (
          <button
            onClick={() => navigate(`/group-chats/${id}/members`)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-800/80 border border-gray-700/50 text-gray-200 hover:bg-gray-700/80 shadow-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('groupChat.members', { defaultValue: '멤버' })}
            title={t('groupChat.members', { defaultValue: '멤버' })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
          )}

          {/* 기억 — 톡방 장기 기억 페이지로 이동 (1:1 채팅의 '기억' 버튼과 동일 위치·아이콘) */}
          <button
            onClick={() => navigate(`/group-chats/${id}/memory`)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-800/80 border border-gray-700/50 text-gray-200 hover:bg-gray-700/80 shadow-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('memory.button', { defaultValue: '기억' })}
            title={t('memory.button', { defaultValue: '기억' })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </button>

          {/* 설정 — 채팅 설정 페이지로 이동 (표정 이미지 출력 방식 등) */}
          <button
            onClick={() => navigate(`/group-chats/${id}/settings`)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-800/80 border border-gray-700/50 text-gray-200 hover:bg-gray-700/80 shadow-lg transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('groupChatSettings.title', { defaultValue: '채팅 설정' })}
            title={t('groupChatSettings.title', { defaultValue: '채팅 설정' })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>
      </div>

      {/* 모드 전환 토스트 — 자동 폴백/수동 전환 공통 */}
      {presenceModeToast && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[120px] z-40 px-3 py-2 rounded-full bg-gray-900/95 border border-gray-700 text-xs text-white shadow-lg whitespace-nowrap pointer-events-none animate-fade-in">
          {presenceModeToast === 'PHONE_AUTO'
            ? t('groupChat.presenceMode.autoFallbackToast')
            : presenceModeToast === 'IN_PERSON'
              ? t('groupChat.presenceMode.switchedToInPerson')
              : t('groupChat.presenceMode.switchedToPhone')}
        </div>
      )}

      {/* 검열 차단 토스트 — 미성년 성적 콘텐츠 등으로 메시지가 차단됐을 때 (V1 채팅과 동일 안내) */}
      {blockToast && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[120px] z-40 max-w-[85%] px-4 py-2.5 rounded-xl bg-red-900/95 border border-red-700 text-xs leading-relaxed text-white shadow-lg text-center animate-fade-in">
          {blockToast}
        </div>
      )}

      {/* 메시지 영역 — 전체 높이를 채우고(flex-1), 상·하단 오버레이는 반투명 absolute라 그 뒤로 메시지가 비쳐 스크롤됨.
          패딩으로 첫/마지막 메시지가 오버레이에 가리지 않게 여백 확보 (상태바·스프라이트 뒤로 채팅 보임). */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-y-auto px-3 space-y-2"
        style={{
          paddingTop: `${topBarHeight + 12}px`,
          paddingBottom: `${bottomBarHeight + 28}px`,
        }}
      >
        {/* 위로 스크롤 시 이전 메시지를 더 노출시키는 sentinel — 아직 안 그린 메시지가 있을 때만 존재 */}
        {(visibleStart > 0 || hasMoreBefore) && <div ref={topSentinelRef} className="h-px" aria-hidden />}
        {renderableMessages.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-10">{t('groupChat.emptyMessages')}</div>
        )}
        {visibleMessages.map((msg, i) => {
          // 연속 버블 그룹핑: 같은 작가(USER끼리 또는 같은 characterId)에 같은 분이면 한 그룹.
          // 그룹 내 첫 버블만 아바타/이름 표시, 마지막 버블만 시간 표시.
          // 그룹핑 판정은 잘리지 않은 전체 목록(renderableMessages) 기준으로 해야 윈도우 경계에서도 정확.
          const idx = visibleStart + i
          const prevMsg = renderableMessages[idx - 1]
          const nextMsg = renderableMessages[idx + 1]
          const sameAuthor = (a, b) => {
            if (!a || !b || a.role !== b.role) return false
            if (a.role === 'NARRATION') return false
            if (a.role === 'CHARACTER') return a.characterId === b.characterId
            return a.role === 'USER'
          }
          const sameMinute = (a, b) => {
            if (!a?.createdAt || !b?.createdAt) return false
            return formatChatTime(a.createdAt) === formatChatTime(b.createdAt)
          }
          const isConsecutivePrev = sameAuthor(prevMsg, msg) && sameMinute(prevMsg, msg)
          const isLastInGroup = !sameAuthor(msg, nextMsg) || !sameMinute(msg, nextMsg)
          const character = msg.role === 'CHARACTER' ? memberById.get(msg.characterId)?.character : undefined

          return (
            <GroupMessageBubble
              key={idx}
              msg={msg}
              character={character}
              isConsecutivePrev={isConsecutivePrev}
              isLastInGroup={isLastInGroup}
            />
          )
        })}

        {/* 대기 버블 — 메시지 전송 직후 첫 delta가 오기 전까지의 빈 구간 */}
        {sending && streamingBubbles.length === 0 && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0" />
            <div className="px-3 py-2.5 rounded-2xl rounded-tl-md bg-gray-800 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* 스트리밍 중인 버블 — done 이벤트로 실제 메시지에 머지될 때까지 렌더 */}
        {streamingBubbles.map((b, idx) => {
          // 스트리밍 버블도 같은 캐릭터 연속이면 아바타·이름 1회만.
          // (모두 한 응답에서 나온 거라 시간 비교 불필요.)
          const prevB = streamingBubbles[idx - 1]
          const isConsecutivePrev = !!prevB && prevB.role === 'CHARACTER' && b.role === 'CHARACTER' && prevB.characterId === b.characterId

          if (b.role === 'NARRATION') {
            return (
              <div key={`s-${b.turnIdx}-${b.bubbleIdx}`} className="my-3 mx-4 px-3 py-2 bg-gray-900/70 rounded-lg text-center text-xs text-gray-300 italic leading-relaxed">
                {b.content}
                {!b.complete && <span className="ml-1 animate-pulse text-gray-500">▍</span>}
              </div>
            )
          }
          const member = memberById.get(b.characterId)
          const character = member?.character
          const avatar = getNeutralImage(character)
          const segs = parseMessageSegments(b.content, 'CHARACTER')
          return (
            <div key={`s-${b.turnIdx}-${b.bubbleIdx}`} className="flex items-start gap-2">
              <div className="w-8 flex-shrink-0">
                {!isConsecutivePrev && (
                  <div className="w-8 h-8 rounded-full bg-gray-800 overflow-hidden">
                    {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                  </div>
                )}
              </div>
              <div className="max-w-[75%]">
                {!isConsecutivePrev && (
                  <div className="text-xs text-gray-400 mb-0.5">{character?.name || '...'}</div>
                )}
                <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-gray-800 text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {segs.map((s, i) => (
                    <span key={i}>
                      {i > 0 && '\n\n'}
                      {s.type === 'action'
                        ? <span className="italic text-gray-400/80">{s.value}</span>
                        : s.value}
                    </span>
                  ))}
                  {!b.complete && <span className="ml-0.5 animate-pulse text-gray-400">▍</span>}
                </div>
              </div>
            </div>
          )
        })}

        {/* 텍스트 스트림 완료 후 done 이벤트 대기 — 마지막 버블 아래 작은 스피너 (1:1 채팅과 동일 패턴) */}
        {sending && streamingBubbles.length > 0 && streamingBubbles.every((b) => b.complete) && (
          <div className="flex justify-start mt-1.5 ml-10 items-center gap-1.5 text-gray-500">
            <svg width="14" height="14" viewBox="0 0 24 24" className="animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeDasharray="42 100" strokeLinecap="round" />
            </svg>
            <span className="text-[10px]">{t('groupChat.finalizing', { defaultValue: '응답 마무리 중...' })}</span>
          </div>
        )}

        {/* 추천 답변 — 마지막 버블 아래. 유저 차례에 노출, 탭하면 그대로 전송 (1:1 채팅과 동일). */}
        {activeSuggestedReplies && !sending && streamingBubbles.length === 0 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            {activeSuggestedReplies.question && (
              <button
                type="button"
                onClick={() => handleSend(activeSuggestedReplies.question)}
                className="max-w-[90%] truncate px-4 py-2 rounded-full text-xs bg-gray-800/95 border border-gray-700 text-gray-200 hover:border-indigo-500 hover:text-white transition-colors shadow"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                💬 {activeSuggestedReplies.question}
              </button>
            )}
            {activeSuggestedReplies.normal && (
              <button
                type="button"
                onClick={() => handleSend(activeSuggestedReplies.normal)}
                className="max-w-[90%] truncate px-4 py-2 rounded-full text-xs bg-gray-800/95 border border-gray-700 text-gray-200 hover:border-indigo-500 hover:text-white transition-colors shadow"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {activeSuggestedReplies.normal}
              </button>
            )}
            {activeSuggestedReplies.sexual && (
              <button
                type="button"
                onClick={() => handleSend(activeSuggestedReplies.sexual)}
                className="max-w-[90%] truncate px-4 py-2 rounded-full text-xs bg-rose-900/50 border border-rose-700/50 text-rose-200 hover:border-rose-400 hover:text-rose-100 transition-colors shadow"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {activeSuggestedReplies.sexual}
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 하단 오버레이 — 스프라이트 행 + 인풋 바. */}
      <div ref={bottomBarRef} className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      {/* 참여 페소나 표정 sprite 행 — 인풋 바로 위 1줄 (최대 4명). BUBBLE(기본) 모드에서만 표시. FULL은 풀스크린 배경으로 대체. */}
      {spriteMode === 'BUBBLE' && spriteParticipants.length > 0 && (
        <div className="flex items-end justify-end gap-2 px-3 pt-2 pb-3 pointer-events-none">
          {spriteParticipants.map((p) => (
            <div key={p.characterId} className="flex flex-col items-center gap-1.5 pointer-events-auto">
              {/* 미해금 표정영상 카드 — 표정 이미지 카드 "위"에 별도 표시 (1:1 채팅과 동일 UI). 블러 재생 + 해금 CTA */}
              {p.needsUnlock && (
                <button
                  type="button"
                  onClick={() => { if (unlockingVideoId !== p.imageId) handleUnlockGroupVideo(p.imageId) }}
                  className="relative w-16 rounded-2xl overflow-hidden bg-gray-800/80 border border-gray-700/50 shadow-lg cursor-pointer"
                  style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  aria-label={t('groupChat.unlockVideo', { defaultValue: '표정 영상 해금' })}
                >
                  <CrossfadeMedia
                    src={p.videoFilePath}
                    variant="sprite"
                    className="absolute inset-0 w-full h-full object-cover object-bottom blur"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/75 backdrop-blur-sm border border-white/20 rounded-lg px-1.5 py-1 flex flex-col items-center shadow-lg">
                      <div className="flex items-center gap-0.5 text-white text-[10px] font-bold leading-none">
                        <MaskIcon style={{ width: '0.9em', height: '0.9em' }} />
                        <span>{EMOTION_VIDEO_MASK_COST}</span>
                      </div>
                      <span className="text-white/90 text-[8px] font-medium mt-0.5 leading-none">
                        {unlockingVideoId === p.imageId ? t('common.processing', { defaultValue: '처리중' }) : t('groupChat.unlock', { defaultValue: '해금' })}
                      </span>
                    </div>
                  </div>
                </button>
              )}

              {/* 표정 sprite 카드 — 해금 시 영상, 미해금/영상없음 시 이미지 */}
              <button
                type="button"
                onClick={() => setEnlargedSprite({ url: p.activeUrl, name: p.name })}
                className={`relative w-16 rounded-2xl overflow-hidden bg-gray-800/80 shadow-lg transition-all duration-300 ${
                  p.isExcited ? 'ring-2 ring-pink-500/70' : 'ring-1 ring-gray-700/50'
                } ${p.isSpeaking ? 'scale-105' : ''}`}
                style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                aria-label={t('groupChat.enlargeSprite', { defaultValue: '{{name}} 크게 보기', name: p.name })}
              >
                <CrossfadeMedia
                  src={p.activeUrl}
                  variant="sprite"
                  className="absolute inset-0 w-full h-full object-cover object-bottom"
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 바 */}
      <div
        className="border-t border-gray-800/30 bg-gray-900/30 p-3 pointer-events-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {activeCount === 0 && (
          <div className="mb-2 text-xs text-amber-400">{t('groupChat.noActiveMembers')}</div>
        )}
        {/* 모델 선택 — 1:1 채팅과 동일. 기본(BASIC) / 고급(ADVANCED) */}
        <div className="flex items-center gap-1.5 mb-2">
          <button
            onClick={() => setShowModelSheet(true)}
            className={`h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors bg-gray-800/80 hover:bg-gray-700/80 ${
              chatModel === 'ADVANCED' ? 'ring-1 ring-amber-400 text-amber-300' : 'text-gray-200'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('chat.modelSelectorTitle', { defaultValue: '채팅 모델' })}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {chatModel === 'ADVANCED' ? t('chat.modelAdvanced', { defaultValue: '고급' }) : t('chat.modelBasic', { defaultValue: '기본' })}
          </button>
        </div>
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 116) + 'px'
            }}
            placeholder=""
            rows={1}
            className="flex-1 h-10 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
          />
          <button
            onClick={insertActionParens}
            type="button"
            title={t('groupChat.actionButton', { defaultValue: '행동 묘사 ( ) 추가' })}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="text-[15px] font-mono leading-none">( )</span>
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || activeCount === 0}
            className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-30 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold leading-none flex items-center gap-px bg-black/60 px-1 py-0.5 rounded">
                -{msgCost}<MaskIcon className="text-[11px]" />
              </span>
            </span>
          </button>
        </div>
      </div>
      </div>

      {/* 표정 스프라이트 확대 뷰 — 하단 스프라이트 클릭 시 */}
      {enlargedSprite && (
        <div
          className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center px-6"
          onClick={() => setEnlargedSprite(null)}
        >
          <button
            onClick={() => setEnlargedSprite(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('common.close', { defaultValue: '닫기' })}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-[80vh] flex items-center justify-center">
            <SpriteMedia
              src={enlargedSprite.url}
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />
          </div>
          {enlargedSprite.name && (
            <div className="mt-3 text-white text-sm font-medium">{enlargedSprite.name}</div>
          )}
        </div>
      )}

      {/* 채팅 모델 선택 시트 — 1:1 채팅과 동일 UX */}
      {showModelSheet && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShowModelSheet(false)}>
          <div
            className="w-full bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>
            <p className="text-white font-semibold text-center mb-1">{t('chat.modelSelectorTitle', { defaultValue: '채팅 모델 선택' })}</p>
            <p className="text-gray-400 text-xs text-center mb-4">{t('chat.modelSelectorDesc', { defaultValue: '고급 모델은 더 풍부한 응답을 제공해요' })}</p>
            <div className="flex flex-col gap-2">
              {[
                { key: 'BASIC', label: t('chat.modelBasic', { defaultValue: '기본' }), desc: t('chat.modelBasicDesc', { defaultValue: '빠르고 가벼운 응답' }), cost: GROUP_MODEL_COSTS.BASIC },
                { key: 'ADVANCED', label: t('chat.modelAdvanced', { defaultValue: '고급' }), desc: t('chat.modelAdvancedDesc', { defaultValue: '더 풍부하고 몰입감 있는 응답' }), cost: GROUP_MODEL_COSTS.ADVANCED },
              ].map((opt) => {
                const selected = chatModel === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => { setChatModel(opt.key); setShowModelSheet(false) }}
                    className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                      selected
                        ? (opt.key === 'ADVANCED' ? 'bg-amber-600/20 border-amber-500' : 'bg-indigo-600/20 border-indigo-500')
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-200'}`}>{opt.label}</span>
                      <span className={`text-xs font-medium flex items-center gap-0.5 ${opt.key === 'ADVANCED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {t('chat.maskCostLabel', { count: opt.cost, defaultValue: `마스크 ${opt.cost}개` })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Safety OFF 확인 모달 */}
      {safetyConfirmVisible && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => setSafetyConfirmVisible(false)}>
          <div
            className="bg-gray-900 border border-pink-700/40 rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-pink-600/20 border border-pink-500/40 flex items-center justify-center mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-line mb-5">{t('safetyMode.confirmOff')}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setSafetyConfirmVisible(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {t('common.cancel', { defaultValue: '취소' })}
                </button>
                <button
                  onClick={() => {
                    setSafetyConfirmVisible(false)
                    setSafetyMode(false)
                  }}
                  className="flex-1 px-4 py-2.5 bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold rounded-xl transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  Safety OFF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 모달 */}
      {showDelete && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={() => setShowDelete(false)}>
          <div
            className="w-full max-w-[420px] bg-gray-900 rounded-2xl border border-gray-700 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">{t('groupChat.deleteTitle')}</h3>
            <p className="text-sm text-gray-400 mb-5">{t('groupChat.deleteDescription')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
