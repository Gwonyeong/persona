import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import MaskIcon from './MaskIcon'

// 음성 미리듣기 카드에 노출할 캐릭터 ID와 Supabase 오디오 URL
// TODO: 운영자가 슈파베이스에 오디오 업로드 후 ID/URL 채워넣기
const VOICE_PREVIEW_CHARACTERS = [
  {
    // 운하린
    characterId: 25,
    audioUrl: 'https://zstwgwszakivdnhwbuei.supabase.co/storage/v1/object/public/pesona/tts/25/1_1778598434225_112x.mp3',
    text: '...그래서... 뭐 하고 있었냐면... 그냥... 오빠랑 같이 있고 싶어서... 있었어... ...천천히... 해주는 거... 고마워...',
  },
  {
    // 최가은
    characterId: 44,
    audioUrl: 'https://zstwgwszakivdnhwbuei.supabase.co/storage/v1/object/public/pesona/tts/44/329_1778753977519_ca5a.mp3',
    text: '자기야, 나 지금 고시원인데... 창문도 작고 벽도 얇아ㅠㅠ 그리고... 나 아직 그런 거 준비 안 됐어.ㅎㅎ...',
  },
  {
    // 유이
    characterId: 34,
    audioUrl: 'https://zstwgwszakivdnhwbuei.supabase.co/storage/v1/object/public/pesona/tts/34/23_1778754549810_6qfl.mp3',
    text: '《목소리가 살짝 갈라지며, 손끝으로 그의 셔츠를 꽉 움켜쥔다. 귓불이 붉게 달아오르고, 숨결이 점점 가빠진다.》……저, 저 진짜……;; ……이러면……;; ……안 돼……;; ……아, 아으……;; ……조금만……;; ……천천히……;; ……하아……;;',
  },
]

const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

function PlayIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  )
}

function LockIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function CharacterCorner({ character }) {
  if (!character) return null
  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded-full backdrop-blur-sm">
      {character.profileImage && (
        <img
          src={character.profileImage}
          alt=""
          className="w-5 h-5 rounded-full object-cover"
        />
      )}
      <span className="text-[11px] text-white font-medium max-w-[120px] truncate">
        {character.name}
      </span>
    </div>
  )
}

