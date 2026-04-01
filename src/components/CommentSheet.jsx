import { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import useStore from '../store/useStore'

function getImageUrl(filePath) {
  if (!filePath) return null
  if (filePath.startsWith('http')) return filePath
  return null
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`
  return `${Math.floor(diff / 2592000)}달 전`
}

function getCharacterThumb(comment) {
  const img = comment.character?.styles?.[0]?.images?.[0]
  return img ? getImageUrl(img.filePath) : null
}

function TypingIndicator({ thumbUrl }) {
  return (
    <div className="flex gap-3 ml-12 mt-2.5">
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[10px] font-medium text-indigo-400">AI</span>
        </div>
      )}
      <div className="flex items-center gap-1 pt-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

function CommentItem({ item, isReply }) {
  if (item._typing) return <TypingIndicator thumbUrl={item._characterThumbUrl} />

  const isCharacter = !!item.characterId
  const thumb = isCharacter ? getCharacterThumb(item) : null
  const size = isReply ? 'w-8 h-8' : 'w-9 h-9'

  return (
    <div className={`flex gap-3 ${isReply ? 'ml-12 mt-2.5' : ''}`}>
      {isCharacter ? (
        thumb ? (
          <img src={thumb} alt="" className={`${size} rounded-full object-cover flex-shrink-0 mt-0.5`} />
        ) : (
          <div className={`${size} rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <span className="text-[10px] font-medium text-indigo-400">AI</span>
          </div>
        )
      ) : (
        item.user?.avatarUrl ? (
          <img src={item.user.avatarUrl} alt="" className={`${size} rounded-full object-cover flex-shrink-0 mt-0.5`} />
        ) : (
          <div className={`${size} rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[13px] font-semibold ${isCharacter ? 'text-indigo-400' : ''}`}>
            {isCharacter ? item.character?.name : (item.user?.name || '게스트')}
          </span>
          <span className="text-[11px] text-gray-500">{timeAgo(item.createdAt)}</span>
        </div>
        <p className="text-[14px] text-gray-200 mt-0.5 leading-[1.4]">{item.content}</p>
        {item._affinityChange > 0 && (
          <p className="text-[11px] text-pink-400 mt-1">호감도가 올랐어요! (+{item._affinityChange})</p>
        )}
        {item._affinityChange < 0 && (
          <p className="text-[11px] text-blue-400 mt-1">호감도가 내려갔어요... ({item._affinityChange})</p>
        )}
      </div>
    </div>
  )
}

