import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const STATUS_LABEL = { DRAFT: '초안', ACTIVE: '진행중', CLOSED: '종료' }
const STATUS_COLOR = {
  DRAFT: 'bg-gray-700 text-gray-300',
  ACTIVE: 'bg-green-900 text-green-300',
  CLOSED: 'bg-gray-800 text-gray-500',
}

const QUESTION_TYPES = [
  { value: 'RATING', label: '별점 (1~5)' },
  { value: 'SINGLE_CHOICE', label: '단일 선택' },
  { value: 'MULTIPLE_CHOICE', label: '복수 선택' },
  { value: 'TEXT', label: '자유 텍스트' },
]

const DEFAULT_QUESTIONS = [
  {
    id: 1,
    type: 'RATING',
    text: '서비스 전반적인 만족도를 알려주세요 (1~5)',
    required: true,
  },
  {
    id: 2,
    type: 'MULTIPLE_CHOICE',
    text: '현재 Pesona를 이용하는 이유는 무엇인가요? (복수선택)',
    options: ['대화가 재밌음', '캐릭터의 컨셉', '목소리가 자연스러움', '캐릭터의 이미지'],
    required: true,
    allowComment: true,
  },
  {
    id: 3,
    type: 'SINGLE_CHOICE',
    text: '현재 Pesona에서 가장 아쉬운 점은 무엇인가요?',
    options: ['AI 응답 품질', '캐릭터 수·다양성', '음성통화 품질', '몰입도 부족', '원하는 기능 부족'],
    required: true,
    allowComment: true,
  },
  {
    id: 4,
    type: 'RATING',
    text: '음성 통화 기능의 만족도는 어떤가요? (1~5)',
    required: true,
  },
  {
    id: 5,
    type: 'MULTIPLE_CHOICE',
    text: '앞으로 추가됐으면 하는 기능은? (복수선택)',
    options: ['더 많은 캐릭터', '영상통화', '캐릭터 커스터마이징', '단톡방 개선', '캐릭터 일기장·일정'],
    required: true,
    allowComment: true,
  },
  {
    id: 6,
    type: 'TEXT',
    text: '자유롭게 의견을 남겨주세요 (선택)',
    required: false,
  },
]

function QuestionEditor({ question, onChange, onRemove }) {
  const updateField = (field, value) => onChange({ ...question, [field]: value })
  const updateOption = (i, value) => {
    const opts = [...(question.options || [])]
    opts[i] = value
    updateField('options', opts)
  }
  const addOption = () => updateField('options', [...(question.options || []), ''])
  const removeOption = (i) => updateField('options', (question.options || []).filter((_, idx) => idx !== i))

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <select
          value={question.type}
          onChange={(e) => updateField('type', e.target.value)}
          className="bg-gray-700 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 focus:outline-none flex-shrink-0"
        >
          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          value={question.text}
          onChange={(e) => updateField('text', e.target.value)}
          placeholder="질문 내용"
          className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="text-gray-500 hover:text-red-400 flex-shrink-0 px-1"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >✕</button>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => updateField('required', e.target.checked)}
            className="accent-indigo-500"
          />
          필수 응답
        </label>
        {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && (
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={question.allowComment || false}
              onChange={(e) => updateField('allowComment', e.target.checked)}
              className="accent-indigo-500"
            />
            추가 코멘트 허용
          </label>
        )}
      </div>

      {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && (
        <div className="space-y-2 pl-2">
          {(question.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`선택지 ${i + 1}`}
                className="flex-1 bg-gray-700 text-white text-xs rounded-lg px-2 py-1 border border-gray-600 focus:border-indigo-500 focus:outline-none"
              />
              <button onClick={() => removeOption(i)} className="text-gray-600 hover:text-red-400 text-xs" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>✕</button>
            </div>
          ))}
          <button
            onClick={addOption}
            className="text-xs text-indigo-400 hover:text-indigo-300"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >+ 선택지 추가</button>
        </div>
      )}
    </div>
  )
}

function SurveyForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [maskReward, setMaskReward] = useState(initial?.maskReward ?? 5)
  const [questions, setQuestions] = useState(initial?.questions || DEFAULT_QUESTIONS)
  const [saving, setSaving] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')

  const enterJsonMode = () => {
    setJsonText(JSON.stringify(questions, null, 2))
    setJsonError('')
    setJsonMode(true)
  }

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText)
      if (!Array.isArray(parsed)) throw new Error('배열이어야 합니다')
      setQuestions(parsed)
      setJsonError('')
      setJsonMode(false)
    } catch (e) {
      setJsonError(e.message)
    }
  }

  const updateQ = (i, q) => setQuestions((prev) => prev.map((x, idx) => idx === i ? q : x))
  const removeQ = (i) => setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  const addQ = () => setQuestions((prev) => [...prev, { id: Date.now(), type: 'RATING', text: '', required: true }])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({ title, description, maskReward: Number(maskReward), questions })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="설문 제목"
        className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-indigo-500 focus:outline-none"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="설명 (선택)"
        className="w-full bg-gray-800 text-white text-sm rounded-xl px-4 py-2.5 border border-gray-700 focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400 flex-shrink-0">완료 보상 마스크</label>
        <input
          type="number"
          min={0}
          value={maskReward}
          onChange={(e) => setMaskReward(e.target.value)}
          className="w-24 bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400 font-medium">질문 ({questions.length})</p>
          <button
            onClick={jsonMode ? () => setJsonMode(false) : enterJsonMode}
            className="text-xs text-indigo-400 hover:text-indigo-300"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {jsonMode ? '← 편집기로' : 'JSON으로 편집'}
          </button>
        </div>

        {jsonMode ? (
          <div className="space-y-2">
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonError('') }}
              rows={16}
              spellCheck={false}
              className="w-full bg-gray-900 text-green-300 text-xs font-mono rounded-xl px-4 py-3 border border-gray-700 focus:border-indigo-500 focus:outline-none resize-none"
            />
            {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
            <button
              onClick={applyJson}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              JSON 적용
            </button>
          </div>
        ) : (
          <>
            {questions.map((q, i) => (
              <QuestionEditor key={q.id} question={q} onChange={(nq) => updateQ(i, nq)} onRemove={() => removeQ(i)} />
            ))}
            <button
              onClick={addQ}
              className="w-full py-2.5 rounded-xl border border-dashed border-gray-600 text-sm text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              + 질문 추가
            </button>
          </>
        )}
      </div>

      {!jsonMode && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-600 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >취소</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-sm font-semibold text-white transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >{saving ? '저장 중...' : '저장'}</button>
        </div>
      )}
    </div>
  )
}

