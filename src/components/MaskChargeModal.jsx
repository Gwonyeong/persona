import { useState } from 'react'
import { api } from '../lib/api'
import useStore from '../store/useStore'

const PACKAGES = [
  { amount: 30, price: '₩1,000', label: '30개' },
  { amount: 100, price: '₩3,000', label: '100개', badge: '인기' },
  { amount: 300, price: '₩8,000', label: '300개', badge: '할인' },
]

export default function MaskChargeModal({ onClose }) {
  const { masks } = useStore()
  const [selected, setSelected] = useState(1)
  const [loading, setLoading] = useState(false)

  const [errorMsg, setErrorMsg] = useState('')

  const handlePurchase = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const pkg = PACKAGES[selected]
      await api.post('/masks/purchase-attempt', {
        package: `${pkg.label}_${pkg.price}`,
      })
    } catch {}
    setLoading(false)
    setErrorMsg('죄송합니다. 시스템 에러가 발생했습니다.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        {/* 헤더 */}
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">🎭</div>
          <p className="text-lg font-bold text-gray-100">가면 충전</p>
          <p className="text-sm text-gray-400 mt-1">
            현재 보유: <span className="text-indigo-400 font-semibold">{masks}개</span>
          </p>
        </div>

        {/* 패키지 선택 */}
        <div className="flex flex-col gap-2.5 mb-5">
          {PACKAGES.map((pkg, i) => (
            <button
              key={pkg.amount}
              onClick={() => setSelected(i)}
              className={`relative flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                selected === i
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🎭</span>
                <span className="font-semibold text-gray-100">{pkg.label}</span>
                {pkg.badge && (
                  <span className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] font-bold text-white">
                    {pkg.badge}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-gray-300">{pkg.price}</span>
            </button>
          ))}
        </div>

        {/* 안내 */}
        <p className="text-xs text-gray-500 text-center mb-4">
          가면 1개로 캐릭터와 1회 대화할 수 있어요
        </p>

        {errorMsg && (
          <p className="text-sm text-red-400 text-center mb-4">{errorMsg}</p>
        )}

        {/* 버튼 */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {loading ? '처리 중...' : `${PACKAGES[selected].price} 결제하기`}
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
