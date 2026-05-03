import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HOST_NAME, HOST_AVATAR } from '../lib/onboardingHost'
import { loadVoices, playVoiceByKey, stopVoice } from '../lib/onboardingVoices'

const PADDING = 8
const CAPTION_GAP = 16

function findScrollAncestor(el) {
  let cur = el?.parentElement
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur)
    const ovY = style.overflowY
    if ((ovY === 'auto' || ovY === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return null
}

/**
 * 일반화된 스포트라이트 투어 컴포넌트.
 *
 * @param {boolean} active 투어 표시 여부
 * @param {Array<{ target: string, caption: string, padding?: number, onEnter?: () => void, pointer?: { selector: string, placement?: string } }>} steps
 *        target: querySelector 문자열, caption: 노출 텍스트, onEnter: 스텝 진입 시 콜백 (탭 전환 등)
 * @param {() => void} onComplete 마지막 step 클릭 시 호출
 */
export default function OnboardingSpotlight({ active, steps, onComplete }) {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const [pointerRect, setPointerRect] = useState(null)
  const [measureTick, setMeasureTick] = useState(0)
  const [mode, setMode] = useState('prompt') // 'prompt' | 'tour'
  const [muted, setMuted] = useState(false)
  const scrollAncestorRef = useRef(null)
  const lastEnteredRef = useRef(null) // 마지막으로 onEnter+보이스 트리거한 스텝 식별자

  // step 또는 active 변경 시 인덱스 + 모드 리셋
  useEffect(() => {
    if (active) {
      setStepIndex(0)
      setMode('prompt')
      setMuted(false)
      lastEnteredRef.current = null
    }
  }, [active])

  // 음성 매핑 미리 로드 + 비활성화/언마운트 시 재생 중단
  useEffect(() => {
    if (!active) return
    loadVoices()
    return () => stopVoice()
  }, [active])

  // 활성화된 동안 타겟의 가장 가까운 스크롤 조상을 잠금 (위치 어그러짐 방지)
  useEffect(() => {
    if (!active || !steps?.length) return
    const target = document.querySelector(steps[0].target)
    const scrollEl = findScrollAncestor(target)
    scrollAncestorRef.current = scrollEl
    if (!scrollEl) return
    const prevOverflow = scrollEl.style.overflow
    scrollEl.style.overflow = 'hidden'
    return () => {
      scrollEl.style.overflow = prevOverflow
      scrollAncestorRef.current = null
    }
  }, [active, steps])

  // 스텝 진입: onEnter 호출 + (enterDelay 후) 타겟 측정 강제 + scrollIntoView + 음성 재생
  useEffect(() => {
    if (!active || mode !== 'tour' || !steps || stepIndex >= steps.length) return
    const step = steps[stepIndex]
    // steps 배열 참조가 새로 들어와도 같은 스텝이면 부수효과를 다시 트리거하지 않음
    const stepId = `${stepIndex}|${step.page || ''}|${step.key || ''}`
    if (lastEnteredRef.current === stepId) return
    lastEnteredRef.current = stepId

    step.onEnter?.()
    if (step.page && step.key && !muted) {
      loadVoices().then(() => playVoiceByKey(step.page, step.key))
    }
    const delay = step.enterDelay || 0

    const timer = setTimeout(() => {
      // DOM이 갱신된 시점에 강제 remeasure (sheet 애니메이션, 클릭으로 인한 re-render 등)
      setMeasureTick((n) => n + 1)
      const target = document.querySelector(step.target)
      if (!target) return
      const scrollEl = scrollAncestorRef.current
      if (scrollEl && scrollEl.style.overflow === 'hidden') {
        scrollEl.style.overflow = ''
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => { scrollEl.style.overflow = 'hidden' }, 500)
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [active, mode, stepIndex, steps, muted])

  // 타겟 + 포인터 측정 — step / 활성 변경, 리사이즈/스크롤 시 갱신
  useLayoutEffect(() => {
    if (!active || !steps || stepIndex >= steps.length) {
      setRect(null)
      setPointerRect(null)
      return
    }
    const measure = () => {
      const step = steps[stepIndex]
      const root = document.getElementById('root')
      if (!root) return
      const rootRect = root.getBoundingClientRect()

      const el = document.querySelector(step.target)
      if (!el) {
        setRect(null)
        setPointerRect(null)
        return
      }
      const elRect = el.getBoundingClientRect()
      const pad = step.padding ?? PADDING
      setRect({
        top: elRect.top - rootRect.top - pad,
        left: elRect.left - rootRect.left - pad,
        width: elRect.width + pad * 2,
        height: elRect.height + pad * 2,
      })

      if (step.pointer?.selector) {
        const pEl = document.querySelector(step.pointer.selector)
        if (pEl) {
          const pRect = pEl.getBoundingClientRect()
          setPointerRect({
            top: pRect.top - rootRect.top,
            left: pRect.left - rootRect.left,
            width: pRect.width,
            height: pRect.height,
            placement: step.pointer.placement || 'top',
          })
          return
        }
      }
      setPointerRect(null)
    }
    measure()

    // 스크롤 조상들에 리스너 부착 (스크롤 진행 중에도 spotlight 따라 이동)
    window.addEventListener('resize', measure)
    const target = document.querySelector(steps[stepIndex].target)
    const scrollListeners = []
    let cur = target?.parentElement
    while (cur && cur !== document.body) {
      const style = window.getComputedStyle(cur)
      const ovY = style.overflowY
      if ((ovY === 'auto' || ovY === 'scroll') && cur.scrollHeight > cur.clientHeight) {
        cur.addEventListener('scroll', measure, { passive: true })
        scrollListeners.push(cur)
      }
      cur = cur.parentElement
    }

    return () => {
      window.removeEventListener('resize', measure)
      scrollListeners.forEach((el) => el.removeEventListener('scroll', measure))
    }
  }, [active, steps, stepIndex, measureTick])

  const advance = () => {
    if (!steps) return
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1)
    } else {
      onComplete?.()
    }
  }

  // 주의: 다른 모달(예: welcome 시트)이 history.back()을 호출할 때 발생하는 popstate를
  // 백 핸들러가 잘못 받아 step을 advance시키는 문제가 있어 useBackHandler 사용을 빼둠.
  // 안드로이드 백 버튼은 유저가 페이지를 떠나는 기본 동작으로 자연스럽게 작동.

  if (!active || !steps?.length) return null

  // 프롬프트 모달 — 사운드 재생 안내
  if (mode === 'prompt') {
    return (
      <div className="absolute inset-0 z-[80] flex items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
          <div className="flex justify-center mb-3">
            <div
              className="w-14 h-14 rounded-full bg-indigo-600/15 border border-indigo-500/40 flex items-center justify-center"
              style={{ boxShadow: '0 0 16px 4px rgba(99, 102, 241, 0.25)' }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </div>
          </div>
          <h2 className="text-base font-bold text-white text-center mb-1">
            {t('tour.soundPromptTitle')}
          </h2>
          <p className="text-sm text-gray-400 text-center mb-5 leading-relaxed">
            {t('tour.soundPromptBody')}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMode('tour')}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('tour.soundOk')}
            </button>
            <button
              onClick={() => { setMuted(true); setMode('tour') }}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('tour.soundMute')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  // 타겟이 뷰포트 위쪽에 있으면 캡션을 아래에, 아래쪽이면 위에 배치
  const root = document.getElementById('root')
  const rootHeight = root?.getBoundingClientRect().height || window.innerHeight
  const showBelow = rect ? rect.top + rect.height + 140 < rootHeight : true
  const captionStyle = rect
    ? (showBelow
      ? { top: rect.top + rect.height + CAPTION_GAP }
      : { bottom: rootHeight - rect.top + CAPTION_GAP })
    : { bottom: 80 }

  return (
    <div
      className="absolute inset-0 z-[80]"
      onClick={advance}
      role="dialog"
      aria-label="onboarding"
    >
      {/* 풀스크린 딤 — 측정 전이거나 타겟 사라진 경우 */}
      {!rect && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0, 0, 0, 0.72)' }} />
      )}

      {/* 스포트라이트 — box-shadow가 바깥을 어둡게 */}
      {rect && (
        <div
          className="absolute rounded-xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
            outline: '2px solid rgba(255, 255, 255, 0.6)',
            outlineOffset: '-2px',
          }}
        />
      )}

      {/* 포인터 화살표 — 세부 요소를 가리킴 */}
      {pointerRect && pointerRect.placement === 'top' && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: pointerRect.top - 36,
            left: pointerRect.left + pointerRect.width / 2 - 14,
            filter: 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.9))',
            transition: 'top 300ms ease-out, left 300ms ease-out',
          }}
        >
          <div className="animate-bounce">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
        </div>
      )}

      {/* 캡션 박스 */}
      <div
        className="absolute left-4 right-4 pointer-events-none"
        style={captionStyle}
      >
        <div className="bg-gray-900/95 backdrop-blur-sm border border-indigo-500/40 rounded-xl px-4 py-3 shadow-lg">
          {/* 호스트 헤더 (윤하린) */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700/50">
            <img
              src={HOST_AVATAR}
              alt={HOST_NAME}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-indigo-400/50 flex-shrink-0"
            />
            <span className="text-sm font-semibold text-white flex-1">{HOST_NAME}</span>
            {step.page && step.key && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  loadVoices().then(() => playVoiceByKey(step.page, step.key))
                }}
                aria-label="다시 듣기"
                className="text-gray-400 hover:text-indigo-400 transition-colors flex-shrink-0 pointer-events-auto"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-sm text-white leading-relaxed">{step.caption}</p>
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === stepIndex ? 'bg-indigo-400' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] text-gray-400">
              {isLast ? t('tour.done') : t('tour.next')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
