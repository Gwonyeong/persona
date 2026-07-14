import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

// 감정 세트 (emotionTarget 파싱용)
const SFW_EMO = ['NEUTRAL', 'HAPPY', 'ANGRY', 'SAD', 'SHY']
const AROUSED_EMO = [
  'AROUSED_TEASE', 'AROUSED_TOPLESS', 'AROUSED_NUDE', 'AROUSED_FOREPLAY',
  'AROUSED_INSERT', 'AROUSED_INSERT_ALT', 'AROUSED_CLIMAX', 'AROUSED_AFTERGLOW',
]
const ALL_EMO = new Set([...SFW_EMO, ...AROUSED_EMO])

const isVideoPath = (url) => {
  if (!url) return false
  const clean = String(url).split('?')[0].toLowerCase()
  return ['.mp4', '.webm', '.mov', '.m4v'].some((e) => clean.endsWith(e))
}

// "AROUSED_TEASE→TOPLESS" 같은 문자열 → 정규화된 감정 키 배열
function parseEmotionTarget(target) {
  if (!target) return []
  return String(target)
    .split(/[→\/,>\s]+/)
    .map((t) => t.trim().toUpperCase())
    .map((t) => {
      if (ALL_EMO.has(t)) return t
      if (ALL_EMO.has('AROUSED_' + t)) return 'AROUSED_' + t
      return null
    })
    .filter(Boolean)
}