function ResultsView({ surveyId, onClose }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get(`/admin/surveys/${surveyId}/results`).then(setData).catch(() => {})
  }, [surveyId])

  if (!data) return <div className="text-center text-gray-500 py-8 text-sm">불러오는 중...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">{data.survey.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">응답 {data.responseCount}명</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>닫기</button>
      </div>

      {data.results.map((r) => (
        <div key={r.questionId} className="bg-gray-800 rounded-xl p-4">
          <p className="text-sm font-medium text-white mb-3">{r.text}</p>

          {r.type === 'RATING' && (
            <div>
              <p className="text-2xl font-bold text-indigo-400 mb-2">
                {r.avg ? r.avg.toFixed(1) : '—'} <span className="text-sm text-gray-500">/ 5</span>
              </p>
              <div className="space-y-1.5">
                {(r.distribution || []).map((d) => (
                  <div key={d.value} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-6">{d.value}★</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full"
                        style={{ width: r.total ? `${(d.count / r.total) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-gray-500 w-6 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(r.type === 'MULTIPLE_CHOICE' || r.type === 'SINGLE_CHOICE') && (
            <div className="space-y-3">
              <div className="space-y-2">
                {(r.options || []).map((opt) => (
                  <div key={opt.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-300">
                      <span>{opt.label}</span>
                      <span>{opt.count} ({opt.pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${opt.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {r.comments?.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-gray-700">
                  <p className="text-xs text-gray-500">추가 코멘트 ({r.comments.length})</p>
                  {r.comments.map((c, i) => (
                    <p key={i} className="text-xs text-gray-300 bg-gray-900 rounded-lg px-3 py-2">"{c}"</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {r.type === 'TEXT' && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {r.texts?.length === 0 && <p className="text-xs text-gray-500">응답 없음</p>}
              {(r.texts || []).map((t, i) => (
                <p key={i} className="text-xs text-gray-300 bg-gray-900 rounded-lg px-3 py-2">"{t}"</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AdminSurveys() {
  const [surveys, setSurveys] = useState([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [resultsId, setResultsId] = useState(null)
  const [notifying, setNotifying] = useState(null)

  const load = () => api.get('/admin/surveys').then(({ surveys: s }) => setSurveys(s)).catch(() => {})

  useEffect(() => { load() }, [])

  const handleCreate = async (data) => {
    await api.post('/admin/surveys', data)
    setCreating(false)
    load()
  }

  const handleUpdate = async (id, data) => {
    await api.put(`/admin/surveys/${id}`, data)
    setEditingId(null)
    load()
  }

  const handleStatus = async (id, status) => {
    await api.put(`/admin/surveys/${id}/status`, { status })
    load()
  }

  const handleNotify = async (id) => {
    setNotifying(id)
    try {
      const { sent } = await api.post(`/admin/surveys/${id}/notify`)
      alert(`${sent}명에게 푸시 알림을 발송했습니다.`)
    } catch {
      alert('발송 실패')
    } finally {
      setNotifying(null)
    }
  }

  if (resultsId) {
    return (
      <div className="p-4">
        <ResultsView surveyId={resultsId} onClose={() => setResultsId(null)} />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">설문조사</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            + 새 설문
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-700">
          <p className="text-sm font-semibold text-white mb-4">새 설문 만들기</p>
          <SurveyForm onSave={handleCreate} onCancel={() => setCreating(false)} />
        </div>
      )}

      {surveys.map((s) => (
        <div key={s.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
          {editingId === s.id ? (
            <>
              <p className="text-sm font-semibold text-white mb-2">설문 수정</p>
              <SurveyForm
                initial={s}
                onSave={(data) => handleUpdate(s.id, data)}
                onCancel={() => setEditingId(null)}
              />
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[s.status]}`}>
                  {STATUS_LABEL[s.status]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    응답 {s._count.responses}명 · 보상 마스크 {s.maskReward}개
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => setResultsId(s.id)}
                  className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >결과 보기</button>

                {s.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => setEditingId(s.id)}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >편집</button>
                    <button
                      onClick={() => handleStatus(s.id, 'ACTIVE')}
                      className="px-3 py-1.5 text-xs bg-green-900 hover:bg-green-800 text-green-300 rounded-lg transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >활성화</button>
                  </>
                )}

                {s.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => handleNotify(s.id)}
                      disabled={notifying === s.id}
                      className="px-3 py-1.5 text-xs bg-indigo-900 hover:bg-indigo-800 disabled:opacity-50 text-indigo-300 rounded-lg transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >{notifying === s.id ? '발송 중...' : '핵심유저 알림 발송'}</button>
                    <button
                      onClick={() => handleStatus(s.id, 'CLOSED')}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >종료</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {surveys.length === 0 && !creating && (
        <p className="text-center text-gray-500 text-sm py-12">설문이 없습니다.</p>
      )}
    </div>
  )
}
