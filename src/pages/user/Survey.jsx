import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-3 justify-center py-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="text-4xl transition-transform active:scale-90"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <span className={(hover || value) >= star ? 'text-yellow-400' : 'text-gray-600'}>★</span>
        </button>
      ))}
    </div>
  )
}

export default function Survey() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token, masks, setMasks } = useStore()
  const [survey, setSurvey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [maskReward, setMaskReward] = useState(0)

  useEffect(() => {
    if (!token) { navigate('/login'); return }
    api.get('/surveys/current').then(({ survey: s }) => {
      if (!s || s.id !== Number(id)) {
        navigate('/')
        return
      }
      setSurvey(s)
    }).catch(() => navigate('/')).finally(() => setLoading(false))
  }, [id, token, navigate])

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-950" />
  if (!survey) return null

  const questions = survey.questions || []
  const currentQ = questions[step]
  const isLast = step === questions.length - 1

  const setAnswer = (qId, value) => setAnswers((prev) => ({ ...prev, [qId]: value }))

  const canProceed = () => {
    if (!currentQ.required) return true
    const ans = answers[currentQ.id]
    if (currentQ.type === 'RATING') return !!ans
    if (currentQ.type === 'SINGLE_CHOICE') return !!(ans?.value)
    if (currentQ.type === 'MULTIPLE_CHOICE') return (ans?.values?.length || 0) > 0
    if (currentQ.type === 'TEXT') return typeof ans === 'string' && ans.trim().length > 0
    return true
  }

  const handleNext = () => {
    if (!canProceed()) return
    if (isLast) handleSubmit()
    else setStep((s) => s + 1)
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const { maskReward: reward } = await api.post(`/surveys/${survey.id}/respond`, { answers })
      if (reward > 0) setMasks(masks + reward)
      setMaskReward(reward || 0)
      setDone(true)
    } catch {
      setSubmitting(false)
    }
  }

  const toggleMulti = (qId, option) => {
    setAnswers((prev) => {
      const cur = prev[qId]?.values || []
      return {
        ...prev,
        [qId]: {
          values: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option],
          comment: prev[qId]?.comment || '',
        },
      }
    })
  }

  const setChoiceComment = (qId, comment) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], comment } }))
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 px-6 text-center">
        <Helmet><title>설문 완료</title></Helmet>
        <div className="text-5xl mb-6">🎉</div>
        <h2 className="text-xl font-bold text-white mb-2">소중한 의견 감사해요!</h2>
        <p className="text-gray-400 text-sm mb-2">더 좋은 서비스로 보답할게요.</p>
        {maskReward > 0 && (
          <p className="text-indigo-400 font-semibold mb-6">마스크 {maskReward}개가 지급되었어요.</p>
        )}
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          홈으로
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full bg-gray-950 overflow-hidden">
      <Helmet><title>{survey.title}</title></Helmet>

      <div className="flex items-center px-4 pt-[env(safe-area-inset-top)] pt-4 pb-3 border-b border-gray-800">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 flex items-center justify-center text-gray-400 mr-3"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-sm font-semibold text-white truncate">{survey.title}</h1>
        <span className="text-xs text-gray-500">{step + 1} / {questions.length}</span>
      </div>

      <div className="h-1 bg-gray-800">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((step + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-hidden px-5 py-6 pb-28">
        <p className="text-white font-semibold text-base mb-6 leading-relaxed">{currentQ.text}</p>

        {currentQ.type === 'RATING' && (
          <StarRating value={answers[currentQ.id] || 0} onChange={(v) => setAnswer(currentQ.id, v)} />
        )}

        {currentQ.type === 'SINGLE_CHOICE' && (
          <div className="flex flex-col gap-3">
            {(currentQ.options || []).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAnswer(currentQ.id, { value: opt, comment: answers[currentQ.id]?.comment || '' })}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                  answers[currentQ.id]?.value === opt
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 active:bg-gray-800'
                }`}
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {opt}
              </button>
            ))}
            {currentQ.allowComment && (
              <textarea
                value={answers[currentQ.id]?.comment || ''}
                onChange={(e) => setChoiceComment(currentQ.id, e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="추가 의견이 있으면 남겨주세요 (선택)"
                className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:border-indigo-500 focus:outline-none"
              />
            )}
          </div>
        )}

        {currentQ.type === 'MULTIPLE_CHOICE' && (
          <div className="flex flex-col gap-3">
            {(currentQ.options || []).map((opt) => {
              const selected = answers[currentQ.id]?.values?.includes(opt) || false
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleMulti(currentQ.id, opt)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors flex items-center gap-3 ${
                    selected
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-300 active:bg-gray-800'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'bg-white border-white' : 'border-gray-500'}`}>
                    {selected && (
                      <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2.5">
                        <path d="M1 4l2.5 2.5L9 1" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {opt}
                </button>
              )
            })}
            {currentQ.allowComment && (
              <textarea
                value={answers[currentQ.id]?.comment || ''}
                onChange={(e) => setChoiceComment(currentQ.id, e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="추가 의견이 있으면 남겨주세요 (선택)"
                className="mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:border-indigo-500 focus:outline-none"
              />
            )}
          </div>
        )}

        {currentQ.type === 'TEXT' && (
          <textarea
            value={answers[currentQ.id] || ''}
            onChange={(e) => setAnswer(currentQ.id, e.target.value)}
            maxLength={500}
            rows={5}
            placeholder="자유롭게 의견을 남겨주세요"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:border-indigo-500 focus:outline-none"
          />
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-5 pt-3 pb-6 border-t border-gray-800 bg-gray-950" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleNext}
          disabled={!canProceed() || submitting}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {submitting ? '제출 중...' : isLast ? '제출하기' : '다음'}
        </button>
        {!currentQ.required && (
          <button
            onClick={() => isLast ? handleSubmit() : setStep((s) => s + 1)}
            className="w-full mt-2 py-2 text-xs text-gray-500"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