export default function CharacterSituations() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [characterName, setCharacterName] = useState('')
  const [cards, setCards] = useState([])
  const [styles, setStyles] = useState([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState(null) // 생성 결과 (배열) — 모달
  const [expanded, setExpanded] = useState({}) // cardId → bool
  const [error, setError] = useState('')
  // 생성 옵션 모달
  const [genOpen, setGenOpen] = useState(false)
  const [baseCount, setBaseCount] = useState(3)
  const [specialPerStyle, setSpecialPerStyle] = useState(1)
  const [specialStyleIds, setSpecialStyleIds] = useState([]) // 특별 카드 만들 스타일 id

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get(`/admin/characters/${id}/situation-cards`)
      setCharacterName(data.characterName || '')
      setCards(Array.isArray(data.cards) ? data.cards : [])
      setStyles(Array.isArray(data.styles) ? data.styles : [])
      setDirty(false)
    } catch (e) {
      setError(e.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const styleById = useMemo(() => {
    const m = new Map()
    for (const s of styles) m.set(s.id, s)
    return m
  }, [styles])
  const defaultStyle = useMemo(() => styles.find((s) => s.unlockMode === 'DEFAULT') || styles[0], [styles])
  const unlockableStyles = useMemo(() => styles.filter((s) => s.unlockMode === 'GACHA' || s.unlockMode === 'SHOP'), [styles])

  // 카드가 사용하는 스타일 + 연결된 표정 이미지 리스트
  const linkFor = (card) => {
    const style = card.styleId ? styleById.get(card.styleId) : defaultStyle
    if (!style) return { style: null, missing: !!card.styleId, images: [] }
    const targets = parseEmotionTarget(card.emotionTarget)
    const imgs = (style.images || []).filter((i) => !isVideoPath(i.filePath))
    // 대상 감정 우선, 없으면 스타일 전체 (감정별 1장 dedupe)
    const pool = targets.length ? imgs.filter((i) => targets.includes(i.emotion)) : imgs
    const seen = new Set()
    const uniq = []
    for (const i of (pool.length ? pool : imgs)) {
      if (seen.has(i.emotion)) continue
      seen.add(i.emotion)
      uniq.push(i)
    }
    return { style, missing: false, images: uniq }
  }

  const removeCard = (idx) => {
    setCards((prev) => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put(`/admin/characters/${id}/situation-cards`, { cards })
      setDirty(false)
    } catch (e) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const openGenConfig = () => {
    // 특별 카드 대상: 기본으로 모든 해금형 스타일 선택
    setSpecialStyleIds(unlockableStyles.map((s) => s.id))
    setError('')
    setGenOpen(true)
  }

  const toggleStyle = (sid) =>
    setSpecialStyleIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]))

  const generate = async () => {
    setGenerating(true)
    setError('')
    try {
      const { cards: gen } = await api.post(`/admin/characters/${id}/situation-cards/generate`, {
        baseCount,
        specialPerStyle,
        specialStyleIds,
      })
      setGenOpen(false)
      setPreview(Array.isArray(gen) ? gen : [])
    } catch (e) {
      setError(e.message || 'Gemini 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  const applyPreview = (mode) => {
    if (!preview) return
    setCards((prev) => (mode === 'replace' ? preview : [...prev, ...preview]))
    setDirty(true)
    setPreview(null)
  }

  const btn = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/characters')} className="text-gray-400 hover:text-white" style={btn}>
            ← 뒤로
          </button>
          <h1 className="text-xl font-bold text-white">{characterName || '...'} — 상황극 카드</h1>
          <span className="text-sm text-gray-500">{cards.length}장</span>
          {dirty && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">미저장</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openGenConfig}
            disabled={generating}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
            style={btn}
          >
            {generating ? 'Gemini 생성 중…' : '✨ Gemini 자동생성'}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-40"
            style={btn}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-2 rounded bg-red-500/15 text-red-300 text-sm">{error}</div>}

      {loading ? (
        <div className="text-gray-500">불러오는 중…</div>
      ) : cards.length === 0 ? (
        <div className="text-gray-500 py-12 text-center">
          상황극 카드가 없습니다. <span className="text-emerald-400">Gemini 자동생성</span>으로 만들어 보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {cards.map((card, idx) => {
            const { style, missing, images } = linkFor(card)
            const open = expanded[card.id || idx]
            return (
              <div key={card.id || idx} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {card.emoji && <span className="text-lg">{card.emoji}</span>}
                      <span className="font-semibold text-white">{card.title}</span>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded ${
                          card.safety === 'NSFW' ? 'bg-rose-500/20 text-rose-300' : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {card.safety}
                      </span>
                      {card.styleId && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300">★ 특별</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">{card.summary}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setExpanded((p) => ({ ...p, [card.id || idx]: !open }))} className="text-xs text-gray-400 hover:text-white" style={btn}>
                      {open ? '접기' : '상세'}
                    </button>
                    <button onClick={() => removeCard(idx)} className="text-xs text-red-400 hover:text-red-300" style={btn}>
                      삭제
                    </button>
                  </div>
                </div>

                {/* 연결된 스타일 + 표정 이미지 */}
                <div className="mt-3">
                  <div className="text-[11px] text-gray-500 mb-1.5">
                    연결 스타일:{' '}
                    {missing ? (
                      <span className="text-red-400">styleId {card.styleId} (없음)</span>
                    ) : style ? (
                      <span className="text-gray-300">
                        {style.name} <span className="text-gray-600">[{style.unlockMode}]</span>
                      </span>
                    ) : (
                      <span className="text-gray-600">(스타일 없음)</span>
                    )}
                    {card.emotionTarget && <span className="ml-2 text-gray-600">· 표정 {card.emotionTarget}</span>}
                  </div>
                  {images.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {images.map((img) => (
                        <div key={img.id} className="shrink-0 text-center">
                          <img
                            src={img.filePath}
                            alt={img.emotion}
                            className="w-16 h-16 object-cover rounded-lg border border-gray-800 bg-gray-800"
                            loading="lazy"
                          />
                          <div className="text-[9px] text-gray-500 mt-0.5 w-16 truncate">
                            {img.emotion.replace('AROUSED_', '')}
                            {img.videoFilePath ? ' 🎬' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-600">연결된 표정 이미지 없음</div>
                  )}
                </div>

                {open && (
                  <div className="mt-3 space-y-2 text-sm border-t border-gray-800 pt-3">
                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">오프닝 ({(card.openingBeats || []).length})</div>
                      <div className="space-y-0.5 text-gray-300">
                        {(card.openingBeats || []).map((b, i) => (
                          <div key={i} className={b.startsWith('《') ? 'text-gray-400 italic' : ''}>{b}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">첫 선택지</div>
                      <div className="space-y-0.5 text-gray-300">
                        {(card.openingChoices || []).map((c, i) => (
                          <div key={i}>• {c}</div>
                        ))}
                      </div>
                    </div>
                    {card.scenarioNote && (
                      <div>
                        <div className="text-[11px] text-gray-500 mb-1">scenarioNote (숨김)</div>
                        <div className="text-gray-400 text-xs">{card.scenarioNote}</div>
                      </div>
                    )}
                    {Array.isArray(card.cue_keys) && card.cue_keys.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {card.cue_keys.map((k, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 생성 옵션 모달 */}
      {genOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !generating && setGenOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-700 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Gemini 자동생성 옵션</h2>
              <button onClick={() => !generating && setGenOpen(false)} className="text-gray-400 hover:text-white" style={btn}>✕</button>
            </div>

            {/* 개수 */}
            <div className="flex gap-3 mb-4">
              <label className="flex-1">
                <div className="text-xs text-gray-400 mb-1">기본 카드 수 (DEFAULT 스타일)</div>
                <input
                  type="number" min={0} max={10} value={baseCount}
                  onChange={(e) => setBaseCount(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white border border-gray-700"
                  style={btn}
                />
                <div className="text-[10px] text-gray-500 mt-1">2장 이상이면 SFW 1 + 나머지 NSFW</div>
              </label>
              <label className="flex-1">
                <div className="text-xs text-gray-400 mb-1">스타일당 특별 카드 수</div>
                <input
                  type="number" min={1} max={5} value={specialPerStyle}
                  onChange={(e) => setSpecialPerStyle(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white border border-gray-700"
                  style={btn}
                />
                <div className="text-[10px] text-gray-500 mt-1">선택한 스타일마다 NSFW 특별 카드</div>
              </label>
            </div>

            {/* 참고 스타일(특별 카드 대상) */}
            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2">특별 카드 참고 스타일 (해금형)</div>
              {defaultStyle && (
                <div className="text-[11px] text-gray-500 mb-2">
                  기본 카드는 <span className="text-gray-300">{defaultStyle.name}</span>
                  <span className="text-gray-600"> [DEFAULT]</span> 복장 기준으로 생성됩니다.
                </div>
              )}
              {unlockableStyles.length === 0 ? (
                <div className="text-[11px] text-gray-600">해금형 스타일이 없어 특별 카드는 만들 수 없습니다.</div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {unlockableStyles.map((s) => {
                    const on = specialStyleIds.includes(s.id)
                    const emos = [...new Set((s.images || []).map((i) => i.emotion))]
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border ${
                          on ? 'bg-fuchsia-500/10 border-fuchsia-500/40' : 'bg-gray-800/50 border-gray-800'
                        }`}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleStyle(s.id)} className="accent-fuchsia-500" />
                        <span className="text-sm text-white">{s.name}</span>
                        <span className="text-[10px] text-gray-500">[{s.unlockMode}]</span>
                        <span className="text-[10px] text-gray-600 ml-auto">표정 {emos.length}종</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="text-[11px] text-gray-500 mb-4">
              예상 생성: 기본 {baseCount}장{specialStyleIds.length > 0 ? ` + 특별 ${specialStyleIds.length * specialPerStyle}장` : ''} ={' '}
              <b className="text-gray-300">{baseCount + specialStyleIds.length * specialPerStyle}장</b>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setGenOpen(false)} disabled={generating} className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 disabled:opacity-50" style={btn}>취소</button>
              <button
                onClick={generate}
                disabled={generating || baseCount + specialStyleIds.length * specialPerStyle === 0}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                style={btn}
              >
                {generating ? '생성 중…' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 생성 미리보기 모달 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl bg-gray-900 border border-gray-700 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Gemini 생성 결과 · {preview.length}장</h2>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-white" style={btn}>✕</button>
            </div>
            <div className="space-y-2 mb-4">
              {preview.map((c, i) => (
                <div key={i} className="rounded-lg bg-gray-800/60 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.emoji && <span>{c.emoji}</span>}
                    <span className="font-medium text-white">{c.title}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${c.safety === 'NSFW' ? 'bg-rose-500/20 text-rose-300' : 'bg-sky-500/20 text-sky-300'}`}>{c.safety}</span>
                    {c.styleId && <span className="text-[11px] px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300">★ style{c.styleId}</span>}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">{c.summary}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600" style={btn}>닫기</button>
              {cards.length > 0 && (
                <button onClick={() => applyPreview('append')} className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-500" style={btn}>기존에 추가</button>
              )}
              <button onClick={() => applyPreview('replace')} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500" style={btn}>
                {cards.length > 0 ? '전체 교체' : '적용'}
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-2">적용 후 목록에서 검토하고 상단 <b>저장</b>을 눌러야 DB에 반영됩니다.</div>
          </div>
        </div>
      )}
    </div>
  )
}
