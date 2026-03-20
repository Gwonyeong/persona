import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function timeAgo(idx) {
  const units = ['방금 전', '1분 전', '3분 전', '5분 전', '10분 전', '30분 전', '1시간 전', '2시간 전', '3시간 전', '5시간 전', '8시간 전', '12시간 전', '1일 전', '2일 전', '3일 전']
  return units[idx % units.length]
}

const CAPTIONS = [
  '오늘도 좋은 하루 보내세요 ☀️',
  '이런 날엔 산책이 최고야 🌿',
  '새로운 하루, 새로운 시작 ✨',
  '오늘의 기분은 이 정도? 😊',
  '혼자만의 시간도 소중하니까 💭',
  '이 순간을 기억하고 싶어 📸',
  '당신과 함께라면 어디든 좋아 💕',
  '오늘은 특별한 날이 될 거야 🎉',
  '가끔은 멈춰서 하늘을 올려다봐 🌙',
  '맛있는 거 먹으면 기분이 좋아지지 🍰',
]

export default function Feed() {
  const [characters, setCharacters] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/characters').then(({ characters }) => setCharacters(characters))
  }, [])

  // 스토리용: 캐릭터별 대표 이미지
  const storyCharacters = characters.map((c) => {
    const style = c.styles?.[0]
    const neutralImg = style?.images?.find((img) => img.emotion === 'NEUTRAL')
    const fallbackImg = style?.images?.[0]
    return {
      ...c,
      thumbUrl: getImageUrl((neutralImg || fallbackImg)?.filePath),
    }
  })

  // 피드용: 캐릭터별 다양한 감정 이미지를 피드 포스트로 변환
  const feedPosts = characters.flatMap((c, cIdx) => {
    const style = c.styles?.[0]
    if (!style?.images?.length) return []
    // 캐릭터당 감정 이미지를 각각 포스트로
    return style.images
      .filter((img) => getImageUrl(img.filePath))
      .map((img, imgIdx) => ({
        id: `${c.id}-${img.id}`,
        character: c,
        imageUrl: getImageUrl(img.filePath),
        emotion: img.emotion,
        caption: CAPTIONS[(cIdx + imgIdx) % CAPTIONS.length],
        timeAgo: timeAgo(cIdx * 3 + imgIdx),
        likes: Math.floor(Math.random() * 500 + 50),
        thumbUrl: getImageUrl(
          (style.images.find((i) => i.emotion === 'NEUTRAL') || style.images[0])?.filePath
        ),
      }))
  })

  // likes를 안정적으로 유지하기 위해 seed 기반
  const stablePosts = feedPosts.map((post, i) => ({
    ...post,
    likes: ((i + 1) * 137 + 42) % 500 + 50,
  }))

  return (
    <div className="pb-2">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-gray-950 px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">피드</h1>
      </div>

      {/* 스토리 */}
      <div className="px-4 py-3">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {storyCharacters.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/characters/${c.id}`)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                <div className="w-full h-full rounded-full bg-gray-950 p-[2px]">
                  {c.thumbUrl ? (
                    <img
                      src={c.thumbUrl}
                      alt={c.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center">
                      <span className="text-lg text-gray-500">?</span>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-gray-300 w-16 text-center truncate">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t border-gray-800" />

      {/* 피드 포스트 */}
      <div>
        {stablePosts.map((post) => (
          <div key={post.id} className="border-b border-gray-800">
            {/* 포스트 헤더 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => navigate(`/characters/${post.character.id}`)}
                className="flex items-center gap-3 flex-1 min-w-0"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                {post.thumbUrl ? (
                  <img
                    src={post.thumbUrl}
                    alt={post.character.name}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-gray-400">?</span>
                  </div>
                )}
                <span className="font-semibold text-sm text-white truncate">
                  {post.character.name}
                </span>
              </button>
              <span className="text-xs text-gray-500 flex-shrink-0">{post.timeAgo}</span>
            </div>

            {/* 포스트 이미지 */}
            <div className="aspect-square bg-gray-900">
              <img
                src={post.imageUrl}
                alt={`${post.character.name} - ${post.emotion}`}
                className="w-full h-full object-cover"
              />
            </div>

            {/* 액션 버튼 */}
            <div className="px-4 pt-3">
              <div className="flex items-center gap-4">
                {/* 좋아요 */}
                <button
                  className="text-gray-100 hover:text-red-400 transition-colors"
                  style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
                {/* 댓글 */}
                <button
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
              <p className="text-sm font-semibold text-white mt-2">
                좋아요 {post.likes.toLocaleString()}개
              </p>

              {/* 캡션 */}
              <p className="text-sm text-gray-100 mt-1">
                <span className="font-semibold mr-1.5">{post.character.name}</span>
                <span className="text-gray-300">{post.caption}</span>
              </p>

              {/* 대화하기 버튼 */}
              <button
                onClick={() => navigate(`/characters/${post.character.id}`)}
                className="text-xs text-indigo-400 mt-1.5 mb-3 hover:text-indigo-300 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                대화하러 가기 →
              </button>
            </div>
          </div>
        ))}
      </div>

      {stablePosts.length === 0 && (
        <div className="text-center text-gray-500 py-20">
          <p>아직 피드가 없습니다.</p>
        </div>
      )}
    </div>
  )
}
