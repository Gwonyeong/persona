import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const DISMISSED_KEY = 'survey_banner_dismissed'

export default function SurveyBanner() {
  const { token } = useStore()
  const navigate = useNavigate()
  const [survey, setSurvey] = useState(null)

  useEffect(() => {
    if (!token) return
    if (sessionStorage.getItem(DISMISSED_KEY)) return
    api.get('/surveys/current').then(({ survey: s }) => {
      if (s) setSurvey(s)
    }).catch(() => {})
  }, [token])

  if (!survey) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setSurvey(null)
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl bg-indigo-950 border border-indigo-800 px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-indigo-300 mb-0.5">설문조사</p>
        <p className="text-sm text-white font-medium truncate">{survey.title}</p>
        {survey.maskReward > 0 && (
          <p className="text-xs text-indigo-400 mt-0.5">완료 시 마스크 {survey.maskReward}개 지급</p>
        )}
      </div>
      <button
        onClick={() => navigate(`/survey/${survey.id}`)}
        className="flex-shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        참여하기
      </button>
      <button
        onClick={dismiss}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
