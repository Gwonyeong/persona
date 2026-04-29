import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

// 메인 + 분기 노드를 사용자의 선택에 따라 평탄화한 sequence 생성
// 동작: 메인 노드를 sortOrder 순으로 순회 → 각 노드에 선택이 있으면 그 선택의 branchNodes를 재귀적으로 펼쳐 끼워넣음
function computeSequence(allNodes, choices) {
  const branchMap = new Map()  // branchFromChoiceId → branch nodes (sorted)
  const mainNodes = []
  for (const n of allNodes) {
    if (n.branchFromChoiceId == null) mainNodes.push(n)
    else {
      if (!branchMap.has(n.branchFromChoiceId)) branchMap.set(n.branchFromChoiceId, [])
      branchMap.get(n.branchFromChoiceId).push(n)
    }
  }
  mainNodes.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const arr of branchMap.values()) {
    arr.sort((a, b) => a.branchSortOrder - b.branchSortOrder)
  }

  function expand(node) {
    const out = [node]
    const chosen = choices[node.id]
    if (chosen) {
      const branch = branchMap.get(chosen.id) || []
      for (const bn of branch) out.push(...expand(bn))
    }
    return out
  }

  const sequence = []
  for (const n of mainNodes) sequence.push(...expand(n))
  return sequence
}

