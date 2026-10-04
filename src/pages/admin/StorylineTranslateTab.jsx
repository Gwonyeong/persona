import { useMemo, useState } from 'react'

// ─────────────────────────────────────────────────────────────
// 스토리 번역 탭 — 한국어 원문 ↔ 대상 언어(기본 ja) 대조 편집 + Gemini 일괄/선택 번역 + 번역본 TTS 일괄 생성
//
// 데이터는 storyline state 의 translations 를 그대로 읽는다 (server/src/lib/storylineI18n.js 와 같은 구조):
//   storyline.translations[lang]            = { title, description, _src }
//   node.translations[lang]                 = { resultTitle, resultBody, _src, script: [ { text|content, name, src, voiceUrl, voiceSrc } | null ] }
//   choice.translations[lang]               = { label, description, _src }
// 단위 key 규칙도 서버와 동일 — 선택 번역 시 그대로 보낸다.
// ─────────────────────────────────────────────────────────────

const MODE_ICON = { narration: '📖', character: '💬', user: '👤' }
const LANG_LABEL = { ja: '일본어', en: '영어' }

function textFieldOf(item) {
  if (!item) return null
  if (item.mode === 'narration') return 'text'
  if (item.mode === 'character' || item.mode === 'user') return 'content'
  return null
}

// 서버 collectUnits 와 같은 순서·같은 key 로 번역 단위를 뽑는다
export function collectUnits(storyline) {
  const units = []
  if (!storyline) return units
  if (storyline.title) units.push({ key: 'meta.title', kind: 'meta', field: 'title', text: storyline.title, label: '제목' })
  if (storyline.description) units.push({ key: 'meta.description', kind: 'meta', field: 'description', text: storyline.description, label: '설명' })
  for (const node of storyline.nodes || []) {
    const script = Array.isArray(node.script) ? node.script : []
    script.forEach((item, idx) => {
      const field = textFieldOf(item)
      if (!field || typeof item[field] !== 'string' || !item[field].trim()) return
      units.push({ key: `node.${node.id}.script.${idx}.${field}`, kind: 'script', nodeId: node.id, idx, field, mode: item.mode, text: item[field], item, node })
      if (typeof item.name === 'string' && item.name.trim()) {
        units.push({ key: `node.${node.id}.script.${idx}.name`, kind: 'script', nodeId: node.id, idx, field: 'name', mode: item.mode, text: item.name, item, node, isName: true })
      }
    })
    if (node.nodeType === 'RESULT') {
      if (node.resultTitle) units.push({ key: `node.${node.id}.resultTitle`, kind: 'result', nodeId: node.id, field: 'resultTitle', text: node.resultTitle, node, label: '결말 제목' })
      if (node.resultBody) units.push({ key: `node.${node.id}.resultBody`, kind: 'result', nodeId: node.id, field: 'resultBody', text: node.resultBody, node, label: '결말 본문' })
    }
    for (const c of node.choices || []) {
      if (c.label) units.push({ key: `choice.${c.id}.label`, kind: 'choice', choiceId: c.id, nodeId: node.id, field: 'label', text: c.label, node, choice: c, label: '선택지' })
      if (c.description) units.push({ key: `choice.${c.id}.description`, kind: 'choice', choiceId: c.id, nodeId: node.id, field: 'description', text: c.description, node, choice: c, label: '선택지 설명' })
    }
  }
  return units
}

export function lookupTranslation(unit, storyline, lang) {
  if (unit.kind === 'meta') {
    const t = storyline?.translations?.[lang]
    return t ? { value: t[unit.field], src: t._src?.[unit.field] } : null
  }
  if (unit.kind === 'script') {
    const entry = unit.node?.translations?.[lang]?.script?.[unit.idx]
    if (!entry) return null
    return { value: entry[unit.field], src: unit.isName ? undefined : entry.src, voiceUrl: entry.voiceUrl, voiceSrc: entry.voiceSrc }
  }
  if (unit.kind === 'result') {
    const t = unit.node?.translations?.[lang]
    return t ? { value: t[unit.field], src: t._src?.[unit.field] } : null
  }
  if (unit.kind === 'choice') {
    const t = unit.choice?.translations?.[lang]
    return t ? { value: t[unit.field], src: t._src?.[unit.field] } : null
  }
  return null
}

export function unitStatus(unit, storyline, lang) {
  const tr = lookupTranslation(unit, storyline, lang)
  if (!tr || !tr.value) return 'missing'
  if (tr.src != null && tr.src !== unit.text) return 'stale'
  return 'ok'
}

