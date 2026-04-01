import { useNavigate } from 'react-router-dom'

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`
  return `${Math.floor(diff / 2592000)}달 전`
}

/**
 * @param {object} props
 * @param {number} props.postId
 * @param {string} props.imageUrl - 피드 이미지
 * @param {string} [props.caption]
 * @param {string} props.publishAt
 * @param {string} props.characterName
 * @param {number} props.characterId
 * @param {string} [props.thumbUrl] - 캐릭터 프로필 썸네일
 * @param {boolean} props.liked
 * @param {number} props.likesCount
 * @param {boolean} [props.affinityUp]
 * @param {() => void} props.onLike
 * @param {() => void} props.onComment
 * @param {() => void} [props.onImageClick]
 * @param {boolean} [props.showChatLink] - "대화하러 가기" 링크 표시 여부
 */
export default function FeedPostCard({
  postId,
  imageUrl,
  caption,
  publishAt,
  characterName,
  characterId,
  thumbUrl,
  liked,
  likesCount,
  affinityUp,
  onLike,
  onComment,
  onImageClick,
  showChatLink,
}) {
  const navigate = useNavigate()

  return (
    <div id={`feed-post-${postId}`} className="border-b border-gray-800">
      {/* 포스트 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(`/characters/${characterId}`)}
          className="flex items-center gap-3 flex-1 min-w-0"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt={characterName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
          <span className="font-semibold text-sm text-white truncate">{characterName}</span>
        </button>
        <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(publishAt)}</span>
      </div>

      {/* 포스트 이미지 */}
      <button
        onClick={onImageClick}
        className="aspect-square bg-gray-900 w-full block"
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        <img src={imageUrl} alt={caption || ''} className="w-full h-full object-cover" />
      </button>

      {/* 액션 버튼 */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-4">
          {/* 좋아요 */}
          <button
            onClick={onLike}
            className={`transition-colors ${liked ? 'text-red-500' : 'text-gray-100 hover:text-red-400'}`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          {/* 댓글 */}
          <button
            onClick={onComment}
            className="text-gray-100 hover:text-gray-300 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {/* 공유 */}
          <button
            className="text-gray-100 hover:text-gray-300 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* 좋아요 수 */}
        <div className="flex items-center gap-2 mt-2">
          <p className="text-sm font-semibold text-white">
            좋아요 {likesCount.toLocaleString()}개
          </p>
          {affinityUp && (
            <span className="text-[11px] text-pink-400">호감도가 올랐어요!</span>
          )}
        </div>

        {/* 캡션 */}
        {caption && (
          <p className="text-sm text-gray-100 mt-1">
            <span className="font-semibold mr-1.5">{characterName}</span>
            <span className="text-gray-300">{caption}</span>
          </p>
        )}

        {/* 대화하러 가기 */}
        {showChatLink && (
          <button
            onClick={() => navigate(`/characters/${characterId}`)}
            className="text-xs text-indigo-400 mt-1.5 hover:text-indigo-300 transition-colors"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            대화하러 가기 →
          </button>
        )}

        <div className="mb-3" />
      </div>
    </div>
  )
}
