import { useNavigate } from 'react-router-dom'

export default function LoginModal({ onClose }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
        <p className="text-lg font-bold text-gray-100 mb-2">로그인이 필요해요</p>
        <p className="text-sm text-gray-400 mb-6">
          이 기능을 사용하려면 로그인해주세요.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => {
              onClose()
              navigate('/login')
            }}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            로그인
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
