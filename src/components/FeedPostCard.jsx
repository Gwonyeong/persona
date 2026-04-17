import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { timeAgo } from "../lib/timeFormat";

/**
 * @param {object} props
 * @param {number} props.postId
 * @param {Array<{filePath: string}>} [props.images] - 다중 이미지 배열
 * @param {string} [props.imageUrl] - 단일 이미지 (fallback)
 * @param {string} [props.caption]
 * @param {string} props.publishAt
 * @param {string} props.characterName
 * @param {number} props.characterId
 * @param {string} [props.thumbUrl]
 * @param {boolean} props.liked
 * @param {number} props.likesCount
 * @param {boolean} [props.affinityUp]
 * @param {() => void} props.onLike
 * @param {() => void} props.onComment
 * @param {() => void} [props.onImageClick]
 * @param {boolean} [props.showChatLink]
 */
export default function FeedPostCard({
  postId,
  images,
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const allImages =
    images?.length > 0 ? images : imageUrl ? [{ filePath: imageUrl }] : [];
  const multi = allImages.length > 1;
  const [currentIdx, setCurrentIdx] = useState(0);
  const touchRef = useRef({ startX: 0, startY: 0, dx: 0, locked: null });
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const goSlide = (dir) => {
    setCurrentIdx((prev) =>
      Math.max(0, Math.min(allImages.length - 1, prev + dir)),
    );
  };

  const onTouchStart = (e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      dx: 0,
      locked: null,
    };
    setSwiping(true);
  };
  const onTouchMove = (e) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - touchRef.current.startX;
    const dy = e.touches[0].clientY - touchRef.current.startY;

    // 방향 잠금: 첫 5px 이동으로 수평/수직 결정
    if (!touchRef.current.locked) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        touchRef.current.locked = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
      return;
    }

    // 수직 스크롤이면 무시
    if (touchRef.current.locked === "v") return;

    // 수평 스와이프 — 브라우저 스크롤 방지
    e.preventDefault();
    touchRef.current.dx = dx;
    setOffsetX(dx);
  };
  const onTouchEnd = () => {
    setSwiping(false);
    if (touchRef.current.dx < -50) goSlide(1);
    else if (touchRef.current.dx > 50) goSlide(-1);
    setOffsetX(0);
    touchRef.current.locked = null;
  };

  return (
    <div id={`feed-post-${postId}`} className="border-b border-gray-800">
      {/* 포스트 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(`/characters/${characterId}`)}
          className="flex items-center gap-3 flex-1 min-w-0"
          style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={characterName}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
          <span className="font-semibold text-sm text-white truncate">
            {characterName}
          </span>
        </button>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {timeAgo(publishAt)}
        </span>
      </div>

      {/* 포스트 이미지 (슬라이드) */}
      <div
        className="aspect-[9/16] bg-gray-900 w-full relative overflow-hidden"
        onTouchStart={multi ? onTouchStart : undefined}
        onTouchMove={multi ? onTouchMove : undefined}
        onTouchEnd={multi ? onTouchEnd : undefined}
      >
        {/* 이미지 트랙 — 모든 이미지를 가로로 나열하고 translateX로 슬라이드 */}
        <div
          className="h-full flex"
          style={{
            width: `${allImages.length * 100}%`,
            transform: `translateX(calc(-${currentIdx * (100 / allImages.length)}% + ${offsetX}px))`,
            transition: swiping ? "none" : "transform 0.3s ease-out",
          }}
        >
          {allImages.map((img, i) => (
            <button
              key={i}
              onClick={() => onImageClick?.(allImages[currentIdx]?.filePath)}
              className="h-full flex-shrink-0"
              style={{
                width: `${100 / allImages.length}%`,
                outline: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <img
                src={img.filePath}
                alt={i === 0 ? caption || "" : ""}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>

        {/* 좌측 화살표 */}
        {multi && currentIdx > 0 && (
          <button
            onClick={() => goSlide(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* 우측 화살표 */}
        {multi && currentIdx < allImages.length - 1 && (
          <button
            onClick={() => goSlide(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* 도트 인디케이터 */}
        {multi && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {allImages.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentIdx ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-4">
          {/* 좋아요 */}
          <button
            onClick={onLike}
            className={`transition-colors ${liked ? "text-red-500" : "text-gray-100 hover:text-red-400"}`}
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          {/* 댓글 */}
          <button
            onClick={onComment}
            className="text-gray-100 hover:text-gray-300 transition-colors"
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {/* 공유 */}
          <button
            className="text-gray-100 hover:text-gray-300 transition-colors"
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* 좋아요 수 */}
        <div className="flex items-center gap-2 mt-2">
          <p className="text-sm font-semibold text-white">
            {t('feedPost.likes', { count: likesCount.toLocaleString() })}
          </p>
          {affinityUp && (
            <span className="text-[11px] text-pink-400">
              {t('feedPost.affinityUp')}
            </span>
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
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            {t('feedPost.goChat')}
          </button>
        )}

        <div className="mb-3" />
      </div>
    </div>
  );
}
