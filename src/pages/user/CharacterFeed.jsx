import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { api } from '../../lib/api'
import useStore from '../../store/useStore'
import useBackHandler from '../../hooks/useBackHandler'
import FeedPostCard from '../../components/FeedPostCard'
import CommentSheet from '../../components/CommentSheet'
import Lightbox from '../../components/Lightbox'
import LoginModal from '../../components/LoginModal'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

export default function CharacterFeed() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { token } = useStore()
  const [character, setCharacter] = useState(null)
  const [likeState, setLikeState] = useState({})
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [commentPostId, setCommentPostId] = useState(null)
  const [existingConv, setExistingConv] = useState(null)
  const [starting, setStarting] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const scrolledRef = useRef(false)
  const targetPostId = searchParams.get('postId')

  useEffect(() => {
    api.get(`/characters/${id}`).then(({ character }) => setCharacter(character))
  }, [id, i18n.language])

  useEffect(() => {
    if (!token) { setExistingConv(null); return }
    api.get(`/conversations/check/${id}`)
      .then((data) => setExistingConv(data.exists ? data : null))
      .catch(() => setExistingConv(null))
  }, [id, token])

  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(!!commentPostId, () => setCommentPostId(null))

  const handleSendMessage = async () => {
    if (!token) { setShowLoginModal(true); return }
    if (existingConv) { navigate(`/chats/${existingConv.conversationId}`); return }
    setStarting(true)
    try {
      const { conversation } = await api.post('/conversations', { characterId: parseInt(id) })
      navigate(`/chats/${conversation.id}`)
    } catch (error) {
      console.error(error)
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!character || !targetPostId || scrolledRef.current) return
    scrolledRef.current = true
    requestAnimationFrame(() => {
      const el = document.getElementById(`feed-post-${targetPostId}`)
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
  }, [character, targetPostId])

  const toggleLike = async (postId) => {
    if (!token) return
    const prev = likeState[postId]
    setLikeState((s) => ({
      ...s,
      [postId]: {
        liked: prev ? !prev.liked : true,
        likesCount: prev ? prev.likesCount + (prev.liked ? -1 : 1) : 1,
      },
    }))
    try {
      const data = await api.post(`/feed-likes/${postId}`)
      setLikeState((s) => ({ ...s, [postId]: { liked: data.liked, likesCount: data.likesCount, affinityUp: data.affinityUp } }))
    } catch {
      if (prev) setLikeState((s) => ({ ...s, [postId]: prev }))
    }
  }

  if (!character) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">{t('common.loading')}</div>
  }

  const mainStyle = character.styles?.[0]
  const mainImage = mainStyle?.images?.find((i) => i.emotion === 'NEUTRAL') || mainStyle?.images?.[0]
  const thumbUrl = getImageUrl(mainImage?.filePath)
  const feedPosts = (character.feedPosts || []).sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt))

  return (
    <div className="relative flex flex-col h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{character.name}의 피드 - Pesona</title>
      </Helmet>

      {/* 슬라이드업 애니메이션 */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="font-bold text-base">{t('character.posts')}</span>
      </header>

      <div className="flex-1 overflow-auto">
        {feedPosts.map((post) => {
          const ls = likeState[post.id]
          return (
            <FeedPostCard
              key={post.id}
              postId={post.id}
              images={post.images}
              imageUrl={post.images?.[0]?.filePath || post.filePath}
              caption={post.caption}
              publishAt={post.publishAt}
              characterName={character.name}
              characterId={character.id}
              thumbUrl={thumbUrl}
              liked={ls ? ls.liked : post.liked}
              likesCount={ls ? ls.likesCount : post.likesCount || 0}
              affinityUp={ls?.affinityUp}
              onLike={() => toggleLike(post.id)}
              onComment={() => setCommentPostId(post.id)}
              onImageClick={(url) => setLightboxUrl(url || post.images?.[0]?.filePath || post.filePath)}
            />
          )
        })}

        {feedPosts.length === 0 && (
          <div className="text-center text-gray-500 py-16">
            <p className="text-sm">{t('character.emptyPosts')}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleSendMessage}
        disabled={starting}
        className="absolute right-4 z-40 flex items-center gap-2 pl-4 pr-5 h-12 rounded-full bg-indigo-600 shadow-lg shadow-indigo-600/30 text-white text-sm font-semibold hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition-all"
        style={{
          bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 1rem)',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {starting ? t('character.starting') : t('character.sendMessage')}
      </button>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {commentPostId && (
        <CommentSheet
          postId={commentPostId}
          characterName={character.name}
          characterThumbUrl={thumbUrl}
          onClose={() => setCommentPostId(null)}
        />
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} onLoginSuccess={() => setShowLoginModal(false)} />}
    </div>
  )
}
