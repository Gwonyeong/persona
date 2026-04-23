import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const REASONS = ['SEXUAL', 'VIOLENCE', 'HARASSMENT', 'HATE_SPEECH', 'PERSONAL_INFO', 'OTHER']

/**
 * @param {object} props
 * @param {'CONVERSATION' | 'FEED_POST'} props.targetType
 * @param {number} props.targetId
 * @param {() => void} props.onClose
 */
export default function ReportModal({ targetType, targetId, onClose }) {
  const { t } = useTranslation()
  const token = useStore((s) => s.token)
  const [selectedReason, setSelectedReason] = useState(null)
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // 'success' | 'duplicate' | 'error'

  const handleSubmit = async () => {
    if (!selectedReason || submitting) return
    setSubmitting(true)
    try {
      await api.post('/reports', {
        targetType,
        targetId,
        reason: selectedReason,
        detail: detail.trim() || undefined,
      })
      setResult('success')
    } catch (error) {
      if (error.message?.includes('Already reported') || error.status === 409) {
        setResult('duplicate')
      } else {
        setResult('error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="mx-6 w-full max-w-sm bg-gray-900 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <p className="text-white text-center">{t('login.title')}</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    )
  }

  // 결과 화면
  if (result) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="mx-6 w-full max-w-sm bg-gray-900 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center mb-3">
            {result === 'success' ? (
              <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-yellow-600/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            )}
          </div>
          <p className="text-white font-semibold text-center mb-1">
            {result === 'success' ? t('report.successTitle') : result === 'duplicate' ? t('report.duplicateTitle') : t('report.errorTitle')}
          </p>
          <p className="text-gray-400 text-sm text-center mb-4">
            {result === 'success' ? t('report.successDesc') : result === 'duplicate' ? t('report.duplicateDesc') : t('report.errorDesc')}
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-white bg-indigo-600 rounded-xl font-semibold"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-900 border-t border-gray-700 rounded-t-2xl p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        <p className="text-white font-semibold text-center mb-1">{t('report.title')}</p>
        <p className="text-gray-400 text-sm text-center mb-4">{t('report.description')}</p>

        {/* 신고 사유 선택 */}
        <div className="space-y-2 mb-4">
          {REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => setSelectedReason(reason)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                selectedReason === reason
                  ? 'bg-red-600/20 border border-red-500/50 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {t(`report.reason.${reason}`)}
            </button>
          ))}
        </div>

        {/* 상세 설명 (선택) */}
        {selectedReason && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('report.detailPlaceholder')}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none resize-none mb-4"
          />
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-gray-400 bg-gray-800 rounded-xl"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-xl font-semibold disabled:opacity-40"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {submitting ? t('common.processing') : t('report.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
