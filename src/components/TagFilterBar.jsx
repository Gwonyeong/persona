import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useBackHandler from '../hooks/useBackHandler'

export default function TagFilterBar({
  selectedTags,
  tagCategories,
  onApply,
  followOnly,
  onFollowOnlyChange,
  showFollowFilter = false,
}) {
  const { t } = useTranslation()
  const [showModal, setShowModal] = useState(false)
  const [draftTags, setDraftTags] = useState([])
  const [draftFollowOnly, setDraftFollowOnly] = useState(false)

  useBackHandler(!!showModal, () => setShowModal(false))

  const openModal = () => {
    setDraftTags([...selectedTags])
    setDraftFollowOnly(followOnly ?? false)
    setShowModal(true)
  }

  const applyFilter = () => {
    onApply(draftTags)
    if (onFollowOnlyChange) onFollowOnlyChange(draftFollowOnly)
    setShowModal(false)
  }

  const activeCount = selectedTags.length + (followOnly ? 1 : 0)

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5">
            {followOnly && (
              <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-400 text-[11px] font-medium">
                {t('filter.followOnly')}
              </span>
            )}
            {selectedTags.map((tag) => {
              const allOptions = tagCategories.flatMap((c) => c.options)
              const opt = allOptions.find((o) => o.value === tag)
              return (
                <span key={tag} className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-400 text-[11px] font-medium">
                  {opt?.flag && (
                    <img src={`https://flagcdn.com/w40/${opt.flag}.png`} alt={opt.label} className="w-3.5 h-3.5 rounded-full object-cover" />
                  )}
                  {opt?.label || tag}
                </span>
              )
            })}
          </div>
        </div>
        <button
          onClick={openModal}
          className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600 transition-colors"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <circle cx="8" cy="6" r="2" fill="currentColor" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <circle cx="16" cy="12" r="2" fill="currentColor" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="11" cy="18" r="2" fill="currentColor" />
          </svg>
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {showModal && createPortal(
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6 bg-black/60" onClick={() => setShowModal(false)}>
          <div
            className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-5">{t('filter.title')}</h2>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto">
              {showFollowFilter && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 mb-2">{t('filter.exposure')}</p>
                  <div className="flex gap-2">
                    {[{ label: t('filter.all'), value: false }, { label: t('filter.followOnly'), value: true }].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setDraftFollowOnly(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          draftFollowOnly === opt.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tagCategories.map((cat) => (
                <div key={cat.key}>
                  <p className="text-xs font-semibold text-gray-400 mb-2">{cat.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.options.map((opt) => {
                      const isSelected = draftTags.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setDraftTags((prev) => {
                              const next = new Set(prev)
                              if (isSelected) {
                                next.delete(opt.value)
                              } else {
                                next.add(opt.value)
                              }
                              return [...next]
                            })
                          }}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          {opt.flag && (
                            <img src={`https://flagcdn.com/w40/${opt.flag}.png`} alt={opt.label} className="w-3.5 h-3.5 rounded-full object-cover" />
                          )}
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={applyFilter}
                className="flex-1 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('root')
      )}
    </>
  )
}
