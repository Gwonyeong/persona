import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

// 메인 + 분기 노드를 사용자 선택에 따라 평탄화한 sequence
function computeSequence(allNodes, choices) {
  const branchMap = new Map()
  const mainNodes = []
  for (const n of allNodes) {
    if (n.branchFromChoiceId == null) mainNodes.push(n)
    else {
      if (!branchMap.has(n.branchFromChoiceId)) branchMap.set(n.branchFromChoiceId, [])
      branchMap.get(n.branchFromChoiceId).push(n)
    }
  }
  mainNodes.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const arr of branchMap.values()) arr.sort((a, b) => a.branchSortOrder - b.branchSortOrder)

  function expand(node) {
    const out = [node]
    const chapterChoices = node.choices || []
    for (const c of chapterChoices) {
      const chosen = choices[node.id]
      if (chosen && chosen.id === c.id) {
        const branch = branchMap.get(c.id) || []
        for (const bn of branch) out.push(...expand(bn))
        break
      }
    }
    return out
  }

  const sequence = []
  for (const n of mainNodes) sequence.push(...expand(n))
  return sequence
}

// 현재 시점에서 거슬러 올라가 연속된 CHAT 노드의 아이템을 모음 — 챗 누적 표현용.
// CHAT 노드 경계를 넘어 이전 CHAT 노드의 tail까지 끌어옴 (분기 CHAT 노드로 넘어가도 직전 채팅이 그대로 유지됨).
// CHAPTER/RESULT 노드를 만나면 거기서 멈춤. CHAT 안의 cg 아이템도 블록을 끊음.
// narration/character/user는 모두 포함 — narration은 시스템 메시지로 렌더됨.
//
// choicesByNodeId: { nodeId → choice } 형태. 이전 CHAT 노드에서 유저가 고른 선택지가 있으면
// 가상 user 라인으로 그 노드 끝에 끼워 넣어 채팅 히스토리에 보존한다.
// 단, 다음 노드의 첫 아이템이 이미 그 선택지 label을 echo하는 user 라인이면 중복 방지.
function getCrossChapterChatBlock(sequence, nodeIndex, scriptIndex, choicesByNodeId) {
  // 1단계: 노드별 그룹을 시간 순(과거→현재)으로 수집
  const groups = []
  let i = nodeIndex
  let j = scriptIndex

  while (i >= 0) {
    const node = sequence[i]
    if (node?.nodeType !== 'CHAT') break
    const script = node.script || []
    const groupItems = []
    let walkedToStart = true
    while (j >= 0) {
      const item = script[j]
      if (!item) { j--; continue }
      if (item.mode === 'cg') {
        walkedToStart = false
        break
      }
      groupItems.unshift({ ...item, _key: `${node.id}-${j}` })
      j--
    }
    groups.unshift({ nodeId: node.id, items: groupItems })
    if (!walkedToStart) break
    i--
    if (i >= 0) {
      const prev = sequence[i]
      if (prev?.nodeType !== 'CHAT') break
      const prevScript = prev.script || []
      j = prevScript.length - 1
    }
  }

  // 2단계: 그룹을 평탄화하면서 그룹 사이에 선택지 echo 가상 라인 삽입
  const lines = []
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g]
    lines.push(...grp.items)
    // 마지막 그룹(현재 노드)의 선택지는 commit 전이므로 처리하지 않음
    if (g < groups.length - 1) {
      const picked = choicesByNodeId?.[grp.nodeId]
      if (picked) {
        const nextFirstItem = groups[g + 1]?.items?.[0]
        const alreadyEchoed =
          nextFirstItem?.mode === 'user' &&
          (nextFirstItem.content || '').trim() === (picked.label || '').trim()
        if (!alreadyEchoed) {
          lines.push({
            mode: 'user',
            content: picked.label,
            _key: `choice-${picked.id}`,
            _isChoiceEcho: true,
          })
        }
      }
    }
  }
  return lines
}

