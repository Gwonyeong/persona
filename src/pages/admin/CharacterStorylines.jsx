import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

const PROMPT_DOC_PATH = 'server/docs/cowork-create-storyline-prompt.md'

export default function CharacterStorylines() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState(null)
  const [storylines, setStorylines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    api.get(`/admin/characters`).then(({ characters }) => {
      const found = characters.find((c) => c.id === parseInt(id))
      setCharacter(found || null)
    }).catch(() => {})
    loadStorylines()
  }, [id])

  const loadStorylines = async () => {
    setLoading(true)
    try {
      const { storylines } = await api.get(`/admin/characters/${id}/storylines`)
      setStorylines(storylines || [])
    } catch (e) {
      console.error('Load storylines failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (storylineId) => {
    if (!confirm('이 스토리를 삭제하시겠습니까? 모든 노드/선택지/유저 진행 기록이 함께 삭제됩니다.')) return
    try {
      await api.delete(`/admin/storylines/${storylineId}`)
      await loadStorylines()
    } catch (e) {
      console.error('Delete failed:', e)
      alert('삭제 실패: ' + (e?.response?.data?.error || e?.message))
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white text-sm"
          style={{ outline: 'none' }}
        >
          ←
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">스토리 관리</h2>
          {character && (
            <p className="text-sm text-gray-400 mt-0.5">{character.name}</p>
          )}
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors"
          style={{ outline: 'none' }}
        >
          + 새 스토리
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <p className="text-gray-500 text-sm">로딩 중...</p>
      ) : storylines.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-800 rounded-xl">
          <p className="text-gray-500 text-sm">아직 스토리가 없습니다.</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm"
            style={{ outline: 'none' }}
          >
            첫 스토리 만들기 →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {storylines.map((s) => (
            <div
              key={s.id}
              className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden"
            >
              {/* 9:16 썸네일 */}
              <button
                onClick={() => navigate(`/admin/storylines/${s.id}`)}
                className="block w-full aspect-[9/16] relative bg-gray-800 hover:opacity-90 transition-opacity"
                style={{ outline: 'none' }}
              >
                {(s.thumbnailImage || s.coverImage) ? (
                  <img
                    src={s.thumbnailImage || s.coverImage}
                    alt={s.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
                    썸네일 없음
                  </div>
                )}
                {/* 상태 뱃지 */}
                <div
                  className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    s.status === 'PUBLISHED'
                      ? 'bg-emerald-600/90 text-white'
                      : 'bg-gray-700/90 text-gray-200'
                  }`}
                >
                  {s.status}
                </div>
              </button>

              {/* 정보 */}
              <div className="p-3">
                <p className="font-semibold text-sm text-gray-100 line-clamp-1">{s.title}</p>
                <p className="text-xs text-gray-500 mt-1">노드 {s.nodeCount}개</p>
                <div className="mt-3 flex gap-1.5">
                  <button
                    onClick={() => navigate(`/admin/storylines/${s.id}`)}
                    className="flex-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded transition-colors"
                    style={{ outline: 'none' }}
                  >
                    편집
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="px-2 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs rounded transition-colors"
                    style={{ outline: 'none' }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 새 스토리 모달 */}
      {showNewModal && (
        <NewStorylineModal
          characterId={parseInt(id)}
          characterName={character?.name}
          onClose={() => setShowNewModal(false)}
          onCreated={(storylineId) => {
            setShowNewModal(false)
            navigate(`/admin/storylines/${storylineId}`)
          }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 새 스토리 생성 모달 — 3가지 모드 (AI / JSON / 빈 스토리)
// ──────────────────────────────────────────────────────────────
function NewStorylineModal({ characterId, characterName, onClose, onCreated }) {
  const [mode, setMode] = useState('ai') // 'ai' | 'json' | 'empty'
  const [seedIdea, setSeedIdea] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [emptyTitle, setEmptyTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    try {
      let body
      if (mode === 'json' || mode === 'ai') {
        try {
          body = JSON.parse(jsonText)
        } catch (e) {
          throw new Error('JSON 파싱 실패: ' + e.message)
        }
      } else {
        // empty
        if (!emptyTitle.trim()) throw new Error('제목을 입력해 주세요.')
        body = {
          title: emptyTitle.trim(),
          status: 'DRAFT',
          nodes: [
            {
              nodeType: 'CHAPTER',
              script: [
                { mode: 'narration', text: '여기에 첫 장면을 작성하세요.' },
              ],
            },
            {
              nodeType: 'RESULT',
              resultTitle: '끝',
              resultBody: '여기에 결말을 작성하세요.',
            },
          ],
        }
      }
      const res = await api.post(`/admin/characters/${characterId}/storylines`, body)
      onCreated(res.storyline.id)
    } catch (e) {
      console.error(e)
      setError(e?.response?.data?.error || e?.message || '생성 실패')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">새 스토리</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white" style={{ outline: 'none' }}>✕</button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-800">
          {[
            { key: 'ai', label: 'AI 생성' },
            { key: 'json', label: 'JSON 직접 입력' },
            { key: 'empty', label: '빈 스토리' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`flex-1 py-2.5 text-sm transition-colors ${
                mode === t.key
                  ? 'bg-gray-800 text-white border-b-2 border-indigo-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              style={{ outline: 'none' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-auto flex-1">
          {mode === 'ai' && (
            <AiMode
              characterId={characterId}
              characterName={characterName}
              seedIdea={seedIdea}
              setSeedIdea={setSeedIdea}
              jsonText={jsonText}
              setJsonText={setJsonText}
            />
          )}
          {mode === 'json' && (
            <div>
              <p className="text-xs text-gray-400 mb-2">
                전체 storyline JSON을 붙여넣으세요. 스키마는 <code className="text-indigo-400">{PROMPT_DOC_PATH}</code> 참조.
              </p>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{ "title": "...", "nodes": [...] }'
                rows={16}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}
          {mode === 'empty' && (
            <div>
              <p className="text-xs text-gray-400 mb-2">
                제목만 입력하면 CHAPTER 1개 + RESULT 1개의 초안이 생성됩니다. 편집 페이지에서 노드를 추가하세요.
              </p>
              <input
                value={emptyTitle}
                onChange={(e) => setEmptyTitle(e.target.value)}
                placeholder="스토리 제목"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-5 border-t border-gray-800 flex items-center justify-between gap-3">
          {error ? (
            <p className="text-xs text-red-400 flex-1 line-clamp-2">{error}</p>
          ) : (
            <span className="flex-1" />
          )}
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors disabled:opacity-50"
            style={{ outline: 'none' }}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ outline: 'none' }}
          >
            {submitting ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// AI 모드 — 캐릭터 정보 + 시드 아이디어로 프롬프트 빌드 → 복사 → AI 결과 JSON 붙여넣기
function AiMode({ characterId, characterName, seedIdea, setSeedIdea, jsonText, setJsonText }) {
  const buildPrompt = () => {
    return `당신은 비주얼 노벨식 스토리 콘텐츠를 JSON으로 작성하는 전문 작가입니다.

[캐릭터]
characterId: ${characterId}${characterName ? ` (이름: ${characterName})` : ''}
※ GET /api/cowork/characters 를 호출해 위 ID에 해당하는 캐릭터의
  personality, concept, firstMessage, tags 등을 확인하고 말투/성격을 스토리에 반영하세요.

[시드 아이디어 / 분량]
${seedIdea || '(여기에 운영자가 시드 아이디어를 작성)'}

[출력 규칙]
- 단일 JSON 객체만 출력 (마크다운/주석 금지).
- 스키마/가이드라인 전체는 server/docs/cowork-create-storyline-prompt.md 참조.
- 미디어 URL은 운영자가 별도로 제공한 것만 사용. 임의 생성 금지.
- 응답 JSON에 characterId 키를 넣지 마세요 (URL 파라미터로 처리됨).

[Chapter / Chat 모델 핵심]
- nodeType은 "CHAPTER" / "CHAT" / "RESULT" 세 가지.
  * CHAPTER: 비주얼 노벨 UI (배경+캐릭터 일러스트+하단 텍스트 박스). 분위기·내레이션·VN식 짧은 멘트.
  * CHAT: 채팅 UI (다크 그레이+누적 채팅 버블+아바타). 캐릭터와의 1:1 대화 흐름.
  * RESULT: 엔딩 페이지 (resultTitle/resultBody).
- CHAPTER와 CHAT은 동일한 script 스키마를 공유. mode = narration / character / user / cg / media.
  * CHAPTER에서 character/user는 텍스트 박스에 좌/우측 화자 뱃지로, narration은 일반 박스로 표시.
  * CHAT에서 character는 좌측 채팅 버블, user는 화면 하단 "보내기" 버튼(유저가 탭해야 채팅 추가됨), narration은 가운데 회색 시스템 메시지(드물게 사용).
  * **mode:"media" — CHAT 전용**. 캐릭터가 채팅에 보내는 이미지/영상 카드. 필드: mediaUrl(필수), variant("normal"|"premium"|"video", 필수), maskCost(premium일 때 양수 필수). normal=일반 노출 / premium=블러+자물쇠+해금 모달 / video=자동재생 영상.
- 선택지(choices)는 CHAPTER/CHAT 끝에서 등장. 각 선택지는 branchNodes로 분기 노드를 가질 수 있음 (CHAPTER/CHAT 혼합 가능).
- CHAT 노드의 선택지는 클릭 후 그 label이 자동으로 유저 채팅 버블이 되어 히스토리에 남음 — 분기 CHAT 첫 아이템에 같은 user 라인을 굳이 넣지 않아도 됨.
- script 아이템의 backgroundImage / characterImage / bgmUrl / bgsUrl 은 sticky (다음 변경 시까지 유지). CHAT 노드에서는 시각적으로 노출되지 않지만 상태는 유지됨.
- voiceUrl 은 해당 아이템 진입 시 1회 재생.
- 컬렉터블 이미지는 storyline.images 배열에 따로 등록 (tempId/url/title/unlockType).
  선택지의 unlockStoryImageIds 로 어떤 이미지가 어떤 선택지로 해금되는지 매핑.

[필수 출력 키]
{
  "title": string,
  "thumbnailImage"?: url,
  "coverImage"?: url,
  "defaultBgm"?: url,
  "status": "PUBLISHED",
  "images"?: [{ tempId: string, url: url, title?: string, description?: string, unlockType: "ALWAYS"|"CHOICE"|"ENDING"|"PLAY_ANY" }],
  "nodes": [
    { "nodeType": "CHAPTER", "script": [...], "choices"?: [...] },
    { "nodeType": "CHAT", "script": [...], "choices"?: [...] },
    ...
    { "nodeType": "RESULT", "resultTitle": string, "resultBody": string }
  ]
}

이제 위 시드와 캐릭터 정보를 바탕으로 storyline JSON을 출력하세요.`
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt())
      alert('프롬프트가 클립보드에 복사됐습니다.')
    } catch {
      alert('복사 실패. 텍스트를 수동으로 선택해 복사해 주세요.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">시드 아이디어 / 분량 요청</label>
        <textarea
          value={seedIdea}
          onChange={(e) => setSeedIdea(e.target.value)}
          rows={4}
          placeholder={`예) 비 오는 새벽 편의점에서의 첫 만남.\n메인 16노드, PREMIUM 선택지 1개(5마스크), 일반 선택지 2개.`}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <button
          onClick={copyPrompt}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-indigo-500 text-gray-200 rounded-lg text-sm transition-colors"
          style={{ outline: 'none' }}
        >
          📋 프롬프트 클립보드 복사 → AI에 붙여넣기
        </button>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
          복사된 프롬프트를 Claude/ChatGPT에 붙여넣으면 storyline JSON을 생성해줍니다. 결과 JSON을 아래에 붙여넣으세요.
        </p>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">AI가 생성한 JSON</label>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={10}
          placeholder='{ "title": "...", "nodes": [...] }'
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-200 focus:border-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  )
}
