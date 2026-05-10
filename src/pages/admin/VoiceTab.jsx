import { useMemo, useState } from 'react'

// 텍스트 미리보기 — 너무 길면 잘라서 표시
function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// 캐릭터 라인 1개 — 텍스트 + 보이스 상태 + 재생성 버튼
function VoiceRow({ chapter, item, scriptIndex, onRegenerate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const text = item.content || ''

  const handleRegenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await onRegenerate(chapter.id, scriptIndex, item)
    } catch (e) {
      setError(e?.data?.error || e?.message || '실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start gap-3 py-2 border-t border-gray-800 first:border-t-0">
      <div className="flex-shrink-0 w-12 text-[10px] text-gray-500 font-mono pt-1.5">
        #{scriptIndex}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-line break-words">{text}</p>
        {item.voiceUrl ? (
          <div className="mt-1.5">
            <audio src={item.voiceUrl} controls className="w-full h-8" />
          </div>
        ) : (
          <p className="text-[11px] text-amber-400/80 mt-1">⚠ 미생성</p>
        )}
        {error && (
          <p className="text-[11px] text-red-400 mt-1 break-words">⚠ {error}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        <button
          onClick={handleRegenerate}
          disabled={busy}
          className={`px-2.5 py-1.5 text-[11px] rounded transition-colors disabled:opacity-50 ${
            item.voiceUrl
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
          style={{ outline: 'none' }}
          title={item.voiceUrl ? '다시 생성' : '생성'}
        >
          {busy ? '...' : item.voiceUrl ? '🔄 재생성' : '🎙 생성'}
        </button>
      </div>
    </div>
  )
}

// 캐릭터 라인을 챕터 단위 섹션으로 그룹화
function buildSections(nodes) {
  if (!Array.isArray(nodes)) return []
  // 메인 챕터 인덱스 카운터 — 분기 노드는 0부터 다시 세지 않고 main flow 안에서만 카운트
  let mainIdx = 0
  const branchCounters = new Map() // choiceId → counter
  const sections = []
  for (const n of nodes) {
    if (n.nodeType !== 'CHAPTER') continue
    const script = Array.isArray(n.script) ? n.script : []
    const characterItems = script
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.mode === 'character')
    if (characterItems.length === 0) continue

    const isBranch = n.branchFromChoiceId != null
    let label
    if (isBranch) {
      const cnt = branchCounters.get(n.branchFromChoiceId) || 0
      branchCounters.set(n.branchFromChoiceId, cnt + 1)
      label = `└ 분기 #${cnt} · choice ${n.branchFromChoiceId}`
    } else {
      label = `Chapter #${mainIdx}`
      mainIdx++
    }
    sections.push({
      key: `node-${n.id}`,
      chapter: n,
      label,
      isBranch,
      items: characterItems,
    })
  }
  return sections
}

export default function VoiceTab({ storyline, onGenerateVoice, onBulkGenerateAll, bulkVoiceProgress }) {
  const sections = useMemo(() => buildSections(storyline?.nodes), [storyline?.nodes])

  const stats = useMemo(() => {
    let total = 0, withVoice = 0
    for (const sec of sections) {
      for (const { it } of sec.items) {
        total++
        if (it.voiceUrl) withVoice++
      }
    }
    return { total, withVoice, missing: total - withVoice }
  }, [sections])

  if (sections.length === 0) {
    return (
      <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-lg text-center">
        <p className="text-sm text-gray-400">캐릭터 발화(mode: 'character')가 없습니다.</p>
        <p className="text-[11px] text-gray-500 mt-1">
          CHAPTER 노드의 character 라인이 있어야 보이스를 생성할 수 있습니다.
        </p>
      </div>
    )
  }

  const bulkActive = !!bulkVoiceProgress

  return (
    <div className="space-y-4">
      {/* 헤더 — 통계 + 전체 일괄 버튼 */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-200 font-medium">
              캐릭터 발화 — {stats.withVoice}/{stats.total} 생성 완료
              {stats.missing > 0 && (
                <span className="text-amber-400 ml-2">· {stats.missing}개 미생성</span>
              )}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              CHAPTER 노드의 모든 character 라인. 메인 + PREMIUM 분기까지 포함.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onBulkGenerateAll({ overwrite: false })}
              disabled={bulkActive || stats.missing === 0}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ outline: 'none' }}
              title="미생성 라인만 일괄 생성"
            >
              {bulkActive ? '생성 중...' : `🎙 전체 일괄 생성 (${stats.missing}개)`}
            </button>
            <button
              onClick={() => onBulkGenerateAll({ overwrite: true })}
              disabled={bulkActive || stats.total === 0}
              className="px-3 py-1.5 bg-amber-700/80 hover:bg-amber-600 text-amber-50 text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ outline: 'none' }}
              title="이미 생성된 라인까지 모두 다시 생성"
            >
              🔄 전체 덮어쓰기 ({stats.total}개)
            </button>
          </div>
        </div>

        {/* 진행 표시 */}
        {bulkActive && (
          <div className="mt-3">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${(bulkVoiceProgress.done / bulkVoiceProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {bulkVoiceProgress.done}/{bulkVoiceProgress.total}
              {bulkVoiceProgress.failures.length > 0 && (
                <span className="text-red-400 ml-2">· 실패 {bulkVoiceProgress.failures.length}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* 챕터별 섹션 */}
      {sections.map((sec) => {
        const sectionMissing = sec.items.filter(({ it }) => !it.voiceUrl).length
        const firstScriptText = sec.chapter.script?.find((s) => s.text || s.content)?.text
          || sec.chapter.script?.find((s) => s.text || s.content)?.content
          || ''
        return (
          <section
            key={sec.key}
            className={`rounded-lg border ${sec.isBranch ? 'bg-amber-950/10 border-amber-900/40' : 'bg-gray-900/40 border-gray-800'}`}
          >
            <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-mono ${sec.isBranch ? 'text-amber-300' : 'text-gray-300'}`}>{sec.label}</span>
              <span className="text-[10px] text-gray-500">·</span>
              <span className="text-[11px] text-gray-400">
                {sec.items.length - sectionMissing}/{sec.items.length} 생성
              </span>
              {firstScriptText && (
                <span className="text-[11px] text-gray-500 truncate flex-1 min-w-0">
                  "{truncate(firstScriptText, 40)}"
                </span>
              )}
            </div>
            <div className="px-3 py-1">
              {sec.items.map(({ it, i }) => (
                <VoiceRow
                  key={`${sec.key}-${i}`}
                  chapter={sec.chapter}
                  item={it}
                  scriptIndex={i}
                  onRegenerate={onGenerateVoice}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