// 배경 URL이 영상인지 판별 — 어드민에서 영상 배경을 등록한 경우 <video>로 재생
function isBgVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const cleaned = url.split(/[?#]/)[0].toLowerCase()
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(cleaned)
}

// asset library 항목들에서 url → posterUrl 매핑 — 영상 로드 전 첫 프레임 노출용
function buildPosterMap(storyline) {
  const map = new Map()
  const lib = storyline?.assetLibrary || {}
  for (const bucket of [lib.backgrounds, lib.characters, lib.chatImage, lib.chatVideo]) {
    for (const it of (bucket || [])) {
      if (it?.url && it.posterUrl) map.set(it.url, it.posterUrl)
    }
  }
  return map
}

// 시퀀스 nodeIndex 시점 직전까지의 sticky 음향(bgmUrl/bgsUrl) 마지막 값 추적.
// 진행도 불러오기 시 이전 노드들에서 설정됐던 BGM/BGS를 그대로 이어 재생하기 위함.
function findLatestStickyBefore(sequence, nodeIndex, field) {
  let latest = null
  for (let i = 0; i < nodeIndex && i < sequence.length; i++) {
    const n = sequence[i]
    if (n?.nodeType !== 'CHAPTER' && n?.nodeType !== 'CHAT') continue
    for (const it of (n.script || [])) {
      if (it && it[field]) latest = it[field]
    }
  }
  return latest
}

// CHAPTER 텍스트 박스 영역 — 전체 컨테이너에서 하단 정렬 (텍스트 박스 + 선택지 column flex)
// safe-area 패딩으로 홈 인디케이터 침범 방지, paddingTop으로 헤더 영역 확보.
// 텍스트 박스는 자체 max-height + scroll로 길어져도 선택지가 화면 밖으로 밀리지 않게 한다.
const MESSAGE_AREA_STYLE = {
  paddingTop: 'calc(env(safe-area-inset-top) + 64px)',
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: '0.75rem',
}

const TEXT_BOX_STYLE = {
  backgroundColor: 'rgba(0,0,0,0.65)',
  maxHeight: '45vh',
  overflowY: 'auto',
}

export default function Storyline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token, masks, setMasks } = useStore()

  const [storyline, setStoryline] = useState(null)
  const [error, setError] = useState(null)

  // 현재 위치
  const [nodeIndex, setNodeIndex] = useState(0)
  const [scriptIndex, setScriptIndex] = useState(0)
  // CHAT 노드의 mode:'user' 아이템에서 send 버튼 → 즉시 다음으로 넘어가지 않고 버블만 보여주는 중간 상태
  // true면 user 버블이 채팅에 노출되지만 다음 character 메시지는 아직 안 보임. 화면 탭 시 advance하며 false로 초기화.
  const [userSent, setUserSent] = useState(false)

  // 진행 상태
  const [choices, setChoices] = useState({})
  const [lockedAtIndex, setLockedAtIndex] = useState(0)
  const [completeCalled, setCompleteCalled] = useState(false)

  // UI
  const [toast, setToast] = useState(null)
  const [showRestartModal, setShowRestartModal] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [selectingChoiceId, setSelectingChoiceId] = useState(null)
  const [chatLightbox, setChatLightbox] = useState(null)
  const [audioMuted, setAudioMuted] = useState(false)

  // 음향만 sticky 유지 (다음 변경까지 이어짐). 배경/캐릭터 이미지는 비-sticky —
  // 각 script 아이템에 명시 등록된 경우에만 렌더되도록 currentItem에서 직접 읽음.
  const [currentBgm, setCurrentBgm] = useState(null)
  const [currentBgs, setCurrentBgs] = useState(null)

  // 음향은 React 렌더 트리 밖에서 imperative하게 관리한다.
  // <audio key={url}> JSX는 부모 re-render나 reconciliation으로 의도치 않게 mount/unmount되어 끊김.
  // 추가로 브라우저 autoplay 정책: unmuted audio는 user gesture 없이 재생 시도 시 ~0.3s 후 강제 pause됨.
  // 따라서 muted autoplay로 시작 → 첫 user 인터랙션에서 unmute 하는 패턴을 사용 (YouTube/Twitter 등 표준).
  const bgmStateRef = useRef({ url: null, audio: null })
  const bgsStateRef = useRef({ url: null, audio: null })
  const hasInteractedRef = useRef(false)
  const tryPlayAudio = () => {
    hasInteractedRef.current = true
    const bgm = bgmStateRef.current.audio
    const bgs = bgsStateRef.current.audio
    if (bgm) {
      bgm.muted = audioMuted
      bgm.play().catch(() => {})
    }
    if (bgs) {
      bgs.muted = audioMuted
      bgs.play().catch(() => {})
    }
  }

  // 프리미엄 미디어 해금 상태 — Set<mediaUrl>
  const [unlockedMedia, setUnlockedMedia] = useState(new Set())
  // 해금 모달 — { mediaUrl, maskCost } | null
  const [unlockModal, setUnlockModal] = useState(null)
  const [unlocking, setUnlocking] = useState(false)
  // 인라인 미디어 라이트박스 (CHAT 미디어 클릭 시 풀스크린)
  const [mediaLightbox, setMediaLightbox] = useState(null) // { url, type: 'image'|'video' } | null
  // 같은 시나리오의 다음 파트 — RESULT 화면 "다음 파트로" 버튼용
  const [nextPart, setNextPart] = useState(null)
  // 이전 attempt들에서 진행한 노드 ID 집합 — 결과 페이지 PREMIUM 분기 미디어 영구 unlock 판별용
  const [historicalNodeIds, setHistoricalNodeIds] = useState(new Set())

  // ── 데이터 로드 ─────────────────────────────────────────
  useEffect(() => {
    api.get(`/storylines/${id}`)
      .then(({ storyline, progress, unlockedMediaUrls, unlockedNodeIds, nextPart }) => {
        setStoryline(storyline)
        setUnlockedMedia(new Set(unlockedMediaUrls || []))
        setHistoricalNodeIds(new Set(unlockedNodeIds || []))
        setNextPart(nextPart || null)

        // 저장된 선택지 복원
        const restoredChoices = {}
        if (progress?.choices?.length) {
          const choicesById = new Map()
          for (const n of (storyline.nodes || [])) {
            for (const c of (n.choices || [])) choicesById.set(c.id, c)
          }
          for (const pc of progress.choices) {
            const c = choicesById.get(pc.choiceId)
            if (c) restoredChoices[pc.nodeId] = c
          }
          setChoices(restoredChoices)
        }

        // 저장 시점으로 점프 — 더불어 그 시점까지의 sticky BGM/BGS도 복원
        let restoredBgm = storyline.defaultBgm || null
        let restoredBgs = null
        if (progress?.currentNodeId) {
          const seq = computeSequence(storyline.nodes || [], restoredChoices)
          const idx = seq.findIndex((n) => n.id === progress.currentNodeId)
          if (idx >= 0) {
            setNodeIndex(idx)
            setLockedAtIndex(idx)
            const latestBgm = findLatestStickyBefore(seq, idx, 'bgmUrl')
            const latestBgs = findLatestStickyBefore(seq, idx, 'bgsUrl')
            if (latestBgm) restoredBgm = latestBgm
            if (latestBgs) restoredBgs = latestBgs
          }
        }

        setCurrentBgm(restoredBgm)
        setCurrentBgs(restoredBgs)
      })
      .catch((e) => {
        if (e?.status === 403 && e?.data?.locked) {
          setError({ locked: true, reason: e.data.reason })
          return
        }
        setError(e?.message || 'Failed to load')
      })
  }, [id])

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  const sequence = useMemo(
    () => storyline ? computeSequence(storyline.nodes || [], choices) : [],
    [storyline, choices]
  )

  // url → posterUrl 매핑 — 영상 재생 위치마다 poster 속성으로 첫 프레임 즉시 노출
  const posterMap = useMemo(() => buildPosterMap(storyline), [storyline])

  // 결과 페이지에 노출할 "프리미엄 컨텐츠" — 해금 여부와 무관하게 모두 수집.
  // 1) PREMIUM 선택지의 분기(중첩 sub-branch 포함) 노드들의 backgroundImage / fullMediaUrl
  //    → 진행한 시퀀스에 포함된 노드면 unlocked, 아니면 locked
  // 2) CHAT 노드의 mode='media' + variant='premium' 미디어 → unlockedMedia 기록으로 판별
  const premiumMedia = useMemo(() => {
    if (!storyline) return []
    const out = []
    const seen = new Map() // url → out index
    const lib = storyline.assetLibrary || {}
    const libTypeMap = new Map()
    for (const bucket of [lib.backgrounds, lib.characters, lib.chatImage, lib.chatVideo]) {
      for (const it of (bucket || [])) {
        if (it?.url && it.mediaType) libTypeMap.set(it.url, it.mediaType)
      }
    }
    const detectType = (url, hint) => {
      if (hint === 'video' || hint === 'image') return hint
      const libType = libTypeMap.get(url)
      if (libType === 'video' || libType === 'image') return libType
      return isBgVideoUrl(url) ? 'video' : 'image'
    }
    const push = (url, hint, unlocked) => {
      if (!url) return
      if (seen.has(url)) {
        // 같은 URL이 다른 곳에서 unlocked로 나오면 잠금 해제로 승격
        const idx = seen.get(url)
        if (unlocked) out[idx].unlocked = true
        return
      }
      seen.set(url, out.length)
      const type = detectType(url, hint)
      const posterUrl = type === 'video' ? posterMap.get(url) : null
      out.push({ url, type, unlocked: !!unlocked, ...(posterUrl ? { posterUrl } : {}) })
    }

    const choiceMap = new Map()
    const nodeMap = new Map()
    for (const n of storyline.nodes || []) {
      nodeMap.set(n.id, n)
      for (const c of (n.choices || [])) choiceMap.set(c.id, { ...c, parentNodeId: n.id })
    }
    // 노드의 분기 조상 체인을 따라가며 PREMIUM 조상이 있는지 검사
    const hasPremiumAncestor = (node) => {
      let cur = node
      while (cur && cur.branchFromChoiceId != null) {
        const ch = choiceMap.get(cur.branchFromChoiceId)
        if (!ch) return false
        if (ch.choiceType === 'PREMIUM') return true
        cur = nodeMap.get(ch.parentNodeId)
      }
      return false
    }
    // 진행한 시퀀스 — 현재 attempt + 이전 attempt들 union
    // (새로하기로 attempt가 바뀌어도 이전에 본 미디어가 다시 잠기지 않도록 historicalNodeIds 합집합)
    const currentSeqIds = computeSequence(storyline.nodes || [], choices).map((n) => n.id)
    const playedNodeIds = new Set([...historicalNodeIds, ...currentSeqIds])

    for (const n of storyline.nodes || []) {
      if (!hasPremiumAncestor(n)) continue
      const unlocked = playedNodeIds.has(n.id)
      for (const it of (n.script || [])) {
        if (it?.backgroundImage) push(it.backgroundImage, undefined, unlocked)
        if (it?.fullMediaUrl) push(it.fullMediaUrl, it.fullMediaType, unlocked)
      }
    }

    // CHAT premium 미디어 — 해금 여부와 무관하게 모두 수집, unlockedMedia 기록 기준으로 unlocked 판별
    for (const n of storyline.nodes || []) {
      if (n.nodeType !== 'CHAT') continue
      for (const it of (n.script || [])) {
        if (it?.mode === 'media' && it.variant === 'premium' && it.mediaUrl) {
          push(it.mediaUrl, it.mediaType, !!unlockedMedia?.has(it.mediaUrl))
        }
      }
    }
    return out
  }, [storyline, choices, unlockedMedia, historicalNodeIds])
  const node = sequence[nodeIndex]
  const isLastNode = nodeIndex === sequence.length - 1
  const hasScript = node?.nodeType === 'CHAPTER' || node?.nodeType === 'CHAT'
  const script = hasScript ? (node?.script || []) : []
  const currentItem = hasScript ? script[scriptIndex] : null
  const isAtLastItem = hasScript ? scriptIndex >= script.length - 1 : true

  // 음향만 sticky — 새 URL이 나오면 갱신, null/undefined면 직전 값 유지
  // 배경/캐릭터 이미지는 비-sticky로 렌더 시점에 currentItem에서 직접 읽음
  useEffect(() => {
    if (!currentItem) return
    if (currentItem.bgmUrl) setCurrentBgm(currentItem.bgmUrl)
    if (currentItem.bgsUrl) setCurrentBgs(currentItem.bgsUrl)
  }, [node?.id, scriptIndex])

  // unmuted autoplay 가능 여부 — 이미 인터랙션이 있었거나 브라우저가 user activation을 보고함
  const canPlayUnmuted = () => {
    if (hasInteractedRef.current) return true
    try { return !!navigator.userActivation?.hasBeenActive } catch { return false }
  }

  // BGM/BGS imperative lifecycle — currentBgm 변경 시에만 audio 재생성
  // unmuted autoplay 허용 환경이면 user 설정 그대로 시도, 아니면 force-mute로 시작.
  // play()가 reject되면(드물지만) muted로 fallback해서 라이프사이클 살림.
  useEffect(() => {
    const ref = bgmStateRef.current
    if (!currentBgm) {
      if (ref.audio) {
        ref.audio.pause()
        bgmStateRef.current = { url: null, audio: null }
      }
      return
    }
    if (ref.url !== currentBgm) {
      ref.audio?.pause()
      const audio = new Audio(currentBgm)
      audio.loop = true
      audio.volume = 0.6
      audio.muted = canPlayUnmuted() ? audioMuted : true
      bgmStateRef.current = { url: currentBgm, audio }
    }
    const a = bgmStateRef.current.audio
    a.play().catch(() => {
      a.muted = true
      a.play().catch(() => {})
    })
  }, [currentBgm])

  useEffect(() => {
    const ref = bgsStateRef.current
    if (!currentBgs) {
      if (ref.audio) {
        ref.audio.pause()
        bgsStateRef.current = { url: null, audio: null }
      }
      return
    }
    if (ref.url !== currentBgs) {
      ref.audio?.pause()
      const audio = new Audio(currentBgs)
      audio.loop = true
      audio.volume = 0.4
      audio.muted = canPlayUnmuted() ? audioMuted : true
      bgsStateRef.current = { url: currentBgs, audio }
    }
    const a = bgsStateRef.current.audio
    a.play().catch(() => {
      a.muted = true
      a.play().catch(() => {})
    })
  }, [currentBgs])

  // 음소거 토글 동기화 — 인터랙션 후에만 user 설정 반영 (인터랙션 전엔 force-mute 유지)
  useEffect(() => {
    if (!hasInteractedRef.current) return
    if (bgmStateRef.current.audio) bgmStateRef.current.audio.muted = audioMuted
    if (bgsStateRef.current.audio) bgsStateRef.current.audio.muted = audioMuted
  }, [audioMuted])

  // 컴포넌트 unmount 시 모든 audio 정리
  useEffect(() => {
    return () => {
      bgmStateRef.current.audio?.pause()
      bgsStateRef.current.audio?.pause()
      bgmStateRef.current = { url: null, audio: null }
      bgsStateRef.current = { url: null, audio: null }
    }
  }, [])

  // 현재 아이템에 명시 등록된 배경/캐릭터만 노출
  const currentBg = currentItem?.backgroundImage || null
  const currentCharImage = currentItem?.characterImage || null

  // RESULT 도달 시 자동 완료
  useEffect(() => {
    if (completeCalled || !token || !sequence.length) return
    const cur = sequence[nodeIndex]
    if (cur?.nodeType !== 'RESULT') return
    setCompleteCalled(true)
    api.post(`/storylines/${id}/complete`)
      .catch((e) => {
        console.error('Complete storyline failed:', e)
        setCompleteCalled(false)
      })
  }, [sequence, nodeIndex, completeCalled, token, id])

  // ── 진행 로직 ───────────────────────────────────────────
  const advance = () => {
    if (!node) return
    // userSent가 true면 (사용자 메시지 버블이 노출 중) — 한 번 더 탭한 것이므로 그제서야 다음 아이템으로
    if (userSent) setUserSent(false)
    if (hasScript && scriptIndex < script.length - 1) {
      setScriptIndex(scriptIndex + 1)
      return
    }
    if (isLastNode) {
      navigate(-1)
      return
    }
    setNodeIndex(nodeIndex + 1)
    setScriptIndex(0)
  }

  const goBack = () => {
    if (!node) return
    // 사용자 메시지를 막 보낸 상태(userSent=true)에서 뒤로 가면 → 버블을 다시 감추고 send 버튼 상태로 복귀
    if (userSent) {
      setUserSent(false)
      return
    }
    if (hasScript && scriptIndex > 0) {
      setScriptIndex(scriptIndex - 1)
      return
    }
    if (nodeIndex === 0 || nodeIndex <= lockedAtIndex) return
    const prevNode = sequence[nodeIndex - 1]
    setNodeIndex(nodeIndex - 1)
    const prevHasScript = prevNode?.nodeType === 'CHAPTER' || prevNode?.nodeType === 'CHAT'
    if (prevHasScript) {
      const prevScript = prevNode.script || []
      setScriptIndex(Math.max(0, prevScript.length - 1))
    } else {
      setScriptIndex(0)
    }
    if (prevNode && prevNode.id != null) {
      setChoices((prev) => {
        if (!(prevNode.id in prev)) return prev
        const next = { ...prev }
        delete next[prevNode.id]
        return next
      })
    }
  }

  // 사용자 send 버튼 클릭 — 즉시 advance 안 하고 user 버블만 노출하는 중간 상태로 진입
  // 화면을 한 번 더 탭(advance)하면 그때서야 다음 아이템(캐릭터 메시지)으로 진행
  const handleUserSend = () => {
    setUserSent(true)
  }

  // 노드/scriptIndex 변경 시 userSent 리셋 (다른 챕터로 이동 등)
  useEffect(() => {
    setUserSent(false)
  }, [node?.id, scriptIndex])

  // ── 선택지 처리 (애니 + 저장) ───────────────────────────
  const handleChoiceClick = (choice) => {
    if (selectingChoiceId !== null) return

    const isPremium = choice.choiceType === 'PREMIUM'
    const cost = choice.maskCost || 0
    if (isPremium && cost > 0 && (masks ?? 0) < cost) {
      setToast('마스크가 부족합니다')
      return
    }

    setSelectingChoiceId(choice.id)
    setTimeout(() => {
      setSelectingChoiceId(null)
      commitChoice(choice)
    }, 2000)
  }

  const commitChoice = async (choice) => {
    const nextChoices = { ...choices, [node.id]: choice }
    const nextSequence = computeSequence(storyline.nodes || [], nextChoices)
    const currentIdxInNext = nextSequence.findIndex((n) => n.id === node.id)
    const nextNode = nextSequence[currentIdxInNext + 1]
    const nextNodeId = nextNode?.id ?? null
    const lockTarget = currentIdxInNext + 1

    setChoices(nextChoices)
    setNodeIndex(lockTarget)
    setScriptIndex(0)

    if (token) {
      try {
        const res = await api.post(`/storylines/${id}/save-choice`, {
          nodeId: node.id,
          choiceId: choice.id,
          nextNodeId,
        })
        setToast('저장 완료')
        setLockedAtIndex(lockTarget)
        if (res.masks != null) setMasks(res.masks)
      } catch (e) {
        const errMsg = e?.response?.data?.error || e?.message
        if (errMsg && errMsg.toLowerCase().includes('mask')) {
          setToast('마스크가 부족합니다')
        } else {
          console.error('Save choice failed:', e)
        }
      }
    }
  }

  const handleRestart = async () => {
    if (!token || restarting) return
    setRestarting(true)
    try {
      await api.post(`/storylines/${id}/restart`)
      setNodeIndex(0)
      setScriptIndex(0)
      setChoices({})
      setLockedAtIndex(0)
      setCompleteCalled(false)
      setShowRestartModal(false)
      setToast('새 진행 시작')
      setCurrentBgm(storyline?.defaultBgm || null)
      setCurrentBgs(null)
    } catch (e) {
      console.error('Restart failed:', e)
    } finally {
      setRestarting(false)
    }
  }

  // ── 렌더링 분기 결정 ───────────────────────────────────
  if (error) {
    const isLocked = typeof error === 'object' && error?.locked
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-gray-400 gap-3 px-6 text-center">
        {isLocked ? (
          <>
            <div className="w-12 h-12 rounded-full bg-indigo-600/20 flex items-center justify-center mb-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <p className="text-white text-sm font-bold">로그인이 필요해요</p>
            <p className="text-xs leading-relaxed">로그인 후 스토리를 진행할 수 있어요.</p>
          </>
        ) : (
          <p>스토리를 불러오지 못했습니다.</p>
        )}
        <button onClick={() => navigate(-1)} className="text-sm text-indigo-400 mt-1" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>돌아가기</button>
      </div>
    )
  }
  if (!storyline) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">로딩 중...</div>
  }
  if (!node) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">스토리 끝</div>
  }

  // 노드 타입 & 아이템 분류
  const isChapterNode = node.nodeType === 'CHAPTER'
  const isChatNode = node.nodeType === 'CHAT'
  const isResultNode = node.nodeType === 'RESULT'

  // 챕터 끝 + 선택지 있을 때 우측 탭 비활성화 (선택 강제)
  const hasChoices = hasScript && Array.isArray(node.choices) && node.choices.length > 0
  const waitingChoice = hasChoices && isAtLastItem
  const showTapZones = !isResultNode

  // 챗 누적 블록 — CHAT 노드에서만
  // choices 상태를 전달해서 이전 CHAT 노드의 선택지가 채팅 히스토리에 user 버블로 남도록
  const rawChatBlock = isChatNode && currentItem
    ? getCrossChapterChatBlock(sequence, nodeIndex, scriptIndex, choices)
    : []

  // CHAT 노드의 mode:'user' 아이템 → 자동 버블 대신 화면 하단 "보내기" 버튼으로 처리
  // 클릭 전: chat history에서 제외 + UserInputButton 노출
  // 클릭 시: scriptIndex 진행 → 다음 렌더에서 chatBlock walker가 user item을 history로 포함
  // userSent=false면 user 버블 자리에 send 버튼 노출 (버블은 chatBlock에서 제외)
  // userSent=true면 user 버블이 chatBlock에 포함되고, 다음 아이템(캐릭터 메시지)은 아직 안 보임
  // 다음 화면 탭으로 advance 시 userSent=false + scriptIndex++ → 다음 아이템 등장
  const showUserAsButton = isChatNode && currentItem?.mode === 'user' && !userSent
  const chatBlock = showUserAsButton ? rawChatBlock.slice(0, -1) : rawChatBlock

  // 비주얼 노벨 텍스트 박스 뷰 — CHAPTER 노드
  const isVnTextView = isChapterNode && currentItem
  // 채팅 뷰 — CHAT 노드
  const isChatView = isChatNode && currentItem

  return (
    <div
      className="relative w-full h-dvh bg-black text-white overflow-hidden select-none"
      onClickCapture={tryPlayAudio}
      onTouchStartCapture={tryPlayAudio}
    >
      {/* 배경 — CHAT 노드는 다크 그레이, CHAPTER는 풀 배경(이미지/영상), RESULT는 자체 그라디언트 */}
      {isChatView ? (
        <div className="absolute inset-0 bg-gray-950" />
      ) : isResultNode ? null : currentBg ? (
        isBgVideoUrl(currentBg) ? (
          <video
            key={currentBg}
            src={currentBg}
            poster={posterMap.get(currentBg) || undefined}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ backgroundColor: '#000' }}
            loop
            muted
            playsInline
            preload="auto"
            onLoadedData={(e) => {
              // 첫 프레임이 디코딩된 직후 잠시 정지화면으로 보여주고 재생 시작 — 회색 로딩 화면 대신 첫 프레임 노출
              const v = e.currentTarget
              setTimeout(() => { v.play().catch(() => {}) }, 300)
            }}
          />
        ) : (
          <img src={currentBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
      )}

      {/* 캐릭터 등장 시 약한 배경 딤드 (CHAPTER 노드의 비-cg 아이템) */}
      {isVnTextView && currentCharImage && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
      )}

      {/* 캐릭터 standing 이미지 — CHAPTER 노드의 비-cg 아이템 */}
      {isVnTextView && currentCharImage && (
        <div className="absolute inset-x-0 flex items-end justify-center pointer-events-none" style={{ top: '8%', bottom: 'env(safe-area-inset-bottom)' }}>
          <img src={currentCharImage} alt="" className="max-h-full max-w-full object-contain drop-shadow-2xl" />
        </div>
      )}

      {/* fullMedia (script item 레벨, narration에서 가능) */}
      {currentItem?.fullMediaUrl && (
        currentItem.fullMediaType === 'video'
          ? <video src={currentItem.fullMediaUrl} poster={posterMap.get(currentItem.fullMediaUrl) || undefined} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
          : <img src={currentItem.fullMediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* 음향 — BGM/BGS는 imperative하게 관리 (위 useEffect 참조). voice는 per-item이라 JSX */}
      {currentItem?.voiceUrl && (
        <audio
          key={`voice-${node?.id}-${scriptIndex}-${currentItem.voiceUrl}`}
          src={currentItem.voiceUrl}
          autoPlay
          muted={audioMuted}
          ref={(el) => { if (el) el.volume = 0.85 }}
        />
      )}

      {/* 콘텐츠 — nodeType별 분기 */}
      {isVnTextView && (
        <VnTextBoxView
          item={currentItem}
          storyline={storyline}
          user={user}
          showChoices={waitingChoice}
          choices={node.choices}
          masks={masks}
          onChoice={handleChoiceClick}
          selectingChoiceId={selectingChoiceId}
        />
      )}

      {isChatView && (
        <ChatBlockView
          chatBlock={chatBlock}
          storyline={storyline}
          posterMap={posterMap}
          user={user}
          masks={masks}
          showChoices={waitingChoice && !showUserAsButton}
          choices={node.choices}
          userButton={showUserAsButton ? currentItem : null}
          onUserButtonClick={handleUserSend}
          onChoice={handleChoiceClick}
          selectingChoiceId={selectingChoiceId}
          onMediaClick={setChatLightbox}
          unlockedMedia={unlockedMedia}
          onUnlockRequest={(line) => setUnlockModal({ mediaUrl: line.mediaUrl, maskCost: line.maskCost || 0 })}
          onMediaPreview={(line) => setMediaLightbox({ url: line.mediaUrl, type: line.variant === 'video' ? 'video' : 'image' })}
        />
      )}

      {isResultNode && (
        <ResultView
          node={node}
          storyline={storyline}
          premiumMedia={premiumMedia}
          token={token}
          nextPart={nextPart}
          onClose={() => navigate(-1)}
          onRestart={() => setShowRestartModal(true)}
          onNextPart={(partId) => {
            // 다음 파트로 — 같은 페이지에서 storylineId만 바꿔 navigate
            navigate(`/storylines/${partId}`, { replace: true })
          }}
          onMediaClick={(m) => setMediaLightbox({ url: m.url, type: m.type })}
        />
      )}

      {/* 탭 영역 */}
      {showTapZones && (
        <>
          <button
            onClick={goBack}
            className="absolute left-0 top-0 bottom-0 w-1/2 z-10 bg-transparent"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="이전"
          />
          {!waitingChoice && !showUserAsButton && (
            <button
              onClick={advance}
              className="absolute right-0 top-0 bottom-0 w-1/2 z-10 bg-transparent"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="다음"
            />
          )}
        </>
      )}

      {/* 헤더 — X + 음향 토글 */}
      <div
        className="absolute top-0 left-0 right-0 z-30 px-4 flex items-center justify-between"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-full text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label="닫기"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <button
          onClick={() => setAudioMuted((m) => !m)}
          className={`w-9 h-9 flex items-center justify-center backdrop-blur-sm rounded-full transition-colors ${audioMuted ? 'bg-black/50 text-gray-400' : 'bg-black/50 text-white'}`}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          aria-label={audioMuted ? '음향 켜기' : '음향 끄기'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
            {audioMuted && <line x1="3" y1="3" x2="21" y2="21" />}
          </svg>
        </button>
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className="absolute right-0 z-40 px-4 pointer-events-none overflow-hidden"
          style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
        >
          <div
            className="px-3.5 py-1.5 bg-emerald-600/95 text-white text-xs font-semibold rounded-full shadow-lg"
            style={{ animation: 'toastSlideInOut 1.8s ease-in-out forwards' }}
          >
            {toast}
          </div>
        </div>
      )}

      {/* 채팅 미디어 인라인 풀스크린 (정상 미디어 클릭 시) */}
      {mediaLightbox && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden"
          onClick={() => setMediaLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMediaLightbox(null) }}
            className="absolute right-4 z-10 w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-full text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', top: 'calc(env(safe-area-inset-top) + 14px)' }}
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {mediaLightbox.type === 'video' ? (
            <video
              src={mediaLightbox.url}
              poster={posterMap.get(mediaLightbox.url) || undefined}
              className="h-full w-auto max-w-none"
              autoPlay loop controls playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={mediaLightbox.url}
              alt=""
              className="h-full w-auto max-w-none"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {/* 프리미엄 미디어 해금 모달 */}
      {unlockModal && (
        <div
          className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => !unlocking && setUnlockModal(null)}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">프리미엄 미디어</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed text-center mb-2">
              마스크 <span className="text-amber-400 font-bold">{unlockModal.maskCost}개</span>를 이용해 해금할 수 있어요!
            </p>
            <p className="text-xs text-gray-500 text-center mb-5">
              현재 잔액: <span className="text-gray-300">{masks ?? 0} 마스크</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => !unlocking && setUnlockModal(null)}
                disabled={unlocking}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={async () => {
                  if (!token) {
                    setToast('로그인이 필요합니다')
                    return
                  }
                  if ((masks ?? 0) < (unlockModal.maskCost || 0)) {
                    setToast('마스크가 부족합니다')
                    return
                  }
                  setUnlocking(true)
                  try {
                    const res = await api.post(`/storylines/${id}/unlock-media`, { mediaUrl: unlockModal.mediaUrl })
                    if (res.masks != null) setMasks(res.masks)
                    setUnlockedMedia((prev) => {
                      const next = new Set(prev)
                      next.add(unlockModal.mediaUrl)
                      return next
                    })
                    setUnlockModal(null)
                    setToast('🖼️ 해금 완료')
                  } catch (e) {
                    const msg = e?.data?.error || e?.message || '해금 실패'
                    setToast(msg)
                  } finally {
                    setUnlocking(false)
                  }
                }}
                disabled={unlocking || (masks ?? 0) < (unlockModal.maskCost || 0)}
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-500 transition-colors text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {unlocking ? '해금 중...' : `🎭 ${unlockModal.maskCost} 지불`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅 미디어 풀스크린 라이트박스 */}
      {chatLightbox && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden"
          onClick={() => setChatLightbox(null)}
        >
          <button
            onClick={() => setChatLightbox(null)}
            className="absolute right-4 z-10 w-10 h-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-full text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', top: 'calc(env(safe-area-inset-top) + 14px)' }}
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {chatLightbox.type === 'video' ? (
            <video
              src={chatLightbox.url}
              poster={posterMap.get(chatLightbox.url) || undefined}
              className="h-full w-auto max-w-none"
              autoPlay loop muted playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={chatLightbox.url}
              alt=""
              className="h-full w-auto max-w-none"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {/* 새로하기 모달 */}
      {showRestartModal && (
        <div
          className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => !restarting && setShowRestartModal(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">새로하기</h3>
            <p className="text-sm text-gray-300 leading-relaxed mb-2">
              기존 진행 데이터가 제거되고 처음부터 다시 시작됩니다.
            </p>
            <p className="text-xs text-emerald-400 leading-relaxed mb-6">
              해금한 이미지는 그대로 유지됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRestartModal(false)}
                disabled={restarting}
                className="flex-1 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                취소
              </button>
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors text-sm font-medium disabled:opacity-50"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {restarting ? '준비 중...' : '새로하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// VN 텍스트 박스 뷰 — 비주얼 노벨식 (하단 1/3)
// CHAPTER 노드의 narration / character / user 모두 처리
//   narration: 화자명 좌측(선택), 텍스트
//   character: 캐릭터명 좌측 뱃지(인디고), content
//   user: 유저명 우측 뱃지(에메랄드), content
// ───────────────────────────────────────────────────────────
function VnTextBoxView({ item, storyline, user, showChoices, choices, masks, onChoice, selectingChoiceId }) {
  let speakerName = null
  let badgeSide = 'left'
  let badgeColor = 'bg-indigo-600'
  let text = ''

  if (item.mode === 'narration') {
    speakerName = item.speakerName || null
    text = item.text || ''
    badgeColor = 'bg-gray-700'
  } else if (item.mode === 'character') {
    speakerName = item.name || storyline.character?.name || null
    text = item.content || ''
    badgeColor = 'bg-indigo-600'
  } else if (item.mode === 'user') {
    speakerName = item.name || user?.name || '나'
    text = item.content || ''
    badgeSide = 'right'
    badgeColor = 'bg-emerald-600'
  }

  return (
    <div className="absolute inset-0">
      {(text || showChoices) && (
        <div
          className="absolute inset-0 z-20 px-5 pointer-events-none"
          style={MESSAGE_AREA_STYLE}
        >
          {text && (
            <div className="relative pointer-events-auto">
              {speakerName && (
                <span
                  className={`absolute -top-2.5 z-10 ${badgeSide === 'right' ? 'right-3' : 'left-3'} px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap shadow-lg ${badgeColor} text-white`}
                >
                  {speakerName}
                </span>
              )}
              <div className="rounded-xl px-4 py-5" style={TEXT_BOX_STYLE}>
                <p className="text-[15px] leading-relaxed text-white whitespace-pre-line">
                  {text}
                </p>
              </div>
            </div>
          )}
          {showChoices && (
            <ChoiceButtons
              choices={choices}
              masks={masks}
              onChoice={onChoice}
              selectingChoiceId={selectingChoiceId}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// Chat Block 뷰 — 누적 말풍선
// ───────────────────────────────────────────────────────────
function ChatBlockView({ chatBlock, storyline, posterMap, user, masks, showChoices, choices, userButton, onUserButtonClick, onChoice, selectingChoiceId, onMediaClick, unlockedMedia, onUnlockRequest, onMediaPreview }) {
  const characterName = storyline.character?.name || ''
  // 채팅 아바타는 Character 테이블의 profileImage만 사용 (fallback 없음)
  const profileUrl = storyline.character?.profileImage || null
  const userName = user?.name || '나'

  const pickedChoice = selectingChoiceId
    ? choices?.find((c) => c.id === selectingChoiceId)
    : null
  const displayLines = pickedChoice
    ? [...chatBlock, { mode: 'user', content: pickedChoice.label, _isPicked: true }]
    : chatBlock

  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatBlock.length, showChoices, selectingChoiceId, userButton?.content])

  return (
    <div className="absolute inset-0">
      {/* 누적 말풍선 영역 — 항상 동일한 위치/높이.
         하단에 send 버튼/선택지 영역을 고정으로 예약(bottom 120px)해서, 버튼이 나타나도 버블이 위로 밀리지 않음.
         bottom-up 정렬로 버블이 항상 send 영역 바로 위에 붙어있도록 (채팅 앱 UX). */}
      <div
        ref={scrollRef}
        className="absolute inset-x-0 top-0 overflow-auto px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 64px)',
          // 하단에 UserInputButton/ChoiceButtons floating 영역 예약
          // (선택지 2개 + 마스크 뱃지 + safe-area 여백 모두 수용)
          bottom: 'calc(env(safe-area-inset-bottom) + 150px)',
        }}
      >
        <div className="min-h-full flex flex-col justify-end space-y-1 pb-2">
          {displayLines.map((line, i) => {
            // CHAT 안의 narration → 가운데 정렬 시스템 메시지
            if (line.mode === 'narration') {
              return (
                <div key={i} className="flex justify-center my-3 px-4">
                  <p className="text-xs text-gray-400 italic text-center leading-relaxed whitespace-pre-line">
                    {line.text}
                  </p>
                </div>
              )
            }
            // CHAT의 mode:'media' — 캐릭터가 보내는 이미지/영상/프리미엄
            if (line.mode === 'media') {
              return (
                <ChatMediaBubble
                  key={i}
                  line={line}
                  posterMap={posterMap}
                  profileUrl={profileUrl}
                  characterName={characterName}
                  isUnlocked={!!unlockedMedia && unlockedMedia.has(line.mediaUrl)}
                  onUnlockRequest={onUnlockRequest}
                  onPreview={onMediaPreview}
                />
              )
            }
            const prev = displayLines[i - 1]
            const isConsecutive = prev?.mode === line.mode
            const isUser = line.mode === 'user'
            const bubbleStyle = line._isPicked ? { animation: 'storyChoiceBlink 1s ease-in-out 2' } : undefined
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isConsecutive ? '' : 'mt-3'}`}>
                {!isUser && (
                  <div className="w-7 flex-shrink-0 mr-2">
                    {!isConsecutive && (
                      <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden">
                        {profileUrl
                          ? <img src={profileUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[11px] font-semibold">{characterName?.[0] || ''}</div>}
                      </div>
                    )}
                  </div>
                )}
                <div className="max-w-[75%]">
                  {!isUser && !isConsecutive && characterName && (
                    <p className="text-xs text-gray-400 mb-1 font-medium">{line.name || characterName}</p>
                  )}
                  {isUser && !isConsecutive && (
                    <p className="text-xs text-gray-400 mb-1 font-medium text-right">{line.name || userName}</p>
                  )}
                  {line.mediaUrl && (
                    <div
                      className={`mb-1.5 rounded-2xl overflow-hidden cursor-pointer relative z-20 ${isUser ? 'rounded-tr-none' : 'rounded-tl-none'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMediaClick && onMediaClick({ url: line.mediaUrl, type: line.mediaType || 'image' })
                      }}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {line.mediaType === 'video' ? (
                        <>
                          <video src={line.mediaUrl} poster={posterMap?.get(line.mediaUrl) || undefined} className="w-full max-h-[240px] object-cover bg-black" muted loop autoPlay playsInline />
                          <div className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center bg-black/60 rounded-full">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="15 3 21 3 21 9" />
                              <polyline points="9 21 3 21 3 15" />
                              <line x1="21" y1="3" x2="14" y2="10" />
                              <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                          </div>
                        </>
                      ) : (
                        <img src={line.mediaUrl} alt="" className="w-full max-h-[240px] object-cover" loading="lazy" />
                      )}
                    </div>
                  )}
                  {line.content && (
                    <div
                      className={`text-sm leading-relaxed px-3.5 py-2.5 whitespace-pre-line ${isUser ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none' : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'}`}
                      style={bubbleStyle}
                    >
                      {line.content}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 유저 입력 버튼 — 예약된 하단 영역에 floating (버블 영역에 영향 없음) */}
      {userButton && !pickedChoice && (
        <div
          className="absolute inset-x-0 z-20 px-4"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        >
          <UserInputButton item={userButton} userName={userName} onClick={onUserButtonClick} />
        </div>
      )}

      {/* 답장 선택지 — 동일하게 예약된 하단 영역에 floating */}
      {showChoices && !pickedChoice && (
        <div
          className="absolute inset-x-0 z-20 px-4 flex flex-col gap-2"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        >
          <ChoiceButtons
            choices={choices}
            masks={masks}
            onChoice={onChoice}
            selectingChoiceId={selectingChoiceId}
          />
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 유저 입력 버튼 — CHAT 노드의 mode:'user' 아이템을 채팅 입력처럼 표시
// 클릭하면 advance 호출 → 다음 렌더에서 user 버블이 채팅 히스토리에 누적됨
// ───────────────────────────────────────────────────────────
function UserInputButton({ item, userName, onClick }) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        className="w-full text-left px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm transition-colors flex items-center gap-3 shadow-xl"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        aria-label={`보내기: ${item.content}`}
      >
        <span className="flex-1 leading-relaxed whitespace-pre-line">{item.content || (item.mediaUrl ? '(첨부)' : '')}</span>
        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/20 rounded-full">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </span>
      </button>
      <p className="text-[10px] text-gray-500 text-right mt-1.5 pr-1">탭해서 {userName}로 보내기</p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 채팅 미디어 버블 — CHAT의 mode:'media' 아이템 (이미지/영상/프리미엄)
// ───────────────────────────────────────────────────────────
function ChatMediaBubble({ line, posterMap, profileUrl, characterName, isUnlocked, onUnlockRequest, onPreview }) {
  const isVideo = line.variant === 'video'
  const isPremium = line.variant === 'premium'
  const locked = isPremium && !isUnlocked

  const handleClick = (e) => {
    e.stopPropagation()
    if (locked) {
      onUnlockRequest && onUnlockRequest(line)
    } else {
      onPreview && onPreview(line)
    }
  }

  return (
    <div className="flex justify-start mt-3">
      <div className="w-7 flex-shrink-0 mr-2">
        <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden">
          {profileUrl
            ? <img src={profileUrl} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[11px] font-semibold">{characterName?.[0] || ''}</div>}
        </div>
      </div>
      <div className="max-w-[75%]">
        {characterName && (
          <p className="text-xs text-gray-400 mb-1 font-medium">{characterName}</p>
        )}
        <div
          className="relative z-20 rounded-2xl rounded-tl-none overflow-hidden cursor-pointer bg-gray-900"
          onClick={handleClick}
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', maxWidth: '220px' }}
        >
          {isVideo ? (
            <video
              src={line.mediaUrl}
              poster={posterMap?.get(line.mediaUrl) || undefined}
              className="w-full max-h-[280px] object-cover bg-black"
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={line.mediaUrl}
              alt=""
              className={`w-full max-h-[280px] object-cover transition-all ${locked ? 'blur-sm scale-[1.02]' : ''}`}
              loading="lazy"
            />
          )}

          {/* 영상 인디케이터 */}
          {isVideo && (
            <div className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center bg-black/60 rounded-full pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            </div>
          )}

          {/* 프리미엄 잠금 오버레이 */}
          {locked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px]">
              <div className="w-10 h-10 flex items-center justify-center bg-amber-500/90 rounded-full mb-1.5 shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-[11px] text-white font-bold drop-shadow">탭해서 해금</p>
              <p className="text-[10px] text-amber-200 mt-0.5 drop-shadow">🎭 {line.maskCost || 0}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 선택지 버튼 (공통)
// ───────────────────────────────────────────────────────────
function ChoiceButtons({ choices, masks, onChoice, selectingChoiceId }) {
  return (
    <div className="mt-4 flex flex-col gap-2 pointer-events-auto">
      {choices.map((c) => {
        const isPremium = c.choiceType === 'PREMIUM'
        const cost = c.maskCost || 0
        const insufficient = isPremium && cost > 0 && (masks ?? 0) < cost
        const isSelecting = selectingChoiceId === c.id
        const isOtherWhileSelecting = selectingChoiceId != null && selectingChoiceId !== c.id

        const baseClass = 'w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 border relative'
        const variantClass = isPremium
          ? insufficient
            ? ' bg-gray-900/60 border-gray-800 text-gray-400'
            : ' bg-amber-900/30 hover:bg-amber-900/50 active:bg-amber-900/60 border-amber-600/60 hover:border-amber-500 text-amber-50'
          : ' bg-gray-900/85 hover:bg-indigo-900/70 active:bg-indigo-800/70 border-gray-700 hover:border-indigo-500 text-gray-100'

        const animStyle = {
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          transition: 'opacity 0.3s ease',
        }
        if (isOtherWhileSelecting) {
          animStyle.opacity = 0.2
          animStyle.pointerEvents = 'none'
        } else if (isSelecting) {
          animStyle.animation = 'storyChoiceBlink 1s ease-in-out 2'
        }

        return (
          <button key={c.id} onClick={() => onChoice(c)} className={baseClass + variantClass} style={animStyle}>
            <span className="flex-1">{c.label}</span>
            {isPremium && cost > 0 && (
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap border ${insufficient ? 'bg-red-950/60 text-red-300 border-red-900/50' : 'bg-amber-950/70 text-amber-200 border-amber-700/50'}`}>
                <svg width="16" height="10" viewBox="0 0 32 20" fill="currentColor" fillRule="evenodd" style={{ transform: 'scaleY(-1)' }}>
                  <path d="M0 10C0 5 3.5 0 8.5 0c2.5 0 4.5 1.2 7.5 4 3-2.8 5-4 7.5-4C28.5 0 32 5 32 10c0 2.5-1 4.5-2.8 6-1.2 1-2.8 1.8-4.2 2.2-1.5.4-2.8.3-3.8-.2-1.2-.6-2.2-1.8-3.5-3.8L16 11l-1.7 3.2c-1.3 2-2.3 3.2-3.5 3.8-1 .5-2.3.6-3.8.2C5.6 17.8 4 17 2.8 16 1 14.5 0 12.5 0 10zM7 7.5C5.5 7.5 4.2 8.5 3.8 10c-.3 1 .2 1.8 1 2.2 1 .5 2.3.3 3.4-.3 1.2-.7 2-1.7 2.3-2.8.3-1-.1-1.8-1-2.2-.5-.2-1.2-.2-1.8-.1l-.7.2zM25 7.5l-.7-.2c-.6-.1-1.3-.1-1.8.1-.9.4-1.3 1.2-1 2.2.3 1.1 1.1 2.1 2.3 2.8 1.1.6 2.4.8 3.4.3.8-.4 1.3-1.2 1-2.2-.4-1.5-1.7-2.5-3.2-2.5z" />
                </svg>
                {cost}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// Result 뷰 — 결말 페이지 + 프리미엄 미디어 그리드
// ───────────────────────────────────────────────────────────
function ResultView({ node, storyline, premiumMedia = [], token, nextPart, onClose, onRestart, onNextPart, onMediaClick }) {
  return (
    <div
      className="absolute inset-0 overflow-auto bg-black"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 64px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <div className="px-6 max-w-md mx-auto">
        <p className="text-center text-xs text-indigo-400 font-semibold tracking-[0.3em] mb-3">FIN</p>
        <h2 className="text-center text-2xl font-bold text-white mb-8">{node.resultTitle || storyline.title}</h2>

        {premiumMedia.length > 0 && (() => {
          const unlockedCount = premiumMedia.filter((m) => m.unlocked).length
          const lockedStyle = { filter: 'blur(3px)', transform: 'scale(1.03)' }
          return (
            <div className="mb-8">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                프리미엄 컨텐츠 ({unlockedCount} / {premiumMedia.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {premiumMedia.map((m, i) => {
                  const Tag = m.unlocked ? 'button' : 'div'
                  const tagProps = m.unlocked
                    ? {
                        onClick: () => onMediaClick && onMediaClick({ url: m.url, type: m.type }),
                        style: { outline: 'none', WebkitTapHighlightColor: 'transparent' },
                      }
                    : {}
                  return (
                    <Tag
                      key={i}
                      className="aspect-[9/16] rounded-lg overflow-hidden relative bg-gray-900 border border-gray-800"
                      {...tagProps}
                    >
                      {m.type === 'video' && m.unlocked ? (
                        // 다운로드 완료 전까지 poster(첫 프레임)가 노출되고, 디코드되면 자연스럽게 영상 재생으로 전환
                        <video
                          src={m.url}
                          poster={m.posterUrl || undefined}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                          preload="auto"
                          onLoadedData={(e) => { e.currentTarget.play().catch(() => {}) }}
                        />
                      ) : m.type === 'video' ? (
                        // 잠긴 비디오는 재생할 일이 없으므로 포스터가 있으면 영상 다운로드 자체를 회피
                        m.posterUrl ? (
                          <img
                            src={m.posterUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            style={lockedStyle}
                          />
                        ) : (
                          <video
                            src={m.url}
                            className="w-full h-full object-cover"
                            style={lockedStyle}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        )
                      ) : (
                        <img
                          src={m.url}
                          alt=""
                          className="w-full h-full object-cover"
                          style={m.unlocked ? undefined : lockedStyle}
                        />
                      )}
                      {!m.unlocked && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 drop-shadow">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                      )}
                    </Tag>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <div className="flex flex-col gap-2">
          {/* 다음 파트로 — 같은 시나리오에 후속 파트가 있을 때만. 잠긴 파트는 잠금 라벨 표시 */}
          {nextPart && token && (
            <button
              onClick={() => onNextPart?.(nextPart.id)}
              className="w-full py-3 bg-indigo-600 active:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <span>다음 파트로</span>
              <span className="opacity-80 text-xs font-medium truncate max-w-[60%]">{nextPart.title}</span>
              {nextPart.locked && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className={`w-full py-3 ${nextPart && token ? 'bg-gray-800 active:bg-gray-700 border border-gray-700' : 'bg-indigo-600 active:bg-indigo-700'} text-white text-sm font-semibold rounded-lg transition-colors`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            돌아가기
          </button>
          {token && (
            <button
              onClick={onRestart}
              className="w-full py-3 bg-gray-800 active:bg-gray-700 border border-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              새로하기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