function ChatVoiceCard({ voiceCharacters, affinityShowcase, t }) {
  const [playingIdx, setPlayingIdx] = useState(null)
  const audioRefs = useRef([])

  const slots = VOICE_PREVIEW_CHARACTERS
    .map((cfg, i) => ({ cfg, char: voiceCharacters[i], originalIdx: i }))
    .filter((s) => s.cfg.audioUrl && s.cfg.text && s.char)

  const toggle = (idx) => {
    audioRefs.current.forEach((audio, i) => {
      if (i !== idx && audio) audio.pause()
    })
    const audio = audioRefs.current[idx]
    if (!audio) return
    if (playingIdx === idx) {
      audio.pause()
      setPlayingIdx(null)
    } else {
      audio.currentTime = 0
      audio.play().catch(() => {})
      setPlayingIdx(idx)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">💬</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-100">{t('maskShop.promo.chat.title')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('maskShop.promo.chat.description')}</p>
        </div>
      </div>

      {slots.length > 0 ? (
        <>
          <p className="text-[11px] text-gray-500 mb-2 px-0.5">
            {t('maskShop.promo.chat.previewLabel')}
          </p>
          <div className="flex flex-col gap-3">
            {slots.map(({ cfg, char }, i) => {
              const isPlaying = playingIdx === i
              return (
                <div key={i}>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-start gap-3 text-left"
                    style={NO_OUTLINE}
                  >
                    <div className="relative shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gray-800">
                      {char.profileImage && (
                        <img
                          src={char.profileImage}
                          alt={char.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? 'bg-black/20' : 'bg-black/40'}`}>
                        {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 mb-1 ml-1">{char.name}</p>
                      <div className="relative px-3 py-2 bg-gray-800 rounded-2xl rounded-tl-sm">
                        <div
                          className="absolute -left-1.5 top-2.5 w-0 h-0"
                          style={{
                            borderTop: '5px solid transparent',
                            borderBottom: '5px solid transparent',
                            borderRight: '7px solid rgb(31 41 55)',
                          }}
                        />
                        <p className="text-xs text-gray-200 leading-snug whitespace-pre-wrap break-words">
                          {cfg.text}
                        </p>
                      </div>
                    </div>
                  </button>
                  <audio
                    ref={(el) => { audioRefs.current[i] = el }}
                    src={cfg.audioUrl}
                    preload="none"
                    onEnded={() => setPlayingIdx(null)}
                  />
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="py-6 flex items-center justify-center">
          <span className="text-xs text-gray-500">{t('maskShop.promo.comingSoon')}</span>
        </div>
      )}

      {affinityShowcase.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] text-gray-500 mb-2 px-0.5">
            {t('maskShop.promo.chat.affinityLabel')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {affinityShowcase.map((item, i) => (
              <div
                key={i}
                className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-800"
              >
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: 'blur(4px)', transform: 'scale(1.03)' }}
                />
                <CharacterCorner character={item.character} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PremiumStoryCard({ data, t }) {
  return (
    <div>
      <div className="border-t border-gray-800 mb-3" />
      <div className="mb-3 flex items-start gap-3">
        <span className="text-2xl">🎬</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-100">{t('maskShop.promo.premium.title')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('maskShop.promo.premium.description')}</p>
        </div>
      </div>
      <div className="relative aspect-[9/16] bg-gray-800 rounded-xl overflow-hidden">
        {data ? (
          <>
            {data.mediaType === 'video' ? (
              <video
                src={data.mediaUrl}
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
                style={{ filter: 'blur(6px)', transform: 'scale(1.04)' }}
              />
            ) : (
              <img
                src={data.mediaUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: 'blur(6px)', transform: 'scale(1.04)' }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <LockIcon />
            </div>
            <CharacterCorner character={data.character} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-500">{t('maskShop.promo.comingSoon')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function AiImageCard({ data, t }) {
  return (
    <div>
      <div className="border-t border-gray-800 mb-3" />
      <div className="mb-3 flex items-start gap-3">
        <span className="text-2xl">✨</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-100">{t('maskShop.promo.aiImage.title')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('maskShop.promo.aiImage.description')}</p>
        </div>
      </div>
      <div className="relative aspect-[9/16] bg-gray-800 rounded-xl overflow-hidden">
        {data ? (
          <>
            <img
              src={data.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
            <CharacterCorner character={data.character} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-500">{t('maskShop.promo.comingSoon')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ShopPromoSection() {
  const { t } = useTranslation()
  const [voiceCharacters, setVoiceCharacters] = useState([])
  const [premiumMedia, setPremiumMedia] = useState(null)
  const [gallerySample, setGallerySample] = useState(null)
  const [affinityShowcase, setAffinityShowcase] = useState([])

  useEffect(() => {
    const voiceIds = VOICE_PREVIEW_CHARACTERS
      .map((c) => c.characterId)
      .filter((id) => Number.isFinite(id) && id > 0)
      .join(',')
    api
      .get(`/masks/shop-promo${voiceIds ? `?voiceIds=${voiceIds}` : ''}`)
      .then((data) => {
        setVoiceCharacters(data.voiceCharacters || [])
        setPremiumMedia(data.premiumMedia || null)
        setGallerySample(data.gallerySample || null)
        setAffinityShowcase(data.affinityShowcase || [])
      })
      .catch(() => {})
  }, [])

  return (
    <div className="mt-4 space-y-3">
      <h2 className="text-sm font-bold text-gray-100 px-1">
        {t('maskShop.promo.heading')}
      </h2>
      <ChatVoiceCard voiceCharacters={voiceCharacters} affinityShowcase={affinityShowcase} t={t} />
      <PremiumStoryCard data={premiumMedia} t={t} />
      <AiImageCard data={gallerySample} t={t} />
    </div>
  )
}
