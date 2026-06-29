import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'

// 보관함 — 한 캐릭터에게서 획득한 애셋(보이스/이미지/영상/의상)을 종류별 탭으로 보여준다.
// 진입: 마이페이지 보관함 그리드, (Phase 3) 채팅 갤러리 버튼.

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function CharacterCollection() {
  const { characterId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(null)
  const [viewer, setViewer] = useState(null) // { kind: 'image'|'video', url }

  useEffect(() => {
    let alive = true
    api.get(`/collection/${characterId}`)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [characterId])

  const tabs = useMemo(() => {
    if (!data) return []
    return [
      { key: 'voices', label: t('collection.tabVoices'), count: data.counts.voices },
      { key: 'images', label: t('collection.tabImages'), count: data.counts.images },
      { key: 'videos', label: t('collection.tabVideos'), count: data.counts.videos },
      { key: 'outfits', label: t('collection.tabOutfits'), count: data.counts.outfits },
    ]
  }, [data, t])

  // 첫 진입 시 항목 있는 첫 탭으로
  useEffect(() => {
    if (data && tab === null) {
      const first = tabs.find((x) => x.count > 0)
      setTab(first ? first.key : 'voices')
    }
  }, [data, tabs, tab])

  const totalCount = data ? data.counts.voices + data.counts.images + data.counts.videos + data.counts.outfits : 0

  return (
    <div className="relative min-h-full bg-gray-950 text-gray-100 pb-12">
      <Helmet><title>{t('collection.title')}</title></Helmet>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-gray-950/95 backdrop-blur border-b border-gray-800">
        <button
          onClick={() => navigate(-1)}
          className="-ml-2 p-2 text-gray-300"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <BackIcon />
        </button>
        {data?.character?.profileImage && (
          <img src={data.character.profileImage} alt="" className="w-7 h-7 rounded-full object-cover" />
        )}
        <h1 className="text-base font-bold truncate">{data?.character?.name || t('collection.title')}</h1>
      </div>

      {loading && <p className="text-center text-sm text-gray-500 py-16">{t('common.loading')}</p>}

      {!loading && data && totalCount === 0 && (
        <p className="text-center text-sm text-gray-500 py-16">{t('collection.empty')}</p>
      )}

      {!loading && data && totalCount > 0 && (
        <>
          {/* 종류 탭 */}
          <div className="sticky top-[49px] z-10 bg-gray-950/95 backdrop-blur px-3 py-2 border-b border-gray-800">
            <div className="grid grid-cols-4 gap-1">
              {tabs.map((tb) => (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                    tab === tb.key ? 'bg-white/10 text-white' : 'bg-gray-900 text-gray-500'
                  }`}
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  {tb.label}
                  {tb.count > 0 && <span className="ml-1 text-[10px] text-gray-400">{tb.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-4">
            {/* 보이스 */}
            {tab === 'voices' && (
              data.voices.length === 0 ? <EmptyTab t={t} /> : (
                <div className="space-y-3">
                  {data.voices.map((v) => (
                    <div key={v.id} className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                      {(v.title || v.emotion) && (
                        <p className="text-sm text-gray-200 mb-1">{v.title || v.emotion}</p>
                      )}
                      {v.transcript && <p className="text-xs text-gray-400 italic mb-2 whitespace-pre-line">"{v.transcript}"</p>}
                      <audio src={v.audioUrl} controls preload="none" className="w-full" />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* 이미지 */}
            {tab === 'images' && (
              data.images.length === 0 ? <EmptyTab t={t} /> : (
                <div className="grid grid-cols-3 gap-2">
                  {data.images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setViewer({ kind: 'image', url: img.imageUrl })}
                      className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                      style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <img src={img.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )
            )}

            {/* 영상 */}
            {tab === 'videos' && (
              data.videos.length === 0 ? <EmptyTab t={t} /> : (
                <div className="grid grid-cols-3 gap-2">
                  {data.videos.map((vid) => (
                    <button
                      key={vid.id}
                      onClick={() => setViewer({ kind: 'video', url: vid.videoUrl })}
                      className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                      style={{ aspectRatio: '9 / 16', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {vid.thumbnailUrl ? (
                        <img src={vid.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <video src={vid.videoUrl} className="absolute inset-0 w-full h-full object-cover" muted />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/55 border border-white/30 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* 의상 */}
            {tab === 'outfits' && (
              data.outfits.length === 0 ? <EmptyTab t={t} /> : (
                <div className="grid grid-cols-3 gap-2">
                  {data.outfits.map((o) => (
                    <div
                      key={o.id}
                      className="relative rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                      style={{ aspectRatio: '9 / 16' }}
                    >
                      {o.thumbnailUrl && (
                        <img src={o.thumbnailUrl} alt={o.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                        <span className="text-[11px] text-white truncate block">{o.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* 풀스크린 뷰어 */}
      {viewer && (
        <div
          className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
        >
          {viewer.kind === 'image' ? (
            <img src={viewer.url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          ) : (
            <video src={viewer.url} controls autoPlay playsInline className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}

function EmptyTab({ t }) {
  return <p className="text-center text-sm text-gray-500 py-12">{t('collection.emptyTab')}</p>
}
