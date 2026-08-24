import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  CharacterRow,
  AddStyleRow,
  BackgroundsTab,
  EMOTION_TABS,
  TABS,
  NO_OUTLINE,
} from './Expressions'

// 표정 이미지 — 단일 캐릭터 상세. 목록(Expressions)에서 프로필/이름으로 진입.
// 감정 탭(SFW/NSFW/배경), 스타일 행, 업로드/영상 등 관리 UI를 이 캐릭터로 스코프해서 제공.
export default function ExpressionDetail() {
  const { characterId } = useParams()
  const [character, setCharacter] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState('sfw') // sfw | nsfw | bg
  const currentEmotions = tab === 'bg' ? [] : EMOTION_TABS[tab].emotions

  const reload = () => {
    api
      .get(`/admin/expressions-overview/${characterId}`)
      .then(({ character }) => setCharacter(character))
      .catch(() => setNotFound(true))
  }

  useEffect(() => {
    setCharacter(null)
    setNotFound(false)
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  // 같은 (styleId, emotion)에 여러 이미지 허용 — 이 캐릭터의 style 배열만 갱신.
  const patchStyle = (styleId, mapImages) => {
    setCharacter((c) => {
      if (!c) return c
      const nextStyles = (c.styles || []).map((s) =>
        s.id === styleId ? { ...s, images: mapImages(s.images) } : s,
      )
      const nextDefault =
        c.defaultStyle && c.defaultStyle.id === styleId
          ? { ...c.defaultStyle, images: mapImages(c.defaultStyle.images) }
          : c.defaultStyle
      return { ...c, styles: nextStyles, defaultStyle: nextDefault }
    })
  }
  // (characterId, styleId, image) 시그니처 — 다른 캐릭터의 호출은 무시.
  const addImage = (cid, styleId, image) => {
    if (cid !== characterId) return
    patchStyle(styleId, (imgs) => [
      ...imgs,
      {
        id: image.id,
        emotion: image.emotion,
        filePath: image.filePath,
        videoFilePath: image.videoFilePath ?? null,
      },
    ])
  }
  const removeImage = (styleId, imageId) => {
    patchStyle(styleId, (imgs) => imgs.filter((i) => i.id !== imageId))
  }
  const updateImage = (styleId, imageId, patch) => {
    patchStyle(styleId, (imgs) => imgs.map((i) => (i.id === imageId ? { ...i, ...patch } : i)))
  }

  const styles = useMemo(
    () => character?.styles || (character?.defaultStyle ? [character.defaultStyle] : []),
    [character],
  )

  if (notFound) {
    return (
      <div className="p-3 md:p-6">
        <BackLink />
        <div className="text-center text-gray-500 py-16">캐릭터를 찾을 수 없습니다.</div>
      </div>
    )
  }
  if (!character) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-3 md:p-6">
      <BackLink />

      <div className="flex items-end justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 shrink-0">
            {character.profileImage ? (
              <img src={character.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">없음</div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold">{character.name}</h2>
              {!character.isPublic && (
                <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">비공개</span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">표정 이미지 관리</p>
          </div>
        </div>

        {/* 탭: 일반 / NSFW / 배경 */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {TABS.map((def) => (
            <button
              key={def.id}
              onClick={() => setTab(def.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                tab === def.id
                  ? def.id === 'nsfw'
                    ? 'bg-pink-600 text-white'
                    : def.id === 'bg'
                      ? 'bg-amber-600 text-white'
                      : 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              style={NO_OUTLINE}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'nsfw' && (
        <div className="mb-4 bg-pink-950/30 border border-pink-800/40 rounded-xl px-4 py-3">
          <p className="text-xs text-pink-200 leading-relaxed">
            <span className="font-semibold">흥분 단계 가이드</span> — 서사 진행 순서로 배치되어 있습니다.
            도발 → 노출 → 행위 → 절정 → 여운. 각 열의 안내를 보고 캐릭터에 적합한 이미지를 업로드하세요.
            모든 슬롯을 채울 필요는 없습니다 — 캐릭터 컨셉에 맞는 단계만 채우면 AI가 자동으로 매칭합니다.
          </p>
        </div>
      )}

      {tab === 'bg' ? (
        <BackgroundsTab characterId={character.id} />
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 admin-x-scroll">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="sticky left-0 z-10 bg-gray-900 text-left text-xs font-medium text-gray-400 px-4 py-3 min-w-[180px]">
                  캐릭터
                </th>
                {currentEmotions.map((e) => (
                  <th
                    key={e.key}
                    className={`text-center text-xs font-medium text-gray-400 px-2 py-3 align-top ${e.desc ? 'min-w-[140px]' : 'min-w-[88px]'}`}
                    title={e.desc || undefined}
                  >
                    <div className="text-gray-200">{e.label}</div>
                    {e.desc && (
                      <p className="mt-1 text-[10px] text-gray-500 font-normal leading-snug whitespace-normal">{e.desc}</p>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {styles.length === 0 ? (
                <CharacterRow
                  character={character}
                  style={null}
                  isFirstStyle
                  emotions={currentEmotions}
                  onAddImage={() => {}}
                  onRemoveImage={() => {}}
                  onUpdateImage={() => {}}
                />
              ) : (
                styles.map((s, i) => (
                  <CharacterRow
                    key={s.id}
                    character={character}
                    style={s}
                    isFirstStyle={i === 0}
                    emotions={currentEmotions}
                    onAddImage={(img) => addImage(characterId, s.id, img)}
                    onRemoveImage={(imageId) => removeImage(s.id, imageId)}
                    onUpdateImage={(imageId, patch) => updateImage(s.id, imageId, patch)}
                    onStyleChanged={reload}
                  />
                ))
              )}
              <AddStyleRow
                character={character}
                colSpan={currentEmotions.length + 1}
                onAdded={reload}
              />
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/admin/expressions"
      className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-3"
      style={NO_OUTLINE}
    >
      ← 표정 이미지 목록
    </Link>
  )
}
