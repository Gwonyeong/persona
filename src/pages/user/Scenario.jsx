import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import { goToLogin } from '../../lib/auth'

// 시나리오 상세 — 파트를 한 장씩 넘겨 보는 캐러셀.
// 넘기기는 CSS scroll-snap 으로 — WebView 에서 JS 드래그보다 관성/스냅이 자연스럽다.
//
// 폭 노브는 이 상수 하나다. 카드가 컨테이너 폭의 CARD_WIDTH_PCT 를 차지하고,
// 남는 양옆 (100 - CARD_WIDTH_PCT) / 2 만큼이 이웃 카드가 걸치는(peek) 폭이 된다.
// 즉 이 값을 키우면 카드가 넓어지면서 좌우 공백과 이웃 노출이 함께 줄어든다.
const CARD_WIDTH_PCT = 88
const PEEK_PAD_PCT = (100 - CARD_WIDTH_PCT) / 2 // 첫·마지막 카드도 가운데 올 수 있게 트랙 앞뒤에 넣는 스페이서 폭

// 파트 썸네일 슬라이드 — 결과 페이지의 premiumMedia를 그대로 사용 (잠긴 항목은 약한 블러)
const THUMB_SLIDE_INTERVAL_MS = 2000
const LOCKED_MEDIA_STYLE = { filter: 'blur(3px)', transform: 'scale(1.03)' }