export default function Storyline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token, masks, setMasks } = useStore()
  const [storyline, setStoryline] = useState(null)
  const [error, setError] = useState(null)
  const [nodeIndex, setNodeIndex] = useState(0)
  const [chatStep, setChatStep] = useState(0)
  const [choices, setChoices] = useState({})
  const [toast, setToast] = useState(null)
  // 저장된 진행 시점 — 이 인덱스 이전으로는 goBack 불가
  const [lockedAtIndex, setLockedAtIndex] = useState(0)
  // 완료 API 중복 호출 방지
  const [completeCalled, setCompleteCalled] = useState(false)
  // 새로하기 확인 모달
  const [showRestartModal, setShowRestartModal] = useState(false)
  const [restarting, setRestarting] = useState(false)
  // 선택지 확정 애니메이션 — 활성화된 choice id (애니 진행 중인 동안만 set)
  const [selectingChoiceId, setSelectingChoiceId] = useState(null)
  // 현재 재생 중인 BGM/BGS — 새 노드의 bgmUrl/bgsUrl이 set되어 있을 때만 갱신됨 (그 외엔 유지)
  const [currentBgm, setCurrentBgm] = useState(null)
  const [currentBgs, setCurrentBgs] = useState(null)
  // 음향 토글 — 기본 on (false = 들림). true이면 BGM/BGS muted (재생 위치는 유지됨)
  const [audioMuted, setAudioMuted] = useState(false)
  // 채팅 내 미디어 풀스크린 라이트박스 — { url, type } 또는 null
  const [chatLightbox, setChatLightbox] = useState(null)

  useEffect(() => {
    api.get(`/storylines/${id}`)
      .then(({ storyline, progress }) => {
        setStoryline(storyline)
        // 저장된 선택지 복원 — 분기 sequence 계산에 필요
        const restoredChoices = {}
        if (progress?.choices?.length) {
          // 메인 + 브랜치 노드 모두에서 choice 객체를 찾아냄
          const choicesById = new Map()
          for (const n of (storyline.nodes || [])) {
            for (const c of (n.choices || [])) choicesById.set(c.id, c)
          }
          for (const pc of progress.choices) {
            const choice = choicesById.get(pc.choiceId)
            if (choice) restoredChoices[pc.nodeId] = choice
          }
          setChoices(restoredChoices)
        }
        // currentNodeId를 복원된 choices 기반 sequence에서 찾음
        if (progress?.currentNodeId) {
          const seq = computeSequence(storyline.nodes || [], restoredChoices)
          const idx = seq.findIndex((n) => n.id === progress.currentNodeId)
          if (idx >= 0) {
            setNodeIndex(idx)
            setLockedAtIndex(idx)
          }
        }
      })
      .catch((e) => setError(e.message || 'Failed to load'))
  }, [id])

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // 사용자 선택을 반영한 평탄화 sequence — 메인 + 분기 노드 포함
  const sequence = useMemo(
    () => storyline ? computeSequence(storyline.nodes || [], choices) : [],
    [storyline, choices]
  )

  // 현재 CHAT 노드 직전의 연속 CHAT 노드들의 chatScript를 모두 모음
  // 분기 CHAT으로 넘어가도 직전 메인 CHAT의 대화가 유지되어 보임
  const chatHistory = useMemo(() => {
    const cur = sequence[nodeIndex]
    if (!cur || cur.nodeType !== 'CHAT') return []
    const lines = []
    for (let i = nodeIndex - 1; i >= 0; i--) {
      const n = sequence[i]
      if (n.nodeType !== 'CHAT') break
      lines.unshift(...(n.chatScript || []))
    }
    return lines
  }, [sequence, nodeIndex])

  // RESULT 노드 도달 시 완료 처리 (한 번만 호출)
  useEffect(() => {
    if (completeCalled || !token || !sequence.length) return
    const currentNode = sequence[nodeIndex]
    if (currentNode?.nodeType !== 'RESULT') return
    setCompleteCalled(true)
    api.post(`/storylines/${id}/complete`)
      .catch((e) => {
        console.error('Complete storyline failed:', e)
        setCompleteCalled(false)
      })
  }, [sequence, nodeIndex, completeCalled, token, id])

  // BGM/BGS 초기화 — storyline이 처음 로드될 때 storyline.defaultBgm을 시작 BGM으로 설정
  useEffect(() => {
    if (!storyline) return
    setCurrentBgm(storyline.defaultBgm || null)
    setCurrentBgs(null)
  }, [storyline?.id])

  // 노드 전환 시 — 새 노드에 bgmUrl/bgsUrl이 명시되어 있을 때만 전환. 미지정이면 현재 재생 유지.
  const currentNodeId = sequence[nodeIndex]?.id
  useEffect(() => {
    if (!storyline) return
    const n = sequence[nodeIndex]
    if (!n) return
    if (n.bgmUrl) setCurrentBgm(n.bgmUrl)
    if (n.bgsUrl) setCurrentBgs(n.bgsUrl)
  }, [currentNodeId])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-gray-400 gap-3">
        <p>스토리를 불러오지 못했습니다.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-indigo-400" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>돌아가기</button>
      </div>
    )
  }
  if (!storyline) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">로딩 중...</div>
  }

  const node = sequence[nodeIndex]
  const isLastNode = nodeIndex === sequence.length - 1

  const advance = () => {
    if (!node) return
    if (node.nodeType === 'CHAT') {
      const script = Array.isArray(node.chatScript) ? node.chatScript : []
      if (chatStep < script.length - 1) {
        setChatStep(chatStep + 1)
        return
      }
    }
    if (isLastNode) {
      navigate(-1)
      return
    }
    setNodeIndex(nodeIndex + 1)
    setChatStep(0)
  }

  const goBack = () => {
    if (!node) return
    // CHAT 노드 내부 단계 되돌리기 (같은 노드 내 이동은 lock 무관)
    if (node.nodeType === 'CHAT' && chatStep > 0) {
      setChatStep(chatStep - 1)
      return
    }
    // 첫 노드 또는 저장 lock 지점이면 더 이상 못 감
    if (nodeIndex === 0 || nodeIndex <= lockedAtIndex) return
    const prevNode = sequence[nodeIndex - 1]
    setNodeIndex(nodeIndex - 1)
    if (prevNode?.nodeType === 'CHAT') {
      const script = Array.isArray(prevNode.chatScript) ? prevNode.chatScript : []
      setChatStep(Math.max(0, script.length - 1))
    } else {
      setChatStep(0)
    }
    // 이전 노드의 선택 기록 클리어 (다시 고를 수 있게)
    if (prevNode && prevNode.id != null) {
      setChoices((prev) => {
        if (!(prevNode.id in prev)) return prev
        const next = { ...prev }
        delete next[prevNode.id]
        return next
      })
    }
  }

  // 새로하기 — 백엔드에 새 attempt 생성 후 플레이어 상태 초기화
  const handleRestart = async () => {
    if (!token || restarting) return
    setRestarting(true)
    try {
      await api.post(`/storylines/${id}/restart`)
      setNodeIndex(0)
      setChatStep(0)
      setChoices({})
      setLockedAtIndex(0)
      setCompleteCalled(false)
      setShowRestartModal(false)
      setToast('새 진행 시작')
      // BGM/BGS 리셋 — 첫 노드부터 다시 시작
      setCurrentBgm(storyline?.defaultBgm || null)
      setCurrentBgs(null)
    } catch (e) {
      console.error('Restart failed:', e)
    } finally {
      setRestarting(false)
    }
  }

  // 선택 클릭 → 애니메이션 시작 → 1.2초 후 실제 진행
  const handleChoiceClick = (choice) => {
    if (selectingChoiceId !== null) return  // 이미 애니메이션 중이면 무시

    const isPremium = choice.choiceType === 'PREMIUM'
    const cost = choice.maskCost || 0
    if (isPremium && cost > 0 && (masks ?? 0) < cost) {
      setToast('마스크가 부족합니다')
      return
    }

    setSelectingChoiceId(choice.id)
    // 1s × 2 (깜빡임 두 번) = 2s 후 진행
    setTimeout(() => {
      setSelectingChoiceId(null)
      commitChoice(choice)
    }, 2000)
  }

  const commitChoice = async (choice) => {
    // 다음 위치 계산 — 선택을 반영한 sequence를 미리 계산
    const nextChoices = { ...choices, [node.id]: choice }
    const nextSequence = computeSequence(storyline.nodes || [], nextChoices)
    const currentIdxInNext = nextSequence.findIndex((n) => n.id === node.id)
    const nextNode = nextSequence[currentIdxInNext + 1]
    const nextNodeId = nextNode?.id ?? null
    const lockTarget = currentIdxInNext + 1

    // UI 업데이트
    setChoices(nextChoices)
    setNodeIndex(lockTarget)
    setChatStep(0)

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

  if (!node) {
    return <div className="flex items-center justify-center h-dvh bg-black text-gray-400">스토리 끝</div>
  }

  // 선택지 대기 중이면 우측 탭(다음)을 비활성화
  // SCENE: 항상 대기 / CHAT: 마지막 라인에 도달했을 때만 대기
  const chatScriptLen = Array.isArray(node?.chatScript) ? node.chatScript.length : 0
  const isAtLastChatStep = node?.nodeType === 'CHAT' && chatStep >= chatScriptLen - 1
  const hasNodeChoices = Array.isArray(node?.choices) && node.choices.length > 0
  const waitingChoice = hasNodeChoices && (
    node.nodeType === 'SCENE' || (node.nodeType === 'CHAT' && isAtLastChatStep)
  )
  const showTapZones = node.nodeType !== 'RESULT'

  return (
    <div className="relative w-full h-dvh bg-black text-white overflow-hidden select-none">
      {/* BGM — 노드에서 명시된 새 URL이 들어왔을 때만 재마운트 (그 외엔 유지) */}
      {currentBgm && (
        <audio
          key={currentBgm}
          src={currentBgm}
          autoPlay
          loop
          muted={audioMuted}
          ref={(el) => { if (el) el.volume = 0.6 }}
        />
      )}
      {/* BGS — 빗소리 등 효과음. BGM과 동시에 재생 */}
      {currentBgs && (
        <audio
          key={currentBgs}
          src={currentBgs}
          autoPlay
          loop
          muted={audioMuted}
          ref={(el) => { if (el) el.volume = 0.4 }}
        />
      )}
      {/* 캐릭터 보이스 — 노드별 1회 재생, 다른 노드로 이동 시 자동 정지 (key가 node.id 기반) */}
      {node?.voiceUrl && (
        <audio
          key={`voice-${node.id}-${node.voiceUrl}`}
          src={node.voiceUrl}
          autoPlay
          muted={audioMuted}
          ref={(el) => { if (el) el.volume = 0.85 }}
        />
      )}

      {node.nodeType === 'SCENE' && (
        <SceneView
          node={node}
          storyline={storyline}
          user={user}
          masks={masks}
          onChoice={handleChoiceClick}
          selectingChoiceId={selectingChoiceId}
        />
      )}
      {node.nodeType === 'CHAT' && (
        <ChatView
          node={node}
          storyline={storyline}
          user={user}
          masks={masks}
          step={chatStep}
          onChoice={handleChoiceClick}
          selectingChoiceId={selectingChoiceId}
          onMediaClick={setChatLightbox}
          chatHistory={chatHistory}
        />
      )}
      {node.nodeType === 'RESULT' && (
        <ResultView
          node={node}
          storyline={storyline}
          choices={choices}
          token={token}
          onClose={() => navigate(-1)}
          onRestart={() => setShowRestartModal(true)}
        />
      )}

      {/* 탭 영역 — 좌(이전) / 우(다음). 헤더(z-30) 아래, 메시지/선택지(z-20+) 아래 */}
      {showTapZones && (
        <>
          <button
            onClick={goBack}
            className="absolute left-0 top-0 bottom-0 w-1/2 z-10 bg-transparent"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="이전 메시지"
          />
          {!waitingChoice && (
            <button
              onClick={advance}
              className="absolute right-0 top-0 bottom-0 w-1/2 z-10 bg-transparent"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              aria-label="다음 메시지"
            />
          )}
        </>
      )}

      {/* 헤더 — 좌측 X, 우측 음표 토글 */}
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
          className={`w-9 h-9 flex items-center justify-center backdrop-blur-sm rounded-full transition-colors ${
            audioMuted ? 'bg-black/50 text-gray-400' : 'bg-black/50 text-white'
          }`}
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

      {/* 토스트 — 헤더 아래, 우측에서 슬라이드 인/아웃 */}
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

      {/* 채팅 미디어 풀스크린 라이트박스 — 9:16 미디어 기준, 세로 꽉 차게(가로는 넘치면 자름) */}
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
              className="h-full w-auto max-w-none"
              autoPlay
              loop
              muted
              playsInline
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

      {/* 새로하기 확인 모달 */}
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

// 메시지 영역 컨테이너 스타일 — 하단 1/3 지점부터, 배경 없음 (텍스트 박스에만 dim 적용)
// paddingTop은 0 — 텍스트 박스가 캐릭터 하단(67% 라인)과 정확히 맞닿게 함
const MESSAGE_AREA_STYLE = {
  top: '67%',
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
  paddingTop: '0',
}

// 텍스트 박스 자체의 dim 배경
const TEXT_BOX_STYLE = {
  backgroundColor: 'rgba(0,0,0,0.65)',
}

// SCENE 노드용 화자 해석
// 우선순위: node.speakerName (자유 텍스트) > 등록 캐릭터 이름 > storyline 호스트 캐릭터 > 유저 이름
function resolveSceneSpeaker(node, storyline, user) {
  if (node.speakerName) return node.speakerName
  if (node.speaker === 'CHARACTER') {
    return node.character?.name || storyline.character?.name || null
  }
  if (node.speaker === 'USER') {
    return user?.name || '나'
  }
  return null  // NARRATION — 이름 미표시
}

// CHAT 라인용 화자 해석
// 우선순위: line.name (자유 텍스트) > line.role 기반 등록 캐릭터/유저 이름
function resolveChatLineSpeaker(line, node, storyline, user) {
  if (!line) return null
  if (line.name) return line.name
  if (line.role === 'user') return user?.name || '나'
  if (line.role === 'character') {
    return node.character?.name || storyline.character?.name || null
  }
  return null
}

function SceneView({ node, storyline, user, masks, onChoice, selectingChoiceId }) {
  const hasChoices = Array.isArray(node.choices) && node.choices.length > 0
  const isFullMedia = !!node.fullMediaUrl
  const hasCharacter = !isFullMedia && !!node.characterImage
  const speakerName = resolveSceneSpeaker(node, storyline, user)

  return (
    <div className="absolute inset-0">
      {/* 배경 / 풀미디어 */}
      {isFullMedia ? (
        node.fullMediaType === 'video' ? (
          <video src={node.fullMediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
        ) : (
          <img src={node.fullMediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )
      ) : node.backgroundImage ? (
        <img src={node.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
      )}

      {/* 캐릭터 등장 시 배경 약한 딤드 */}
      {hasCharacter && (
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
      )}

      {/* 캐릭터 — 메시지 영역(하단 33%) 바로 위에 정확히 맞닿게 */}
      {hasCharacter && (
        <div className="absolute inset-x-0 top-0 flex items-end justify-center pointer-events-none" style={{ bottom: '33%' }}>
          <img src={node.characterImage} alt="" className="max-h-full max-w-[80%] object-contain drop-shadow-2xl" />
        </div>
      )}

      {/* 메시지 영역 — 하단 1/3 */}
      {(node.message || hasChoices) && (
        <div
          className="absolute left-0 right-0 bottom-0 z-20 px-5 pointer-events-none"
          style={MESSAGE_AREA_STYLE}
        >
          {node.message && (
            <div className="relative rounded-xl px-4 py-5" style={TEXT_BOX_STYLE}>
              {speakerName && (
                <span
                  className={`absolute -top-2.5 px-3 py-1 rounded-md text-xs font-bold whitespace-nowrap shadow-lg ${
                    node.speaker === 'USER'
                      ? 'right-3 bg-gray-700 text-white'
                      : 'left-3 bg-indigo-600 text-white'
                  }`}
                >
                  {speakerName}
                </span>
              )}
              <p className="text-[15px] leading-relaxed text-white whitespace-pre-line">
                {node.message}
              </p>
            </div>
          )}

          {hasChoices && (
            <div className="mt-3 flex flex-col gap-2 pointer-events-auto">
              {node.choices.map((c) => {
                const isPremium = c.choiceType === 'PREMIUM'
                const cost = c.maskCost || 0
                const insufficient = isPremium && cost > 0 && (masks ?? 0) < cost

                // 선택 확정 애니메이션
                const isSelecting = selectingChoiceId === c.id
                const isOtherWhileSelecting = selectingChoiceId != null && selectingChoiceId !== c.id

                const baseClass = 'w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 border relative'
                const variantClass = isPremium
                  ? insufficient
                    ? ' bg-gray-900/60 border-gray-800 text-gray-400'
                    : ' bg-amber-900/30 hover:bg-amber-900/50 active:bg-amber-900/60 border-amber-600/60 hover:border-amber-500 text-amber-50'
                  : ' bg-gray-900/85 hover:bg-indigo-900/70 active:bg-indigo-800/70 border-gray-700 hover:border-indigo-500 text-gray-100'

                // 동적 애니메이션 스타일
                const animStyle = {
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'opacity 0.3s ease',
                }
                if (isOtherWhileSelecting) {
                  animStyle.opacity = 0.2
                  animStyle.pointerEvents = 'none'
                } else if (isSelecting) {
                  // 제자리에서 깜빡임 두 번 (각 1s × 2 = 2s)
                  animStyle.animation = 'storyChoiceBlink 1s ease-in-out 2'
                }

                return (
                  <button
                    key={c.id}
                    onClick={() => onChoice(c)}
                    className={baseClass + variantClass}
                    style={animStyle}
                  >
                    <span className="flex-1">{c.label}</span>
                    {isPremium && cost > 0 && (
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap border ${
                        insufficient
                          ? 'bg-red-950/60 text-red-300 border-red-900/50'
                          : 'bg-amber-950/70 text-amber-200 border-amber-700/50'
                      }`}>
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
          )}
        </div>
      )}
    </div>
  )
}

function ChatView({ node, storyline, user, masks, step, onChoice, selectingChoiceId, onMediaClick, chatHistory }) {
  const script = Array.isArray(node.chatScript) ? node.chatScript : []
  const visibleLines = script.slice(0, step + 1)
  const isAtLastLine = step >= script.length - 1
  const hasChoices = Array.isArray(node.choices) && node.choices.length > 0

  const characterName = node.character?.name || storyline.character?.name || ''
  // profileImage 없으면 storyline coverImage(캐릭터 일러스트)로 fallback
  const profileUrl = node.character?.profileImage || storyline.character?.profileImage || storyline.coverImage || null
  const userName = user?.name || '나'

  // 선택지를 클릭한 직후(애니메이션 진행 중)에는 선택한 텍스트를 채팅 히스토리 끝에 user 버블로 추가하고
  // 선택지 영역은 숨김 → "선택한 게 곧 유저의 답장"이라는 시각적 표현
  const pickedChoice = selectingChoiceId
    ? node.choices?.find((c) => c.id === selectingChoiceId)
    : null
  // 직전 연속 CHAT 노드의 라인 + 현재 노드의 누적 라인 + (애니 중) 합성 user 버블
  const baseLines = Array.isArray(chatHistory) ? [...chatHistory, ...visibleLines] : visibleLines
  const displayLines = pickedChoice
    ? [...baseLines, { role: 'user', content: pickedChoice.label, _isPicked: true }]
    : baseLines
  const showChoices = isAtLastLine && hasChoices && !pickedChoice

  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [step, showChoices, selectingChoiceId])

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950">
      {/* 메시지 영역 — 헤더 아래부터 시작, 누적 말풍선 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 64px)' }}
      >
        <div className="space-y-1 pb-2">
          {displayLines.map((line, i) => {
            const prevLine = displayLines[i - 1]
            const isConsecutive = prevLine?.role === line.role
            const isUser = line.role === 'user'
            const bubbleStyle = line._isPicked
              ? { animation: 'storyChoiceBlink 1s ease-in-out 2' }
              : undefined
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isConsecutive ? '' : 'mt-3'}`}>
                {!isUser && (
                  <div className="w-7 flex-shrink-0 mr-2">
                    {!isConsecutive && (
                      <div className="w-7 h-7 rounded-full bg-gray-800 overflow-hidden">
                        {profileUrl
                          ? <img src={profileUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>}
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
                  {/* 미디어 (이미지/영상) — 클릭 시 풀스크린. z-20으로 탭 영역(z-10)보다 위 */}
                  {line.mediaUrl && (
                    <div
                      className={`mb-1.5 rounded-2xl overflow-hidden cursor-pointer relative z-20 ${
                        isUser ? 'rounded-tr-none' : 'rounded-tl-none'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMediaClick && onMediaClick({ url: line.mediaUrl, type: line.mediaType || 'image' })
                      }}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {line.mediaType === 'video' ? (
                        <>
                          <video
                            src={line.mediaUrl}
                            className="w-full max-h-[240px] object-cover bg-black"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                          {/* 영상 오버레이 — 풀스크린 표시 */}
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
                        <img
                          src={line.mediaUrl}
                          alt=""
                          className="w-full max-h-[240px] object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                  )}
                  {line.content && (
                    <div
                      className={`text-sm leading-relaxed px-3.5 py-2.5 whitespace-pre-line ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none'
                          : 'bg-gray-800/80 text-gray-100 rounded-2xl rounded-tl-none'
                      }`}
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

      {/* 답장 선택지 — 마지막 라인 도달 후, 노드에 choices가 있을 때만 표시 */}
      {showChoices && (
        <div
          className="relative z-20 px-4 pt-2 flex flex-col gap-2 bg-gradient-to-t from-gray-950 via-gray-950 to-transparent"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          {node.choices.map((c) => {
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
              <button
                key={c.id}
                onClick={() => onChoice(c)}
                className={baseClass + variantClass}
                style={animStyle}
              >
                <span className="flex-1">{c.label}</span>
                {isPremium && cost > 0 && (
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap border ${
                    insufficient
                      ? 'bg-red-950/60 text-red-300 border-red-900/50'
                      : 'bg-amber-950/70 text-amber-200 border-amber-700/50'
                  }`}>
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
      )}
    </div>
  )
}

function ResultView({ node, storyline, choices, token, onClose, onRestart }) {
  const choiceList = Object.values(choices)

  return (
    <div
      className="absolute inset-0 overflow-auto bg-gradient-to-br from-indigo-950 via-gray-950 to-purple-950"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 64px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <div className="px-6 max-w-md mx-auto">
        <p className="text-center text-xs text-indigo-400 font-semibold tracking-[0.3em] mb-3">FIN</p>
        <h2 className="text-center text-2xl font-bold text-white mb-3">{node.resultTitle || storyline.title}</h2>
        {node.resultBody && (
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line text-center mb-8">
            {node.resultBody}
          </p>
        )}

        {choiceList.length > 0 && (
          <div className="mb-8">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">당신의 선택</h3>
            <div className="space-y-2">
              {choiceList.map((c, i) => (
                <div key={i} className="bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-lg p-3">
                  <p className="text-sm text-white">"{c.label}"</p>
                  {c.description && (
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{c.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={onClose}
            className="w-full py-3 bg-indigo-600 active:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
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