export default function CommentSheet({ postId, characterName, characterThumbUrl, onClose }) {
  const [comments, setComments] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [replyTarget, setReplyTarget] = useState(null) // { commentIdx, lastReplyId }
  const [mounted, setMounted] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const overlayRef = useRef(null)
  const { token, user } = useStore()

  // 마운트 애니메이션 트리거
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
  }, [])

  // 바텀시트가 열려 있는 동안 배경 스크롤 방지
  useEffect(() => {
    const locked = []
    let el = overlayRef.current?.parentElement
    while (el) {
      const { overflow, overflowY } = getComputedStyle(el)
      if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
        el.dataset.prevOverflow = el.style.overflow
        el.style.overflow = 'hidden'
        locked.push(el)
      }
      el = el.parentElement
    }
    return () => locked.forEach((el) => {
      el.style.overflow = el.dataset.prevOverflow || ''
      delete el.dataset.prevOverflow
    })
  }, [])

  // 키보드 높이 감지
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const onResize = () => {
      const kbH = window.innerHeight - vv.height - vv.offsetTop
      setKeyboardHeight(kbH > 50 ? kbH : 0)
    }

    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

  useEffect(() => {
    api.get(`/feed-comments/${postId}`)
      .then(({ comments }) => setComments(comments))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

  // 답글 대상 변경 시 포커스
  useEffect(() => {
    if (replyTarget) inputRef.current?.focus()
  }, [replyTarget])

  const submit = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setSending(true)
    setInput('')

    // 낙관적 유저 댓글 (임시 ID)
    const tempId = `temp-${Date.now()}`
    const optimisticUser = {
      id: tempId,
      userId: true,
      content: text,
      createdAt: new Date().toISOString(),
      user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null,
      character: null,
    }
    // 타이핑 플레이스홀더
    const typingPlaceholder = { id: `typing-${tempId}`, _typing: true, characterId: true, _characterThumbUrl: characterThumbUrl }

    if (replyTarget) {
      const { commentIdx, lastReplyId } = replyTarget
      // 유저 답글 + 타이핑 즉시 표시
      setComments((prev) => prev.map((c, i) =>
        i === commentIdx
          ? { ...c, thread: [...c.thread, optimisticUser, typingPlaceholder] }
          : c
      ))
      setReplyTarget(null)

      try {
        const res = await api.post(
          `/feed-comments/${postId}/reply/${lastReplyId}`,
          { content: text }
        )
        const taggedCharReply = { ...res.charReply, _affinityChange: res.affinityChange || 0 }
        setComments((prev) => prev.map((c, i) =>
          i === commentIdx
            ? { ...c, thread: c.thread.filter((t) => t.id !== tempId && t.id !== typingPlaceholder.id).concat([res.userReply, taggedCharReply]) }
            : c
        ))
      } catch (error) {
        console.error('Comment error:', error)
        // 실패 시 낙관적 항목 제거
        setComments((prev) => prev.map((c, i) =>
          i === commentIdx
            ? { ...c, thread: c.thread.filter((t) => t.id !== tempId && t.id !== typingPlaceholder.id) }
            : c
        ))
      }
    } else {
      // 새 최상위 댓글 + 타이핑 즉시 표시
      setComments((prev) => [{ ...optimisticUser, thread: [typingPlaceholder] }, ...prev])
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))

      try {
        const res = await api.post(`/feed-comments/${postId}`, { content: text })
        const taggedComment = {
          ...res.comment,
          thread: res.comment.thread?.map((t) =>
            t.characterId ? { ...t, _affinityChange: res.affinityChange || 0 } : t
          ),
        }
        setComments((prev) => prev.map((c) =>
          c.id === tempId ? taggedComment : c
        ))
      } catch (error) {
        console.error('Comment error:', error)
        setComments((prev) => prev.filter((c) => c.id !== tempId))
      }
    }
    setSending(false)
  }

  const startReply = (commentIdx) => {
    const comment = comments[commentIdx]
    const thread = comment.thread || []
    const lastItem = thread.length > 0 ? thread[thread.length - 1] : null
    setReplyTarget({
      commentIdx,
      lastReplyId: lastItem ? lastItem.id : comment.id,
    })
    inputRef.current?.focus()
  }

  const cancelReply = () => {
    setReplyTarget(null)
    setInput('')
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-50 flex flex-col"
      onClick={onClose}
    >
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.3s ease-out' }}
      />

      {/* 상단 여백 (시트를 하단에 배치) */}
      <div className="flex-1 min-h-[40px]" />

      {/* 시트 + 인풋 wrapper */}
      <div
        className="relative bg-gray-900 rounded-t-xl flex flex-col"
        style={{
          maxHeight: '90%',
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 rounded-full bg-gray-600" />
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="w-6" />
            <p className="text-[15px] font-bold text-center">댓글</p>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="border-b border-gray-800" />
        </div>

        {/* 댓글 리스트 */}
        <div ref={listRef} className="flex-1 overflow-auto px-4 py-3">
          {loading && (
            <div className="text-center text-gray-500 py-16">
              <p className="text-sm">불러오는 중...</p>
            </div>
          )}
          {!loading && comments.length === 0 && (
            <div className="text-center text-gray-500 py-16">
              <p className="text-sm">아직 댓글이 없어요</p>
              <p className="text-xs text-gray-600 mt-1">댓글을 남기면 {characterName}이(가) 답해줄 거예요</p>
            </div>
          )}
          {comments.map((c, cIdx) => (
            <div key={c.id} className="mb-5">
              <CommentItem item={c} />
              {c.thread?.map((t) => (
                <CommentItem key={t.id} item={t} isReply />
              ))}
              <button
                onClick={() => startReply(cIdx)}
                className="ml-12 mt-1.5 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                답글 달기
              </button>
            </div>
          ))}
        </div>

        {/* 답글 대상 표시 */}
        {replyTarget && (
          <div className="flex-shrink-0 px-4 py-2 bg-gray-800/50 flex items-center justify-between">
            <span className="text-[12px] text-gray-400">
              {characterName}에게 답글 남기는 중
            </span>
            <button
              onClick={cancelReply}
              className="text-[12px] text-gray-500 hover:text-gray-300"
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              취소
            </button>
          </div>
        )}

        {/* 입력 영역 */}
        <div
          className="flex-shrink-0 border-t border-gray-800 px-4 py-3 flex items-center gap-3"
          style={{ paddingBottom: keyboardHeight > 0 ? 12 : 'max(20px, calc(env(safe-area-inset-bottom) + 8px))' }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }}
            placeholder={token ? (replyTarget ? `${characterName}에게 답글 달기...` : '댓글 달기...') : '로그인 후 댓글을 남길 수 있어요'}
            disabled={!token || sending}
            className="flex-1 bg-transparent text-[14px] text-gray-100 placeholder-gray-500 disabled:opacity-50"
            style={{ outline: 'none' }}
          />
          <button
            onClick={submit}
            disabled={!input.trim() || sending || !token}
            className="text-indigo-400 font-semibold text-[14px] disabled:opacity-30 transition-opacity"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {sending ? '...' : '게시'}
          </button>
        </div>

        {/* 키보드 스페이서 — 시트 안에서 댓글 리스트만 축소시킴 */}
        <div
          className="flex-shrink-0 bg-gray-900"
          style={{ height: keyboardHeight }}
        />
      </div>
    </div>
  )
}