// 번역본 음성 상태 — CHAPTER 의 character 본문 단위에만 의미 있음
export function voiceStatus(unit, storyline, lang) {
  const tr = lookupTranslation(unit, storyline, lang)
  if (!tr?.value) return 'n/a'
  if (!tr.voiceUrl) return 'missing'
  if (tr.voiceSrc != null && tr.voiceSrc !== tr.value) return 'stale'
  return 'ok'
}

export function isVoiceUnit(unit) {
  return unit.kind === 'script' && !unit.isName && unit.mode === 'character' && unit.node?.nodeType === 'CHAPTER'
}

const STATUS_BADGE = {
  missing: { text: '미번역', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
  stale: { text: '원문 변경됨', cls: 'bg-amber-950/60 text-amber-300 border-amber-800/60' },
  ok: { text: '완료', cls: 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50' },
}

function groupUnits(units) {
  const groups = []
  let meta = null
  const byNode = new Map()
  let mainIdx = 0
  const branchCounters = new Map()
  for (const u of units) {
    if (u.kind === 'meta') {
      if (!meta) { meta = { key: 'meta', label: '스토리 카드', units: [] }; groups.push(meta) }
      meta.units.push(u)
      continue
    }
    if (!byNode.has(u.nodeId)) {
      const n = u.node
      let label
      if (n.nodeType === 'RESULT') label = '🏁 RESULT'
      else if (n.branchFromChoiceId != null) {
        const cnt = branchCounters.get(n.branchFromChoiceId) || 0
        branchCounters.set(n.branchFromChoiceId, cnt + 1)
        label = `└ 분기 #${cnt} · choice ${n.branchFromChoiceId} · ${n.nodeType}`
      } else {
        label = `#${mainIdx} · ${n.nodeType}`
        mainIdx++
      }
      const g = { key: `node-${u.nodeId}`, label, node: n, units: [] }
      byNode.set(u.nodeId, g)
      groups.push(g)
    }
    byNode.get(u.nodeId).units.push(u)
  }
  return groups
}

export default function StorylineTranslateTab({
  storyline,
  lang = 'ja',
  dirty,
  translating,          // { done, total } | null
  onTranslate,          // (scope, keys) => Promise
  onEditTranslation,    // (unit, value) => void
  onGenerateVoice,      // (unit) => Promise  — 번역본 TTS 1개
  onBulkGenerateVoice,  // ({ overwrite }) => Promise
  voiceProgress,        // { done, total, failures } | null
}) {
  const units = useMemo(() => collectUnits(storyline), [storyline])
  const groups = useMemo(() => groupUnits(units), [units])
  const [selected, setSelected] = useState(() => new Set())
  const [filter, setFilter] = useState('all') // all | missing | voice

  const stats = useMemo(() => {
    let missing = 0, stale = 0, ok = 0, voiceTotal = 0, voiceMissing = 0, voiceStale = 0
    for (const u of units) {
      const st = unitStatus(u, storyline, lang)
      if (st === 'missing') missing++
      else if (st === 'stale') stale++
      else ok++
      if (isVoiceUnit(u)) {
        voiceTotal++
        const vs = voiceStatus(u, storyline, lang)
        if (vs === 'missing' || vs === 'n/a') voiceMissing++
        else if (vs === 'stale') voiceStale++
      }
    }
    return { total: units.length, missing, stale, ok, voiceTotal, voiceMissing, voiceStale }
  }, [units, storyline, lang])

  const busy = !!translating || !!voiceProgress
  const langLabel = LANG_LABEL[lang] || lang

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleGroup = (g, on) => setSelected((prev) => {
    const next = new Set(prev)
    for (const u of g.units) { if (on) next.add(u.key); else next.delete(u.key) }
    return next
  })

  const visibleUnit = (u) => {
    if (filter === 'missing') return unitStatus(u, storyline, lang) !== 'ok'
    if (filter === 'voice') return isVoiceUnit(u)
    return true
  }

  if (units.length === 0) {
    return (
      <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-lg text-center">
        <p className="text-sm text-gray-400">번역할 텍스트가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 — 통계 + 번역/음성 일괄 버튼 */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-200 font-medium">
              {langLabel} 번역 — {stats.ok}/{stats.total} 완료
              {stats.missing > 0 && <span className="text-gray-400 ml-2">· 미번역 {stats.missing}</span>}
              {stats.stale > 0 && <span className="text-amber-400 ml-2">· 원문 변경 {stats.stale}</span>}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              대사·나레이션·화자명·선택지·결말·카드 제목. Gemini 로 번역하고 바로 DB 에 저장됩니다. 번역본은 아래 칸에서 직접 고칠 수 있고, 수정은 상단 "변경사항 저장"으로 반영됩니다.
            </p>
            {dirty && (
              <p className="text-[11px] text-amber-300 mt-1">
                ⚠ 저장되지 않은 변경이 있어 번역 버튼이 잠겼습니다. 먼저 "변경사항 저장"을 눌러 주세요. (인덱스가 어긋나는 사고 방지)
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                onClick={() => onTranslate('selected', [...selected])}
                disabled={busy || dirty || selected.size === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none' }}
                title="체크한 항목만 번역 (이미 번역돼 있어도 덮어씀)"
              >
                🌐 선택 번역 ({selected.size})
              </button>
              <button
                onClick={() => onTranslate('missing')}
                disabled={busy || dirty || stats.missing + stats.stale === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none' }}
                title="미번역 + 원문이 바뀐 항목만 일괄 번역"
              >
                {translating ? '번역 중...' : `🌐 미번역·변경분 일괄 (${stats.missing + stats.stale})`}
              </button>
              <button
                onClick={() => { if (confirm(`${stats.total}개 전부 다시 번역합니다. 직접 고친 번역본도 덮어씁니다. 계속할까요?`)) onTranslate('all') }}
                disabled={busy || dirty}
                className="px-3 py-1.5 bg-amber-700/80 hover:bg-amber-600 text-amber-50 text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none' }}
              >
                🔄 전부 재번역
              </button>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                onClick={() => onBulkGenerateVoice({ overwrite: false })}
                disabled={busy || stats.voiceMissing + stats.voiceStale === 0}
                className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none' }}
                title="번역본이 있는 character 대사 중 음성이 없거나 번역이 바뀐 것만 생성"
              >
                {voiceProgress ? `${voiceProgress.done}/${voiceProgress.total}` : `🎙 ${langLabel} 음성 일괄 (${stats.voiceMissing + stats.voiceStale})`}
              </button>
              <button
                onClick={() => { if (confirm(`${langLabel} 음성 ${stats.voiceTotal}개를 전부 다시 생성합니다. 계속할까요?`)) onBulkGenerateVoice({ overwrite: true }) }}
                disabled={busy || stats.voiceTotal === 0}
                className="px-3 py-1.5 bg-pink-900/60 hover:bg-pink-800 text-pink-100 text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ outline: 'none' }}
              >
                🔄 음성 전부 재생성 ({stats.voiceTotal})
              </button>
            </div>
          </div>
        </div>

        {(translating || voiceProgress) && (
          <div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${translating ? 'bg-indigo-500' : 'bg-pink-500'}`}
                style={{ width: `${((translating || voiceProgress).done / Math.max(1, (translating || voiceProgress).total)) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {translating ? `번역 요청 중 (${translating.total}개 단위)…` : `${voiceProgress.done}/${voiceProgress.total}`}
              {voiceProgress?.failures?.length > 0 && <span className="text-red-400 ml-2">· 실패 {voiceProgress.failures.length}</span>}
            </p>
          </div>
        )}

        {/* 필터 + 전체 선택 */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-gray-500">보기:</span>
          {[['all', '전체'], ['missing', '미번역·변경만'], ['voice', '음성 대상만']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2 py-0.5 rounded border ${filter === k ? 'bg-gray-700 text-white border-gray-600' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200'}`}
              style={{ outline: 'none' }}
            >
              {label}
            </button>
          ))}
          <span className="text-gray-700">|</span>
          <button
            onClick={() => setSelected(new Set(units.filter(visibleUnit).map((u) => u.key)))}
            className="text-indigo-300 hover:text-indigo-200"
            style={{ outline: 'none' }}
          >
            보이는 항목 전체 선택
          </button>
          <button onClick={() => setSelected(new Set())} className="text-gray-400 hover:text-gray-200" style={{ outline: 'none' }}>
            선택 해제
          </button>
        </div>
      </div>

      {/* 그룹별 행 */}
      {groups.map((g) => {
        const rows = g.units.filter(visibleUnit)
        if (rows.length === 0) return null
        const allOn = rows.every((u) => selected.has(u.key))
        const isBranch = g.node?.branchFromChoiceId != null
        return (
          <section
            key={g.key}
            className={`rounded-lg border ${isBranch ? 'bg-amber-950/10 border-amber-900/40' : 'bg-gray-900/40 border-gray-800'}`}
          >
            <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => toggleGroup({ units: rows }, e.target.checked)}
                className="accent-indigo-500"
              />
              <span className={`text-[11px] font-mono ${isBranch ? 'text-amber-300' : 'text-gray-300'}`}>{g.label}</span>
              {g.node && <span className="text-[10px] text-gray-600 font-mono">id {g.node.id}</span>}
              <span className="text-[11px] text-gray-500 ml-auto">
                {rows.filter((u) => unitStatus(u, storyline, lang) === 'ok').length}/{rows.length}
              </span>
            </div>
            <div className="divide-y divide-gray-800/70">
              {rows.map((u) => (
                <UnitRow
                  key={u.key}
                  unit={u}
                  storyline={storyline}
                  lang={lang}
                  langLabel={langLabel}
                  checked={selected.has(u.key)}
                  onToggle={() => toggle(u.key)}
                  onEdit={(v) => onEditTranslation(u, v)}
                  onGenerateVoice={isVoiceUnit(u) ? () => onGenerateVoice(u) : null}
                  busy={busy}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function UnitRow({ unit, storyline, lang, langLabel, checked, onToggle, onEdit, onGenerateVoice, busy }) {
  const tr = lookupTranslation(unit, storyline, lang)
  const status = unitStatus(unit, storyline, lang)
  const badge = STATUS_BADGE[status]
  const vStatus = onGenerateVoice ? voiceStatus(unit, storyline, lang) : null
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceErr, setVoiceErr] = useState(null)

  const tag = unit.kind === 'script'
    ? `${MODE_ICON[unit.mode] || ''} [${unit.idx}] ${unit.isName ? '화자명' : unit.mode}`
    : unit.label

  const handleVoice = async () => {
    if (!onGenerateVoice) return
    setVoiceBusy(true); setVoiceErr(null)
    try { await onGenerateVoice() } catch (e) { setVoiceErr(e?.data?.error || e?.message || '실패'); setTimeout(() => setVoiceErr(null), 4000) }
    finally { setVoiceBusy(false) }
  }

  return (
    <div className="px-3 py-2 flex gap-3 items-start">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1.5 accent-indigo-500 flex-shrink-0" />
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-gray-500 font-mono truncate">{tag}</span>
          </div>
          <p className="text-sm text-gray-200 whitespace-pre-line break-words leading-relaxed">{unit.text}</p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.text}</span>
            {vStatus && vStatus !== 'n/a' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                vStatus === 'ok' ? 'bg-pink-950/50 text-pink-300 border-pink-800/50'
                : vStatus === 'stale' ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                🎤 {vStatus === 'ok' ? '음성 있음' : vStatus === 'stale' ? '음성 구버전' : '음성 없음'}
              </span>
            )}
            {status === 'stale' && tr?.src && (
              <span className="text-[10px] text-amber-500/80 truncate" title={`번역 당시 원문: ${tr.src}`}>번역 당시 원문과 다름</span>
            )}
          </div>
          <textarea
            value={tr?.value || ''}
            onChange={(e) => onEdit(e.target.value)}
            placeholder={`${langLabel} 번역 (비어 있으면 한국어로 표시됨)`}
            rows={Math.min(6, Math.max(1, Math.ceil((tr?.value || unit.text || '').length / 28)))}
            className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-gray-100 whitespace-pre-line focus:border-indigo-500 focus:outline-none"
            style={{ resize: 'vertical' }}
            lang={lang}
          />
          {onGenerateVoice && (
            <div className="mt-1.5 flex items-center gap-2">
              {tr?.voiceUrl && <audio src={tr.voiceUrl} controls className="h-7 flex-1 min-w-0" />}
              <button
                onClick={handleVoice}
                disabled={busy || voiceBusy || !tr?.value}
                className={`px-2 py-1 text-[10px] rounded font-medium flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                  tr?.voiceUrl ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-pink-600 hover:bg-pink-500 text-white'
                }`}
                style={{ outline: 'none' }}
                title={!tr?.value ? '먼저 번역이 있어야 합니다' : tr?.voiceUrl ? `${langLabel} 음성 재생성` : `${langLabel} 음성 생성`}
              >
                {voiceBusy ? '...' : tr?.voiceUrl ? '↻ 재생성' : `🎙 ${langLabel} 음성`}
              </button>
              {voiceErr && <span className="text-[10px] text-red-400 truncate">{voiceErr}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
