import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'

export default function DeleteAccount() {
  const navigate = useNavigate()
  const { clearAuth } = useStore()
  const [confirmed, setConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirmed || deleting) return
    setDeleting(true)
    try {
      await api.delete('/auth/account')
      clearAuth()
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Account deletion failed:', err)
      setDeleting(false)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-950 z-20">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h1 className="text-base font-semibold text-white">회원 탈퇴</h1>
      </header>

      <div className="flex-1 px-5 py-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <p className="text-white font-semibold mb-3">탈퇴 시 삭제되는 정보</p>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              <span>모든 대화 기록 및 캐릭터와의 호감도</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              <span>보유 중인 가면 (재화)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              <span>북마크, 팔로우, 알림 설정</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 mt-0.5">•</span>
              <span>프로필 정보 (닉네임, 아바타)</span>
            </li>
          </ul>
          <p className="text-xs text-red-400 mt-4">삭제된 데이터는 복구할 수 없습니다.</p>
        </div>

        <button
          onClick={() => setConfirmed((v) => !v)}
          className="flex items-center gap-3 mb-6"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${confirmed ? 'bg-red-500 border-red-500' : 'border-gray-600'}`}>
            {confirmed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <span className="text-sm text-gray-300">위 내용을 확인했으며, 탈퇴에 동의합니다</span>
        </button>

        <button
          onClick={handleDelete}
          disabled={!confirmed || deleting}
          className="w-full py-3 text-sm font-semibold text-white bg-red-600 rounded-xl disabled:opacity-30 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {deleting ? '처리 중...' : '탈퇴하기'}
        </button>
      </div>
    </div>
  )
}