export default function Scenario() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useStore()

  const [scenario, setScenario] = useState(null)
  const [parts, setParts] = useState([])
  const [error, setError] = useState(null)
  const [slideTick, setSlideTick] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)

  const trackRef = useRef(null)
  const cardRefs = useRef([])
  const didInitialScroll = useRef(false)
  const cleanupRaf = useRef(0)

  useEffect(() => {
    const timer = setInterval(() => setSlideTick((n) => n + 1), THUMB_SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    didInitialScroll.current = false
    cardRefs.current = [] // 이전 시나리오의 ref 가 남아 가운데 카드 추적을 망치지 않게
    api.get(`/scenarios/${id}`)
      .then(({ scenario, parts }) => {
        setScenario(scenario)
        setParts(parts || [])
      })
      .catch((e) => setError(e?.message || 'Failed to load'))
  }, [id])

  // 아직 플레이하지 않은 화 중 "가장 앞선" 화에서 열린다.
  // 서버가 partOrder 오름차순으로 주므로 미플레이 중 첫 번째가 그것.
  // (처음엔 미플레이 중 마지막=최신 화를 골랐는데, 1화를 안 본 유저가 2화에서 열려서 바꿨다.
  //  연작은 순서대로 봐야 하므로 "이어보기" 기준이 맞다.)
  // 전부 플레이했으면 마지막 화 — 새 화가 추가되면 그게 미플레이라 자동으로 거기서 열린다.
  const initialIdx = useMemo(() => {
    if (!parts.length) return 0
    const firstUnplayed = parts.findIndex((p) => !p.progress)
    return firstUnplayed >= 0 ? firstUnplayed : parts.length - 1
  }, [parts])

  // 카드를 트랙 가운데로.
  // getBoundingClientRect 차이로 계산한다 — offsetLeft 는 offsetParent(= 위치지정 조상) 기준이라
  // 트랙의 scrollLeft 와 좌표계가 어긋나고, 그래서 활성 카드가 가운데에서 밀려 있었다.
  // scrollIntoView 는 조상까지 스크롤시켜 레이아웃이 튀므로 쓰지 않는다.
  const centerCard = useCallback((idx, behavior = 'smooth') => {
    const track = trackRef.current
    const card = cardRefs.current[idx]
    if (!track || !card) return
    const t = track.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const delta = c.left + c.width / 2 - (t.left + t.width / 2)
    if (Math.abs(delta) < 1) return
    track.scrollTo({ left: track.scrollLeft + delta, behavior })
  }, [])

  // 최초 1회만 시작 화로 점프 (애니메이션 없이).
  // rAF 두 번 — 첫 프레임엔 flex 높이·폭이 아직 0 일 수 있어 측정이 빗나간다.
  useEffect(() => {
    if (didInitialScroll.current || !parts.length) return
    didInitialScroll.current = true
    setActiveIdx(initialIdx)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => centerCard(initialIdx, 'auto'))
      cleanupRaf.current = raf2
    })
    cleanupRaf.current = raf1
    return () => cancelAnimationFrame(cleanupRaf.current)
  }, [parts, initialIdx, centerCard])

  // 뷰포트가 바뀌면(회전·키보드) 활성 카드를 다시 가운데로 — % 폭이라 기준점이 움직인다
  useEffect(() => {
    const onResize = () => centerCard(activeIdx, 'auto')
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeIdx, centerCard])

  // 스크롤에 따라 가운데 카드 추적 (인디케이터 + 탭 동작 판정용)
  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const t = track.getBoundingClientRect()
    const trackCenter = t.left + t.width / 2
    let nearest = 0
    let best = Infinity
    cardRefs.current.forEach((card, i) => {
      if (!card) return
      const c = card.getBoundingClientRect()
      const dist = Math.abs(c.left + c.width / 2 - trackCenter)
      if (dist < best) { best = dist; nearest = i }
    })
    setActiveIdx((prev) => (prev === nearest ? prev : nearest))
  }, [])

  // 가운데 카드만 플레이로 진입. 옆 카드를 누르면 먼저 가운데로 끌어온다 (스와이프 중 오탭 방지)
  const handleCardClick = (part, idx) => {
    if (idx !== activeIdx) {
      centerCard(idx)
      return
    }
    if (!token) {
      goToLogin(navigate)
      return
    }
    navigate(`/storylines/${part.id}`)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-gray-400 gap-3">
        <p>{t('scenario.loadFailed')}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-indigo-400" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>{t('scenario.goBack')}</button>
      </div>
    )
  }
  if (!scenario) {
    return <div className="flex items-center justify-center h-full bg-black text-gray-400">{t('scenario.loading')}</div>
  }

  return (
    <>
      <Helmet>
        <title>{scenario.title} · Pesona</title>
      </Helmet>
      {/* UserLayout 의 main(flex-1) 을 꽉 채우고, 그 안에서 헤더/메타/캐러셀을 세로 분배한다 */}
      <div className="h-full flex flex-col bg-black text-white">
        {/* 헤더 */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 bg-black border-b border-gray-800">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center text-white"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label={t('scenario.back')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-sm font-bold flex-1 truncate">{scenario.title}</h1>
          {scenario.status === 'TEST' && (
            <span className="px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</span>
          )}
        </div>

        {/* 메타 — 썸네일은 제거했다(카드에 세로 공간을 넘김). 제목은 헤더와 중복이라 생략. */}
        {(scenario.character?.name || scenario.description) && (
          <div className="flex-shrink-0 px-4 pt-2.5 pb-1.5">
            {scenario.character?.name && (
              <p className="text-xs text-indigo-300 font-medium">{scenario.character.name}</p>
            )}
            {scenario.description && (
              <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2 mt-0.5">{scenario.description}</p>
            )}
          </div>
        )}

        {parts.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-xs text-gray-500">{t('scenario.noParts')}</p>
        ) : (
          <>
            {/* 캐러셀 — 남은 세로 공간 전부. min-h-0 이 없으면 flex 자식이 줄어들지 않는다. */}
            <div
              ref={trackRef}
              onScroll={handleScroll}
              className="flex-1 min-h-0 flex items-center gap-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {/* 앞뒤 스페이서로 첫·마지막 카드도 가운데 올 수 있게 한다.
                  트랙에 padding 을 주면 안 된다 — 플렉스 자식의 % 폭이 content box 기준으로 풀려서
                  카드가 CARD_WIDTH_PCT 보다 좁아지고(88% → 77.4%) 좌측으로 치우친다.
                  게다가 첫 카드는 scrollLeft 가 음수가 못 되니 코드로도 교정할 수 없다. */}
              <div aria-hidden className="flex-shrink-0 h-px" style={{ width: `${PEEK_PAD_PCT}%` }} />
              {parts.map((s, idx) => {
                const media = Array.isArray(s.premiumMedia) ? s.premiumMedia : []
                const isMulti = media.length > 1
                const mediaIdx = isMulti ? slideTick % media.length : 0
                const isActive = idx === activeIdx
                return (
                  <div
                    key={s.id}
                    ref={(el) => { cardRefs.current[idx] = el }}
                    className="flex-shrink-0 snap-center h-full flex items-center px-1"
                    style={{ width: `${CARD_WIDTH_PCT}%` }}
                  >
                    <button
                      onClick={() => handleCardClick(s, idx)}
                      aria-label={s.title || ''}
                      aria-current={isActive ? 'true' : undefined}
                      className={`relative w-full h-[calc(100%-12px)] rounded-2xl overflow-hidden bg-gray-900 border text-left transition-all duration-200 ${
                        isActive ? 'border-indigo-500/70 scale-100' : 'border-gray-800 scale-[0.94] opacity-55'
                      }`}
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {media.length > 0 ? (
                        media.map((m, i) => {
                          const visible = i === mediaIdx
                          const blur = !m.unlocked
                          const baseCls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`
                          // 비디오라도 포스터가 있으면 <img> — 영상 다운로드 회피. 포스터 없는 레거시만 <video>.
                          if (m.type === 'video' && !m.posterUrl) {
                            return (
                              <video
                                key={i}
                                src={m.url}
                                className={baseCls}
                                style={blur ? LOCKED_MEDIA_STYLE : undefined}
                                muted
                                playsInline
                                preload="metadata"
                              />
                            )
                          }
                          return (
                            <img
                              key={i}
                              src={m.type === 'video' ? m.posterUrl : m.url}
                              alt=""
                              className={baseCls}
                              style={blur ? LOCKED_MEDIA_STYLE : undefined}
                              draggable={false}
                            />
                          )
                        })
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-purple-900/30" />
                      )}

                      {/* 파트 순번 */}
                      {s.partOrder != null && parts.length > 1 && (
                        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] rounded-full font-semibold">
                          {idx + 1} / {parts.length}
                        </div>
                      )}

                      {/* 진행 상태 / TEST */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                        {s.progress?.status === 'COMPLETED' && (
                          <span className="px-2 py-0.5 bg-emerald-600/90 text-white text-[10px] rounded-full font-semibold">{t('scenario.completed')}</span>
                        )}
                        {s.progress?.status === 'IN_PROGRESS' && (
                          <span className="px-2 py-0.5 bg-indigo-600/90 text-white text-[10px] rounded-full font-semibold">{t('scenario.inProgress')}</span>
                        )}
                        {s.status === 'TEST' && (
                          <span className="px-2 py-0.5 bg-amber-600/90 text-white text-[10px] rounded-full font-semibold">TEST</span>
                        )}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pt-12 pb-4">
                        <p className="font-bold text-base text-white line-clamp-2">{s.title}</p>
                        {s.description && (
                          <p className="text-xs text-gray-300 line-clamp-3 mt-1.5 leading-relaxed">{s.description}</p>
                        )}
                      </div>
                    </button>
                  </div>
                )
              })}
              <div aria-hidden className="flex-shrink-0 h-px" style={{ width: `${PEEK_PAD_PCT}%` }} />
            </div>

            {/* 인디케이터 — 현재 몇 번째인지. 점을 눌러도 이동. */}
            {parts.length > 1 && (
              <div
                className="flex-shrink-0 flex items-center justify-center gap-1.5 pt-1"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
              >
                {parts.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => centerCard(idx)}
                    aria-label={`${idx + 1} / ${parts.length}`}
                    className={`rounded-full transition-all ${
                      idx === activeIdx ? 'w-4 h-1.5 bg-indigo-400' : 'w-1.5 h-1.5 bg-gray-600'
                    }`}
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
