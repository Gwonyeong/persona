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
  const scrolledRef = useRef(false)
  const targetPostId = searchParams.get('postId')

  useEffect(() => {
    api.get(`/characters/${id}`).then(({ character }) => setCharacter(character))
  }, [id, i18n.language])

  useBackHandler(!!lightboxUrl, () => setLightboxUrl(null))
  useBackHandler(!!commentPostId, () => setCommentPostId(null))

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
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
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

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {commentPostId && (
        <CommentSheet
          postId={commentPostId}
          characterName={character.name}
          characterThumbUrl={thumbUrl}
          onClose={() => setCommentPostId(null)}
        />
      )}
    </div>
  )
}
