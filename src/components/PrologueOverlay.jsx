import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrossfadeMedia } from './SpriteMedia'

// 첫 등장(프롤로그) 연출 — 채팅 진입 시 배경 모드와 무관하게 '전체' 배경으로 프롤로그를 재생한다.
// 텍스트는 한 블록씩 타자 효과로 흘러나오고, 배경은 구간 이미지로 크로스페이드된다.
// 이미지 블록은 "바로 앞 텍스트 구간"을 그린 컷이므로, 텍스트 블록마다 그 뒤에 오는 첫 이미지를 배경으로 쓴다.
// 마지막 이미지 뒤의 텍스트는 마지막 이미지를 유지, 이미지가 하나도 없으면 기본 표정(fallbackImage).

const PROLOGUE_WINDOW_MS = 5000 // 서버 expandToMessages 는 블록마다 +1ms — 선제 메시지와 구분하는 여유
const CHAR_MS = 18 // 글자당 출력 간격
const HOLD_MS = 1600 // 블록 출력 완료 후 다음 블록까지 대기

/**
 * 대화 messages 에서 재생할 프롤로그를 뽑는다. 유저가 아직 한 마디도 안 했을 때만.
 * @returns {{ steps: {role, text, emotion, image}[] } | null}
 */
export function extractPrologue(messages, { hasMoreBefore } = {}) {
  if (!Array.isArray(messages) || messages.length === 0 || hasMoreBefore) return null
  if (messages.some((m) => m.role === 'USER')) return null
  const t0 = Date.parse(messages[0].createdAt)
  const head = Number.isFinite(t0)
    ? messages.filter((m) => {
        const t = Date.parse(m.createdAt)
        return Number.isFinite(t) && t - t0 < PROLOGUE_WINDOW_MS
      })
    : messages.slice(0, 1)

  const steps = []
  let pending = [] // 아직 이미지가 정해지지 않은 텍스트 스텝
  let lastImage = null
  for (const m of head) {
    if (m.role === 'GENERATED_IMAGE' && m.content) {
      pending.forEach((s) => { s.image = m.content })
      pending = []
      lastImage = m.content
    } else if ((m.role === 'NARRATION' || m.role === 'CHARACTER') && (m.content || '').trim()) {
      const step = { role: m.role, text: m.content.trim(), emotion: m.emotion || null, image: null }
      steps.push(step)
      pending.push(step)
    }
  }
  // 마지막 이미지 뒤에 남은 텍스트 → 마지막 이미지 유지 (없으면 null = 기본 표정)
  pending.forEach((s) => { s.image = lastImage })
  return steps.length ? { steps } : null
}

// 《행동》 구간을 회색 italic 으로. 타자 중 닫히지 않은 《 도 행동으로 본다.
function renderSegments(text) {
  const parts = text.split(/(《[^》]*》?)/g).filter(Boolean)
  // 채팅방 전체 모드와 같이 행동 묘사는 가운데 정렬된 독립 줄
  return parts.map((p, i) =>
    p.startsWith('《') ? (
      <span key={i} className="block text-center italic text-gray-400/90 text-[14px] my-0.5">{p}</span>
    ) : (
      <span key={i}>{p.trim()}</span>
    ),
  )
}

export default function PrologueOverlay({ steps, fallbackImage, characterName, onDone }) {
  const { t } = useTranslation()
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(0) // 현재 블록에서 출력된 글자 수
  const doneRef = useRef(false)

  const step = steps[idx]
  const fullLen = step ? [...step.text].length : 0
  const typing = shown < fullLen

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }

  // 이미지 미리 받아두기 — 크로스페이드 중 빈 화면 방지
  useEffect(() => {
    const urls = [...new Set(steps.map((s) => s.image).filter(Boolean))]
    urls.forEach((u) => { const img = new Image(); img.src = u })
  }, [steps])

  // 타자 효과 → 다 나오면 잠시 멈췄다가 다음 블록, 마지막이면 종료
  useEffect(() => {
    if (!step) { finish(); return }
    const timer = typing
      ? setTimeout(() => setShown((n) => n + 1), CHAR_MS)
      : setTimeout(() => {
          if (idx + 1 >= steps.length) finish()
          else { setIdx(idx + 1); setShown(0) }
        }, HOLD_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, shown, typing, steps.length])

  // 화면 탭: 출력 중이면 블록 즉시 완성, 다 나왔으면 다음 블록
  const handleTap = () => {
    if (typing) { setShown(fullLen); return }
    if (idx + 1 >= steps.length) finish()
    else { setIdx(idx + 1); setShown(0) }
  }

  const bg = step?.image || fallbackImage
  const visibleText = useMemo(() => (step ? [...step.text].slice(0, shown).join('') : ''), [step, shown])

  return (
    <div className="absolute inset-0 z-50 bg-black overflow-hidden select-none" onClick={handleTap}>
      {bg && (
        <CrossfadeMedia
          src={bg}
          variant="sprite"
          fadeMs={900}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.92) 100%)' }}
      />

      {step && (
        <div
          key={idx}
          className="absolute left-0 right-0 px-6 animate-fade-in pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
        >
          {step.role === 'CHARACTER' && (
            <p className="text-[12px] text-amber-200/90 font-semibold mb-1">{characterName}</p>
          )}
          <p
            className={`leading-relaxed whitespace-pre-wrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
              step.role === 'NARRATION' ? 'text-[14px] text-gray-200/90 italic' : 'text-[15px] text-gray-50'
            }`}
          >
            {step.role === 'CHARACTER' ? renderSegments(visibleText) : visibleText}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); finish() }}
        className="absolute right-4 px-4 py-2 rounded-full bg-black/50 border border-white/20 text-white/90 text-[13px] font-medium backdrop-blur-sm"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 20px)', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        {t('chat.prologueSkip')}
      </button>
    </div>
  )
}
