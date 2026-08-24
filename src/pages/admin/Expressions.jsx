import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import JSZip from 'jszip'
import { api } from '../../lib/api'
import { removeChromaBackground } from '../../lib/removeChromaBackground'
import StyleAcquisitionStats from './StyleAcquisitionStats'
import StyleReleaseCalendar from './StyleReleaseCalendar'

export const NO_OUTLINE = { outline: 'none', WebkitTapHighlightColor: 'transparent' }

// ISO 문자열 → <input type="datetime-local"> 로컬 값(YYYY-MM-DDTHH:mm)
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// 예약 배지에 쓰는 짧은 날짜 표기 (예: 8/10 21:00)
export function formatScheduleShort(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── 스타일 출시 예약 슬롯 (1일 1스타일, 캐릭터 관리의 출시 예약과 동일한 규약) ──
// 기본 공개 시각 18:00 KST. 이미 예약된 날짜를 피해 내일(KST)부터 가장 빠른 빈 슬롯을 찾는다.
const STYLE_RELEASE_HOUR_KST = 18

// UTC Date → KST 달력 day key 'YYYY-MM-DD'
function kstDayKey(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// occupiedKeys(Set<'YYYY-MM-DD'>)를 피해 가장 빠른 빈 슬롯. 반환 { n(며칠 뒤), iso(공개 예약 UTC ISO) }
function findEarliestStyleSlot(occupiedKeys) {
  const kn = new Date(Date.now() + 9 * 60 * 60 * 1000) // UTC 필드 = KST 벽시계
  const ty = kn.getUTCFullYear(), tm = kn.getUTCMonth(), td = kn.getUTCDate()
  for (let offset = 1; offset < 3650; offset++) {
    const cand = new Date(Date.UTC(ty, tm, td + offset))
    const key = cand.toISOString().slice(0, 10)
    if (!occupiedKeys.has(key)) {
      const releaseMs = Date.UTC(cand.getUTCFullYear(), cand.getUTCMonth(), cand.getUTCDate(), STYLE_RELEASE_HOUR_KST - 9, 0, 0)
      return { n: offset, iso: new Date(releaseMs).toISOString() }
    }
  }
  return { n: 1, iso: null }
}

// 예약 버튼 툴팁용 — KST 전체 표기
export function formatKstDateFull(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

// 최근 스타일 추가 시각 → 경과 일수. 없거나 잘못된 값이면 null.
function daysSince(dateStr) {
  if (!dateStr) return null
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return null
  return Math.floor((Date.now() - then.getTime()) / 86400000)
}

// 경과 일수 → "오늘 / n일 전" 라벨.
function relativeDaysLabel(days) {
  if (days == null) return null
  return days <= 0 ? '오늘' : `${days}일 전`
}

// KST 달력일 인덱스 (자정 경계). 예약 출시까지 남은 "n일 후" 계산용.
function kstDayIndex(dateLike) {
  const t = new Date(dateLike).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t + 9 * 60 * 60 * 1000) / 86400000)
}

// 예약 출시 시각 → "오늘 출시 / n일 후 출시" 라벨. 없으면 null.
function scheduledLabel(iso) {
  if (!iso) return null
  const a = kstDayIndex(iso)
  const b = kstDayIndex(Date.now())
  if (a == null || b == null) return null
  const diff = a - b
  return diff <= 0 ? '오늘 출시' : `${diff}일 후 출시`
}

// 표정 sprite 미디어 — 비디오(mp4/webm/...)는 자동재생/루프/음소거로 미리보기.
// 채팅 출력 시에도 동일하게 음소거로 재생됨.
function isVideoUrl(url) {
  if (!url || typeof url !== 'string') return false
  const clean = url.split('?')[0].toLowerCase()
  return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v')
}
function ExpressionThumb({ src, className = '' }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return <img src={src} alt="" className={className} loading="lazy" />
}

// 로컬 영상 File에서 0프레임(첫 프레임) 썸네일을 JPEG Blob으로 추출.
// 로컬 blob URL이라 CORS 문제 없음. 서버 ffmpeg 불필요 (브라우저 canvas 사용).
function extractFirstFrameBlob(file) {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    let settled = false
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      fn(arg)
    }
    const capture = () => {
      try {
        const w = v.videoWidth || 720
        const h = v.videoHeight || 1280
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(v, 0, 0, w, h)
        canvas.toBlob(
          (blob) => (blob ? finish(resolve, blob) : finish(reject, new Error('썸네일 캡처 실패'))),
          'image/jpeg',
          0.92,
        )
      } catch (err) {
        finish(reject, err)
      }
    }
    v.addEventListener('seeked', capture, { once: true })
    v.addEventListener('error', () => finish(reject, new Error('영상 디코딩 실패')), { once: true })
    v.addEventListener(
      'loadeddata',
      () => {
        // 첫 프레임으로 seek해 seeked에서 캡처. 이미 0이라 이벤트 미발생 시 대비해 살짝 이동.
        try {
          v.currentTime = Math.min(0.04, Math.max(0, (v.duration || 1) - 0.01))
        } catch {
          capture()
        }
      },
      { once: true },
    )
    v.src = url
  })
}

// 서버 buildExpressionPrompt의 디폴트 구도 문구와 일치시킨다.
const DEFAULT_COMPOSITION_KO = '정면(eye-level) 상반신 포트레이트, 인물 중앙 정렬, 레퍼런스와 동일한 크롭·조명'

// 일반 표정 (Safety Mode ON에서도 노출)
const SFW_EMOTIONS = [
  { key: 'NEUTRAL', label: '기본' },
  { key: 'HAPPY', label: '웃음' },
  { key: 'ANGRY', label: '화남' },
  { key: 'SAD', label: '슬픔' },
  { key: 'SHY', label: '설렘' },
]

// 흥분 표정 (NSFW) — 성인 인증 + Safety Mode OFF 유저에게만 출력
// desc는 운영자가 어떤 컨셉의 이미지를 업로드해야 하는지 안내.
const NSFW_EMOTIONS = [
  { key: 'AROUSED_TEASE', label: '도발', desc: '옷 흐트러짐 · 살짝 노출 (어깨·허벅지·속옷 비침) · 도발적 미소' },
  { key: 'AROUSED_TOPLESS', label: '상의 노출', desc: '가슴 노출, 하의는 착용한 상태' },
  { key: 'AROUSED_NUDE', label: '전라', desc: '완전 노출 · 행위 전 정지 포즈' },
  { key: 'AROUSED_FOREPLAY', label: '애무', desc: '키스 · 터치 · 구강 등 전희 단계' },
  { key: 'AROUSED_INSERT', label: '삽입', desc: '결합 컷 · 정상위 권장 (가장 범용)' },
  { key: 'AROUSED_INSERT_ALT', label: '삽입(체위2)', desc: '후배위 / 기승위 등 변형 체위' },
  { key: 'AROUSED_CLIMAX', label: '절정', desc: '정점 순간 · 눈물 그렁 · 입 벌어짐 · 무방비 표정' },
  { key: 'AROUSED_AFTERGLOW', label: '여운', desc: '마무리 · 나른함 · 풀린 표정 · 절정 후 정적' },
]

export const EMOTION_TABS = {
  sfw: { label: '일반', emotions: SFW_EMOTIONS },
  nsfw: { label: '흥분 (NSFW)', emotions: NSFW_EMOTIONS },
}

// 'bg'는 emotions를 안 쓰고 별도 컴포넌트로 렌더링.
export const TABS = [
  { id: 'sfw', label: '일반' },
  { id: 'nsfw', label: '흥분 (NSFW)' },
  { id: 'bg', label: '배경' },
]

export default function Expressions() {
  const [characters, setCharacters] = useState(null)
  const [tab, setTab] = useState('manage') // manage(이미지 관리) | calendar(출시 캘린더) | stats(획득 통계)
  const [visibility, setVisibility] = useState('public') // public | private
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('name') // name | recent

  useEffect(() => {
    api.get('/admin/expressions-characters').then(({ characters }) => setCharacters(characters || []))
  }, [])

  // 공개/비공개 분할 → 이름 검색 → 정렬(이름순 / 최근 스타일 출시일순).
  const scoped = useMemo(() => {
    if (!characters) return []
    const q = query.trim().toLowerCase()
    const list = characters
      .filter((c) => (visibility === 'public' ? c.isPublic : !c.isPublic))
      .filter((c) => !q || (c.name || '').toLowerCase().includes(q))
    if (sortBy === 'recent') {
      // 최근 출시(스타일 추가)가 위로. latestStyleAt 없는 캐릭터는 맨 아래.
      return [...list].sort((a, b) => {
        const ta = a.latestStyleAt ? new Date(a.latestStyleAt).getTime() : -Infinity
        const tb = b.latestStyleAt ? new Date(b.latestStyleAt).getTime() : -Infinity
        if (tb !== ta) return tb - ta
        return (a.name || '').localeCompare(b.name || '', 'ko')
      })
    }
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
  }, [characters, visibility, query, sortBy])

  if (!characters) return <div className="p-6 text-gray-400">로딩 중...</div>

  return (
    <div className="p-3 md:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold">표정 이미지</h2>
        <p className="text-sm text-gray-400 mt-1">
          캐릭터를 선택해 표정 이미지를 관리하세요 · 총 {characters.length}명
        </p>
      </div>

      {/* 최상위 탭: 이미지 관리 / 획득 통계 */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {[
          { key: 'manage', label: '이미지 관리' },
          { key: 'calendar', label: '출시 캘린더' },
          { key: 'stats', label: '획득 통계' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
            style={NO_OUTLINE}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' ? (
        <StyleAcquisitionStats embedded />
      ) : tab === 'calendar' ? (
        <StyleReleaseCalendar />
      ) : (
      <>
      {/* 공개/비공개 탭 */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {[
          { key: 'public', label: '공개' },
          { key: 'private', label: '비공개' },
        ].map((v) => {
          const count = characters.filter((c) => (v.key === 'public' ? c.isPublic : !c.isPublic)).length
          return (
            <button
              key={v.key}
              onClick={() => setVisibility(v.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                visibility === v.key
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
              style={NO_OUTLINE}
            >
              {v.label} ({count})
            </button>
          )
        })}
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름으로 검색"
          className="flex-1 min-w-0 bg-gray-800 text-sm text-white placeholder-gray-500 rounded-lg px-3 py-2 border border-gray-700 focus:border-indigo-500"
          style={NO_OUTLINE}
        />
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1 shrink-0">
          {[
            { key: 'name', label: '이름순' },
            { key: 'recent', label: '최근 출시순' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                sortBy === s.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              style={NO_OUTLINE}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {scoped.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          {query.trim() ? '검색 결과가 없습니다.' : '표시할 캐릭터가 없습니다.'}
        </div>
      ) : (
        <div
          className="grid gap-x-3 gap-y-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}
        >
          {scoped.map((c) => (
            <Link
              key={c.id}
              to={`/admin/expressions/${c.id}`}
              className="group flex flex-col items-center gap-1.5"
              style={NO_OUTLINE}
              title={
                c.nextScheduledAt
                  ? `${c.name} · ${scheduledLabel(c.nextScheduledAt)} (${formatKstDateFull(c.nextScheduledAt)})`
                  : c.styleCount === 0
                    ? `${c.name} · 스타일 없음`
                    : c.name
              }
            >
              <div
                className={`w-14 h-14 rounded-full overflow-hidden bg-gray-800 transition-transform group-hover:scale-105 ${
                  c.nextScheduledAt
                    ? 'ring-2 ring-emerald-500'
                    : c.styleCount === 0
                      ? 'ring-2 ring-rose-500/70'
                      : ''
                }`}
              >
                {c.profileImage ? (
                  <img src={c.profileImage} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-[9px]">없음</div>
                )}
              </div>
              <div className="w-full">
                <p className="text-[11px] text-gray-300 group-hover:text-white text-center truncate leading-tight">
                  {c.name}
                </p>
                {(() => {
                  // 출시 예약 스타일이 있으면 "n일 후 출시"(초록)를 우선 표시.
                  const schedLabel = scheduledLabel(c.nextScheduledAt)
                  if (schedLabel) {
                    return (
                      <p className="text-[9px] text-center truncate leading-tight mt-0.5 text-emerald-400 font-medium">
                        {schedLabel}
                      </p>
                    )
                  }
                  const days = daysSince(c.latestStyleAt)
                  const label = relativeDaysLabel(days)
                  if (!label) return null
                  // 출시(최근 스타일 추가)된 지 20일 초과면 빨간색으로 강조.
                  const stale = days != null && days > 20
                  return (
                    <p
                      className={`text-[9px] text-center truncate leading-tight mt-0.5 ${
                        stale ? 'text-red-500' : 'text-gray-500'
                      }`}
                    >
                      {label}
                    </p>
                  )
                })()}
              </div>
            </Link>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}

export function AddStyleRow({ character, colSpan, onAdded }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unlockMode, setUnlockMode] = useState('DEFAULT')
  const [maskCost, setMaskCost] = useState('')
  const [adultOnly, setAdultOnly] = useState(false)
  // 출시 예약 슬롯 — 다른 예약 대기 스타일이 점유한 KST 날짜 집합. null=로딩 전.
  // 캐릭터 관리의 '1일 1캐릭터'와 동일하게, 스타일도 1일 1개만 예약(가장 빠른 빈 날짜 18시 KST).
  const [occupiedKeys, setOccupiedKeys] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadSlots = () => {
    api
      .get('/admin/scheduled-styles')
      .then(({ items }) => {
        setOccupiedKeys(
          new Set(
            (items || [])
              .filter((it) => it.status === 'scheduled' && it.scheduledPublishAt)
              .map((it) => kstDayKey(new Date(it.scheduledPublishAt))),
          ),
        )
      })
      .catch(() => setOccupiedKeys(new Set()))
  }

  useEffect(() => {
    if (open && occupiedKeys === null) loadSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const earliestSlot = occupiedKeys ? findEarliestStyleSlot(occupiedKeys) : null

  // scheduledIso=null → 즉시 공개, 값 있으면 그 시각에 예약(숨김 등록)
  const submit = async (scheduledIso = null) => {
    if (!name.trim()) return
    if (unlockMode === 'SHOP' && !(parseInt(maskCost) > 0)) {
      alert('상점 구매 스타일은 마스크 가격(1 이상)을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      await api.post(`/admin/characters/${character.id}/styles`, {
        name: name.trim(),
        description: '',
        unlockMode,
        ...(unlockMode === 'SHOP' ? { maskCost: parseInt(maskCost) } : {}),
        adultOnly,
        ...(scheduledIso ? { scheduledPublishAt: scheduledIso } : {}),
      })
      setName('')
      setUnlockMode('DEFAULT')
      setMaskCost('')
      setAdultOnly(false)
      if (scheduledIso) {
        // 방금 예약한 날짜를 점유 처리 → 다음 슬롯이 자동으로 하루 밀림 (연속 예약 편의)
        setOccupiedKeys((prev) => new Set(prev || []).add(kstDayKey(new Date(scheduledIso))))
      } else {
        setOpen(false)
      }
      onAdded?.()
    } catch (err) {
      alert('스타일 추가 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="border-b border-gray-800/60 bg-gray-950/40">
      <td colSpan={colSpan} className="sticky left-0 z-10 bg-gray-950/40 px-4 py-2">
        {open ? (
          <div className="flex items-center gap-2 pl-11">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(null)
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="새 스타일명 (예: 교복, 비키니)"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-48"
            />
            <select
              value={unlockMode}
              onChange={(e) => setUnlockMode(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
              style={NO_OUTLINE}
            >
              <option value="DEFAULT">기본 (대화 해금)</option>
              <option value="GACHA">가챠 전용</option>
              <option value="SHOP">상점 구매</option>
            </select>
            {unlockMode === 'SHOP' && (
              <input
                type="number"
                min="1"
                value={maskCost}
                onChange={(e) => setMaskCost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(null) }}
                placeholder="마스크 가격"
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-24"
                style={NO_OUTLINE}
              />
            )}
            <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer select-none" style={NO_OUTLINE}>
              <input
                type="checkbox"
                checked={adultOnly}
                onChange={(e) => setAdultOnly(e.target.checked)}
                className="accent-rose-500"
              />
              19+
            </label>
            <button
              onClick={() => submit(null)}
              disabled={saving || !name.trim()}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
              style={NO_OUTLINE}
              title="즉시 공개로 추가"
            >
              추가
            </button>
            <button
              onClick={() => earliestSlot?.iso && submit(earliestSlot.iso)}
              disabled={saving || !name.trim() || !earliestSlot?.iso}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded disabled:opacity-50 whitespace-nowrap"
              style={NO_OUTLINE}
              title={earliestSlot?.iso ? `${formatKstDateFull(earliestSlot.iso)} 공개 예약 (1일 1스타일)` : '예약 슬롯 계산 중...'}
            >
              🗓️ {occupiedKeys === null ? '예약 추가' : `${earliestSlot.n}일 뒤 예약`}
            </button>
            <button
              onClick={() => {
                setOpen(false)
                setName('')
              }}
              className="text-xs text-gray-400 hover:text-white"
              style={NO_OUTLINE}
            >
              취소
            </button>
          </div>
        ) : null}
        {open && (
          <p className="pl-11 mt-1.5 text-[10px] text-gray-500">
            <span className="text-gray-400">추가</span> = 즉시 공개 · <span className="text-purple-300">🗓️ 예약</span> = 1일 1스타일, 예약 가능한 가장 빠른 날(18시 KST)에 자동 공개
            {earliestSlot?.iso && <> · 다음 슬롯 <span className="text-purple-300">{formatKstDateFull(earliestSlot.iso)}</span></>}
          </p>
        )}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="pl-11 text-[11px] text-gray-500 hover:text-indigo-300"
            style={NO_OUTLINE}
          >
            + 이 캐릭터에 스타일 추가
          </button>
        )}
      </td>
    </tr>
  )
}

export function CharacterRow({ character, style, isFirstStyle = true, emotions, onAddImage, onRemoveImage, onUpdateImage, onStyleChanged }) {
  const [editOpen, setEditOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  // 한 emotion에 여러 이미지 가능 — 배열로 그룹화.
  const imagesByEmotion = useMemo(() => {
    const map = {}
    if (style) for (const img of style.images) {
      if (!map[img.emotion]) map[img.emotion] = []
      map[img.emotion].push(img)
    }
    return map
  }, [style])

  return (
    <>
      <tr className={`${isFirstStyle ? 'border-t-2 border-gray-700/80' : ''} border-b border-gray-800/60`}>
        <td className="sticky left-0 z-10 bg-gray-900 px-4 py-3 min-w-[200px]">
          <div className="flex items-start gap-3">
            {isFirstStyle ? (
              character.profileImage ? (
                <img src={character.profileImage} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-800 flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-800 flex-shrink-0" />
              )
            ) : (
              <div className="w-8 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              {isFirstStyle && (
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-white truncate">{character.name}</p>
                  {!character.isPublic && (
                    <span className="text-[10px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded">비공개</span>
                  )}
                </div>
              )}
              {style ? (
                <>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] text-gray-300 truncate">{style.name}</p>
                    {style.unlockMode === 'GACHA' && (
                      <span className="text-[9px] bg-fuchsia-900/60 text-fuchsia-300 px-1 py-0.5 rounded font-semibold">
                        GACHA
                      </span>
                    )}
                    {style.unlockMode === 'SHOP' && (
                      <span className="text-[9px] bg-amber-900/60 text-amber-300 px-1 py-0.5 rounded font-semibold">
                        상점 {style.maskCost ? `${style.maskCost}` : '?'}
                      </span>
                    )}
                    {style.unlockMode === 'SHOP' && style.shopActive === false && (
                      <span className="text-[9px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded font-semibold">
                        비공개
                      </span>
                    )}
                    {style.adultOnly && (
                      <span className="text-[9px] bg-rose-900/60 text-rose-300 px-1 py-0.5 rounded font-semibold">
                        19+
                      </span>
                    )}
                    {style.isPublic === false && style.scheduledPublishAt && (
                      <span className="text-[9px] bg-sky-900/60 text-sky-300 px-1 py-0.5 rounded font-semibold whitespace-nowrap" title={`출시 예약: ${new Date(style.scheduledPublishAt).toLocaleString('ko-KR')}`}>
                        ⏳ {formatScheduleShort(style.scheduledPublishAt)}
                      </span>
                    )}
                    {style.isPublic === false && !style.scheduledPublishAt && (
                      <span className="text-[9px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded font-semibold" title="숨김 — 예약 미설정. 편집에서 공개하거나 예약하세요.">
                        숨김
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => setBulkOpen(true)}
                      className="text-[10px] text-emerald-300 hover:text-emerald-200"
                      style={NO_OUTLINE}
                      title="영상 여러 개를 한 번에 올려 Gemini가 감정별로 자동 분류"
                    >
                      🎬 영상 일괄
                    </button>
                    <button
                      onClick={() => setEditOpen(true)}
                      className="text-[10px] text-gray-300 hover:text-white"
                      style={NO_OUTLINE}
                      title="스타일 수정/삭제"
                    >
                      ⚙ 편집
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-500 mt-0.5">스타일 없음 (아래에서 추가)</p>
              )}
            </div>
          </div>
        </td>

        {emotions.map((e) => (
          <td key={e.key} className="px-2 py-3 text-center">
            {style ? (
              <EmotionCell
                characterId={character.id}
                styleId={style.id}
                emotion={e.key}
                emotionLabel={e.label}
                images={imagesByEmotion[e.key] || []}
                allStyleImages={style.images || []}
                onAdd={onAddImage}
                onRemove={onRemoveImage}
                onUpdate={onUpdateImage}
              />
            ) : (
              <div className="w-16 h-16 mx-auto rounded-md bg-gray-800/40 border border-dashed border-gray-700/50" />
            )}
          </td>
        ))}
      </tr>

      {editOpen && style && createPortal(
        <StyleEditModal
          style={style}
          onClose={() => setEditOpen(false)}
          onChanged={() => { setEditOpen(false); onStyleChanged?.() }}
        />,
        document.body,
      )}

      {bulkOpen && style && createPortal(
        <BulkEmotionVideoModal
          styleId={style.id}
          styleName={style.name}
          characterName={character.name}
          onClose={() => setBulkOpen(false)}
          onDone={onStyleChanged}
        />,
        document.body,
      )}
    </>
  )
}

// 진행 상태 점 — pending(회색)/processing(주황 점멸)/done(초록)/error(빨강).
function StatusDot({ status }) {
  const cls = {
    pending: 'bg-gray-600',
    processing: 'bg-amber-400 animate-pulse',
    done: 'bg-emerald-400',
    error: 'bg-rose-500',
  }[status] || 'bg-gray-600'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${cls}`} />
}

// 감정 영상 일괄 업로드 모달 — 영상 여러 개를 드래그(또는 선택)해 한 번에 올리면
// 서버가 각 영상의 0/중간/끝 프레임을 Gemini로 읽어 감정별 슬롯에 자동 배치한다.
// 영상을 1개씩 순차 전송하며 파일별 진행 상황(대기→분류 중→완료/실패)을 실시간 표시.
// 완전 자동 커밋: 결과가 바로 반영되며, 오분류는 표에서 개별 수정.
function BulkEmotionVideoModal({ styleId, styleName, characterName, onClose, onDone }) {
  const EMO_LABEL = useMemo(
    () => Object.fromEntries([...SFW_EMOTIONS, ...NSFW_EMOTIONS].map((e) => [e.key, e.label])),
    [],
  )
  const [scope, setScope] = useState('nsfw') // sfw | nsfw — Gemini 분류 후보 범위
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [items, setItems] = useState([]) // 진행 상황: [{name, status, emotion, confidence, error}]
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const doneCount = items.filter((it) => it.status === 'done' || it.status === 'error').length

  const addFiles = (list) => {
    if (running) return
    const vids = Array.from(list || []).filter((f) => (f.type || '').startsWith('video/'))
    if (!vids.length) return
    // 이전 배치가 끝난 상태에서 새 파일을 추가하면 새 배치로 리셋.
    if (started) { setStarted(false); setItems([]) }
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}_${f.size}`))
      return [...prev, ...vids.filter((f) => !seen.has(`${f.name}_${f.size}`))]
    })
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer?.files)
  }

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  // 영상을 1개씩 순차 전송하며 파일별 진행 상황을 실시간 갱신.
  const submit = async () => {
    if (!files.length || running) return
    setRunning(true)
    setStarted(true)
    setError('')
    setItems(files.map((f) => ({ name: f.name, status: 'pending', emotion: null, confidence: null, error: null })))

    let anyDone = false
    const mark = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

    for (let i = 0; i < files.length; i++) {
      mark(i, { status: 'processing' })
      try {
        const fd = new FormData()
        fd.append('tab', scope)
        fd.append('videos', files[i], files[i].name)
        const res = await api.post(`/admin/styles/${styleId}/emotion-videos/bulk`, fd)
        const r = res.results?.[0]
        const er = res.errors?.[0]
        if (r) {
          anyDone = true
          mark(i, { status: 'done', emotion: r.emotion, confidence: r.confidence })
        } else {
          mark(i, { status: 'error', error: er?.error || '분류 실패' })
        }
      } catch (e) {
        mark(i, { status: 'error', error: e?.message || '업로드 실패' })
      }
    }

    setRunning(false)
    if (anyDone) onDone?.()
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div
        className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-white mb-1">🎬 감정 영상 일괄 업로드</h3>
        <p className="text-[11px] text-gray-400 mb-4">
          {characterName} · {styleName} — 영상을 여러 개 올리면 Gemini가 0/중간/끝 프레임을 읽어 감정별로 자동 분류합니다.
        </p>

        {/* 분류 범위 */}
        <div className="mb-3">
          <label className="block text-[11px] text-gray-400 mb-1">분류 범위</label>
          <div className="flex gap-2">
            {[
              { key: 'nsfw', label: '흥분 (NSFW 8종)' },
              { key: 'sfw', label: '일반 (SFW 5종)' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                disabled={started}
                className={`px-3 py-1.5 text-xs rounded-md ${
                  scope === s.key ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                style={NO_OUTLINE}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 드롭존 */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${
            dragOver ? 'border-emerald-400 bg-emerald-500/10' : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <p className="text-xs text-gray-300">영상(mp4/webm)을 여기로 드래그하거나 클릭해서 선택</p>
          <p className="text-[10px] text-gray-500 mt-1">여러 개 한 번에 · 개당 최대 20MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/webm"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {/* 선택된 파일 목록 (시작 전) */}
        {!started && files.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {files.map((f, i) => (
              <div key={`${f.name}_${i}`} className="flex items-center justify-between text-[11px] text-gray-300 bg-gray-800/60 rounded px-2 py-1">
                <span className="truncate">{f.name}</span>
                <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-rose-300 ml-2" style={NO_OUTLINE}>✕</button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {/* 진행 상황 (시작 후) */}
        {started && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-300">
                {running ? '분류·업로드 중…' : '완료'}{' '}
                <span className="text-gray-500">{doneCount} / {items.length}</span>
              </p>
              {running && <span className="text-[11px] text-emerald-300 animate-pulse">●</span>}
            </div>
            {/* 진행 바 */}
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
              />
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {items.map((it, i) => (
                <div key={`${it.name}_${i}`} className="flex items-center justify-between text-[11px] bg-gray-800/60 rounded px-2 py-1">
                  <span className="truncate text-gray-300 flex items-center gap-1.5 min-w-0">
                    <StatusDot status={it.status} />
                    <span className="truncate">{it.name}</span>
                  </span>
                  <span className="ml-2 flex-shrink-0">
                    {it.status === 'done' && (
                      <span className="text-emerald-300">
                        {EMO_LABEL[it.emotion] || it.emotion}
                        {typeof it.confidence === 'number' && (
                          <span className="text-gray-500"> · {Math.round(it.confidence * 100)}%</span>
                        )}
                      </span>
                    )}
                    {it.status === 'processing' && <span className="text-amber-300">분류 중…</span>}
                    {it.status === 'pending' && <span className="text-gray-600">대기</span>}
                    {it.status === 'error' && <span className="text-rose-400">{it.error}</span>}
                  </span>
                </div>
              ))}
            </div>
            {!running && (
              <p className="mt-2 text-[10px] text-gray-500">오분류된 항목은 표에서 해당 슬롯의 영상을 지우고 옮기면 됩니다.</p>
            )}
          </div>
        )}

        {/* 액션 */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
            style={NO_OUTLINE}
          >
            {started && !running ? '닫기' : '취소'}
          </button>
          {!started && (
            <button
              onClick={submit}
              disabled={!files.length}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
              style={NO_OUTLINE}
            >
              {files.length}개 업로드 & 자동 분류
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// 스타일 수정/삭제 모달 — 이름·해금모드·상점가격·성인전용·상점공개 편집 + 삭제.
function StyleEditModal({ style, onClose, onChanged }) {
  const [name, setName] = useState(style.name || '')
  const [unlockMode, setUnlockMode] = useState(style.unlockMode || 'DEFAULT')
  const [maskCost, setMaskCost] = useState(style.maskCost ? String(style.maskCost) : '')
  const [adultOnly, setAdultOnly] = useState(!!style.adultOnly)
  const [shopActive, setShopActive] = useState(style.shopActive !== false)
  // 출시 예약 — 숨김(미공개) 스타일에서만 편집. 공개된 스타일은 이미 라이브.
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(style.scheduledPublishAt))
  const [saving, setSaving] = useState(false)
  const hidden = style.isPublic === false

  const save = async () => {
    if (!name.trim()) return
    if (unlockMode === 'SHOP' && !(parseInt(maskCost) > 0)) {
      alert('상점 구매 스타일은 마스크 가격(1 이상)을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      await api.put(`/admin/styles/${style.id}`, {
        name: name.trim(),
        unlockMode,
        ...(unlockMode === 'SHOP' ? { maskCost: parseInt(maskCost), shopActive } : {}),
        adultOnly,
        // 숨김 스타일일 때만 예약 시각을 갱신 (빈값이면 예약 해제, 숨김 유지)
        ...(hidden ? { scheduledPublishAt: scheduledAt ? new Date(scheduledAt).toISOString() : null } : {}),
      })
      onChanged?.()
    } catch (err) {
      alert('저장 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  // 예약을 기다리지 않고 즉시 공개
  const publishNow = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/styles/${style.id}`, { isPublic: true })
      onChanged?.()
    } catch (err) {
      alert('공개 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`'${style.name}' 스타일과 모든 이미지를 삭제할까요? 되돌릴 수 없습니다.`)) return
    setSaving(true)
    try {
      await api.delete(`/admin/styles/${style.id}`)
      onChanged?.()
    } catch (err) {
      alert('삭제 실패: ' + (err?.data?.error || err?.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-white mb-4">스타일 편집</h3>

        <label className="block text-[11px] text-gray-400 mb-1">스타일명</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mb-3"
          style={NO_OUTLINE}
        />

        <label className="block text-[11px] text-gray-400 mb-1">해금 방식</label>
        <select
          value={unlockMode}
          onChange={(e) => setUnlockMode(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mb-3"
          style={NO_OUTLINE}
        >
          <option value="DEFAULT">기본 (대화 해금)</option>
          <option value="GACHA">가챠 전용</option>
          <option value="SHOP">상점 구매</option>
        </select>

        {unlockMode === 'SHOP' && (
          <>
            <label className="block text-[11px] text-gray-400 mb-1">마스크 가격</label>
            <input
              type="number"
              min="1"
              value={maskCost}
              onChange={(e) => setMaskCost(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mb-3"
              style={NO_OUTLINE}
            />
            <label className="flex items-center gap-2 text-xs text-gray-200 mb-3 cursor-pointer select-none">
              <input type="checkbox" checked={shopActive} onChange={(e) => setShopActive(e.target.checked)} className="accent-indigo-500" />
              상점에 공개 (해제 시 목록에서 숨김)
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-gray-200 mb-4 cursor-pointer select-none">
          <input type="checkbox" checked={adultOnly} onChange={(e) => setAdultOnly(e.target.checked)} className="accent-rose-500" />
          19+ 성인전용 (미인증 유저 구매 불가)
        </label>

        {/* 출시 예약 — 숨김 스타일에만 노출 */}
        {hidden ? (
          <div className="mb-5 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-sky-200">출시 예약</span>
              <span className="text-[10px] text-sky-300/80">
                {scheduledAt ? '예약 시각에 자동 공개' : '숨김 (예약 없음)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                style={{ ...NO_OUTLINE, colorScheme: 'dark' }}
              />
              {scheduledAt && (
                <button
                  onClick={() => setScheduledAt('')}
                  className="text-[11px] text-gray-400 hover:text-white whitespace-nowrap"
                  style={NO_OUTLINE}
                >
                  예약 해제
                </button>
              )}
            </div>
            <button
              onClick={publishNow}
              disabled={saving}
              className="mt-2 w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded disabled:opacity-50"
              style={NO_OUTLINE}
            >
              지금 바로 공개
            </button>
            <p className="mt-2 text-[10px] text-gray-500 leading-snug">
              예약 시각을 저장하려면 아래 <span className="text-gray-300">저장</span>을 누르세요. 예약 시각까지 이 스타일은 유저에게 노출되지 않습니다.
            </p>
          </div>
        ) : (
          <div className="mb-5 flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            공개됨 (유저에게 노출 중)
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={remove}
            disabled={saving}
            className="px-3 py-2 text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
            style={NO_OUTLINE}
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 text-xs text-gray-400 hover:text-white disabled:opacity-50"
              style={NO_OUTLINE}
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded disabled:opacity-50"
              style={NO_OUTLINE}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmotionCell({ characterId, styleId, emotion, emotionLabel, images, allStyleImages, onAdd, onRemove, onUpdate }) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const hasImages = images.length > 0
  const firstImage = hasImages ? images[0] : null
  // 이미지 row(영상 파일 아님) 중 videoFilePath 비어있는 게 하나라도 있으면 강조
  const needsVideo = images.some((i) => !isVideoUrl(i.filePath) && !i.videoFilePath)

  // 이미지 업로드 헬퍼 — Blob/File을 표정 이미지 row로 등록.
  const uploadImageBlob = async (blob, filename) => {
    const fd = new FormData()
    fd.append('image', blob, filename)
    fd.append('emotion', emotion)
    fd.append('description', '')
    const { image } = await api.post(`/admin/styles/${styleId}/images`, fd)
    return image
  }

  const uploadFile = async (file) => {
    if (!file) return
    // 이미지 또는 비디오만 허용 (서버 uploadSprite와 일치)
    if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) return
    setUploading(true)
    try {
      if (file.type?.startsWith('video/')) {
        // 영상 업로드: 0프레임 썸네일을 이미지로 만들고 영상을 그 이미지에 자동 연결.
        // 결과 = 이미지 row 1개 (filePath=썸네일, videoFilePath=영상).
        let thumbImage = null
        try {
          const thumbBlob = await extractFirstFrameBlob(file)
          thumbImage = await uploadImageBlob(thumbBlob, 'thumbnail.jpg')
        } catch (thumbErr) {
          console.error('First-frame thumbnail extraction failed, falling back to standalone video:', thumbErr)
        }

        // 영상 파일 업로드 (standalone row)
        const videoFd = new FormData()
        videoFd.append('image', file)
        videoFd.append('emotion', emotion)
        videoFd.append('description', '')
        const { image: videoRow } = await api.post(`/admin/styles/${styleId}/images`, videoFd)

        if (thumbImage) {
          // 영상을 썸네일 이미지에 연결 — standalone videoRow는 서버에서 소모(삭제)됨.
          const res = await api.post(`/admin/images/${thumbImage.id}/link-video`, {
            videoUrl: videoRow.filePath,
          })
          onAdd({ ...thumbImage, videoFilePath: res.image.videoFilePath, emotion })
        } else {
          // 썸네일 추출 실패 시 기존 동작(standalone 영상 row)으로 폴백.
          onAdd({ ...videoRow, emotion })
        }
      } else {
        const uploaded = await uploadImageBlob(file, file.name || 'image')
        onAdd({ ...uploaded, emotion })
      }
    } catch (error) {
      console.error('Expression upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  const triggerUploadDirect = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4,video/webm'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (file) await uploadFile(file)
    }
    input.click()
  }

  const handleClick = () => {
    if (uploading) return
    // 이미지 유무와 관계없이 매니저 열기 (업로드 + AI 생성 두 옵션 노출)
    setManagerOpen(true)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (uploading) return
    if (!dragOver) setDragOver(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (uploading) return
    const file = e.dataTransfer?.files?.[0]
    if (file) await uploadFile(file)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={uploading}
        className={`relative w-16 h-16 mx-auto rounded-md overflow-hidden border-2 flex items-center justify-center transition-colors group ${
          dragOver
            ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-500/40'
            : `border-dashed ${hasImages ? 'border-gray-700 hover:border-indigo-500' : 'border-gray-700 hover:border-indigo-500 bg-gray-800/40'} ${needsVideo ? 'ring-2 ring-red-500/70' : ''}`
        } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={NO_OUTLINE}
        title={hasImages ? `${images.length}장 — 클릭하여 관리 / 드래그하여 추가` : '클릭 또는 드래그하여 업로드'}
      >
        {uploading ? (
          <span className="text-[10px] text-gray-400">업로드중</span>
        ) : firstImage ? (
          <>
            <ExpressionThumb src={firstImage.filePath} className="w-full h-full object-cover" />
            {images.length > 1 && (
              <span className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-black/70 text-white pointer-events-none">
                +{images.length - 1}
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl text-gray-600">+</span>
        )}
      </button>

      {managerOpen && (
        <EmotionSlotManager
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          images={images}
          allStyleImages={allStyleImages}
          onClose={() => setManagerOpen(false)}
          onUpload={uploadFile}
          uploading={uploading}
          onRemove={onRemove}
          onAdd={onAdd}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}

function EmotionSlotManager({ characterId, styleId, emotion, emotionLabel, images, allStyleImages, onClose, onUpload, uploading, onRemove, onAdd, onUpdate }) {
  const [removingId, setRemovingId] = useState(null)
  // 컷 교체 진행 중인 이미지 id / 드래그가 올라온 셀 id
  const [replacingId, setReplacingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  // 영상 연결 picker — 어떤 이미지 row에 어떤 영상을 붙일지 선택.
  const [linkPickerForImage, setLinkPickerForImage] = useState(null) // CharacterImage object or null
  const [linkingVideoId, setLinkingVideoId] = useState(null)
  const [unlinkingId, setUnlinkingId] = useState(null)
  // 영상 프레임 추출 — videoUrl이 있는 영상에서 1초 단위 캡처
  const [frameExtractFor, setFrameExtractFor] = useState(null) // { ...img, videoSource } or null
  // Ghost(정합성 오류) 영상을 다른 이미지에 재연결하기 위한 picker
  const [relinkPickerForVideo, setRelinkPickerForVideo] = useState(null) // standalone 영상 row or null
  const [relinkScope, setRelinkScope] = useState('emotion') // 'emotion' | 'all'
  const [relinkingImageId, setRelinkingImageId] = useState(null)

  // 사용 가능한 standalone 영상 풀 — 1:1 정책상 이미 linked된 URL은 제외
  // 기본은 같은 감정만 (linkPickerForImage 기준), 토글로 전체 감정 보기 가능
  const [pickerScope, setPickerScope] = useState('emotion') // 'emotion' | 'all'

  const availableVideos = useMemo(() => {
    if (!linkPickerForImage) return []
    const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
    const seen = new Set()
    const list = []
    for (const i of allStyleImages || []) {
      if (!isVideoUrl(i.filePath)) continue
      if (linkedUrls.has(i.filePath)) continue // 이미 다른 이미지에 1:1로 연결됨
      if (seen.has(i.filePath)) continue
      if (pickerScope === 'emotion' && i.emotion !== linkPickerForImage.emotion) continue
      seen.add(i.filePath)
      list.push({ videoUrl: i.filePath, thumbnailUrl: i.filePath, emotion: i.emotion })
    }
    return list
  }, [allStyleImages, linkPickerForImage, pickerScope])

  const handleLinkVideo = async (imageId, videoUrl) => {
    setLinkingVideoId(videoUrl)
    try {
      const res = await api.post(`/admin/images/${imageId}/link-video`, { videoUrl })
      onUpdate?.(imageId, { videoFilePath: res.image.videoFilePath })
      // 소모된 standalone row는 로컬 state에서 제거
      if (res.consumedStandalone) onRemove?.(res.consumedStandalone)
      // 1:1 정책으로 이전 연결 해제된 이미지 반영
      if (res.transferredFrom) onUpdate?.(res.transferredFrom, { videoFilePath: null })
      setLinkPickerForImage(null)
    } catch (err) {
      alert('연결 실패: ' + (err?.error || err?.message))
    } finally {
      setLinkingVideoId(null)
    }
  }

  // Ghost 재연결 — 같은 styleId 내 이미지 row 중 videoFilePath 비어있는 후보를 추린다.
  const relinkCandidates = useMemo(() => {
    if (!relinkPickerForVideo) return []
    const list = []
    const seen = new Set()
    for (const i of allStyleImages || []) {
      if (isVideoUrl(i.filePath)) continue // 이미지 row만
      if (i.videoFilePath) continue // 이미 영상 연결된 것 제외
      if (relinkScope === 'emotion' && i.emotion !== relinkPickerForVideo.emotion) continue
      if (seen.has(i.id)) continue
      seen.add(i.id)
      list.push(i)
    }
    return list
  }, [allStyleImages, relinkPickerForVideo, relinkScope])

  const handleRelinkGhost = async (targetImageId, ghost) => {
    setRelinkingImageId(targetImageId)
    try {
      const res = await api.post(`/admin/images/${targetImageId}/link-video`, {
        videoUrl: ghost.filePath,
      })
      onUpdate?.(targetImageId, { videoFilePath: res.image.videoFilePath })
      if (res.consumedStandalone) onRemove?.(res.consumedStandalone)
      if (res.transferredFrom) onUpdate?.(res.transferredFrom, { videoFilePath: null })
      setRelinkPickerForVideo(null)
    } catch (err) {
      alert('재연결 실패: ' + (err?.error || err?.message))
    } finally {
      setRelinkingImageId(null)
    }
  }

  const handleUnlinkVideo = async (imageId) => {
    if (!confirm('이 이미지의 영상 연결을 해제하시겠습니까?')) return
    setUnlinkingId(imageId)
    try {
      await api.delete(`/admin/images/${imageId}/video`)
      onUpdate?.(imageId, { videoFilePath: null })
    } catch (err) {
      alert('해제 실패: ' + (err?.error || err?.message))
    } finally {
      setUnlinkingId(null)
    }
  }

  const triggerUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4,video/webm'
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      for (const f of files) await onUpload(f)
    }
    input.click()
  }

  // 컷 교체 — 같은 CharacterImage 행의 파일만 갈아끼운다. 행 ID가 유지되므로
  // 이미 마스크를 낸 유저의 해금 기록(SeenCharacterImage.videoUnlockedAt)이 살아남는다.
  // 삭제 후 재업로드는 CASCADE로 해금이 소멸하니 컷 개선에는 절대 쓰지 않는다.
  const handleReplaceImage = async (img, file) => {
    if (!file || replacingId) return
    setReplacingId(img.id)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const { image: updated } = await api.post(`/admin/images/${img.id}/replace`, fd)
      onUpdate?.(img.id, { filePath: updated.filePath, videoFilePath: updated.videoFilePath ?? null })
    } catch (err) {
      alert('교체 실패: ' + (err?.error || err?.message))
    } finally {
      setReplacingId(null)
    }
  }

  // 연결 영상 교체 — videoFilePath만 새 파일로 교체 (해금 기록 유지)
  const handleReplaceVideo = async (img, file) => {
    if (!file || replacingId) return
    setReplacingId(img.id)
    try {
      const fd = new FormData()
      fd.append('video', file)
      const { image: updated } = await api.post(`/admin/images/${img.id}/video`, fd)
      onUpdate?.(img.id, { videoFilePath: updated.videoFilePath })
    } catch (err) {
      alert('영상 교체 실패: ' + (err?.error || err?.message))
    } finally {
      setReplacingId(null)
    }
  }

  const pickAndReplace = (img, { video = false } = {}) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = video ? 'video/mp4,video/webm' : 'image/*,video/mp4,video/webm'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (video) handleReplaceVideo(img, file)
      else handleReplaceImage(img, file)
    }
    input.click()
  }

  // 드롭으로 교체 — 실수로 놓는 경우가 있어 확인을 받는다 (버튼 클릭은 확인 없음)
  const handleReplaceDrop = (img, e) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTargetId(null)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    const isVideoFile = (file.type || '').startsWith('video/')
    if (!confirm(`이 컷의 ${isVideoFile ? '파일' : '이미지'}을 "${file.name}" 으로 교체할까요?\n(해금 기록은 유지됩니다)`)) return
    handleReplaceImage(img, file)
  }

  const handleRemove = async (imageId) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return
    setRemovingId(imageId)
    try {
      await api.delete(`/admin/images/${imageId}`)
      onRemove(imageId)
    } catch (err) {
      console.error('Remove image error:', err)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{emotionLabel} <span className="text-gray-500 text-[11px]">({emotion})</span></h3>
            {(() => {
              const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
              const imageCount = images.filter((i) => !isVideoUrl(i.filePath)).length
              const standaloneCount = images.filter((i) => isVideoUrl(i.filePath) && !linkedUrls.has(i.filePath)).length
              return (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  🖼 {imageCount}장 · 🎥 {standaloneCount}개 (미연결) · 채팅에서 랜덤으로 1장 선택됨
                </p>
              )
            })()}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setAiOpen(true)}
              disabled={uploading}
              className="px-3 py-1.5 rounded-md text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white disabled:opacity-50"
              style={NO_OUTLINE}
              title="Grok 시안 배경 생성 + chroma key 배경 제거"
            >
              ✨ AI 생성
            </button>
            <button
              onClick={triggerUpload}
              disabled={uploading}
              className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              style={NO_OUTLINE}
            >
              {uploading ? '업로드 중...' : '+ 이미지 추가'}
            </button>
          </div>
        </div>

        {(() => {
          // 1:1 정책 — 스타일 전체 기준으로 videoFilePath 사용 중인 URL 체크 (cross-emotion 포함)
          const linkedUrls = new Set((allStyleImages || []).map((i) => i.videoFilePath).filter(Boolean))
          const imageRows = images.filter((i) => !isVideoUrl(i.filePath))
          const videoRows = images.filter((i) => isVideoUrl(i.filePath) && !linkedUrls.has(i.filePath))
          const ghostRows = images.filter((i) => isVideoUrl(i.filePath) && linkedUrls.has(i.filePath))

          if (images.length === 0) {
            return <p className="text-center text-sm text-gray-500 py-10">아직 이미지가 없습니다.</p>
          }

          const renderCell = (img) => {
            const isVid = isVideoUrl(img.filePath)
            // 프레임 추출용 영상 소스 — standalone 영상 row면 filePath, 이미지 row에 연결된 영상이면 videoFilePath.
            const videoSource = isVid ? img.filePath : img.videoFilePath
            // 이미지 row 중 연결된 영상이 없으면 빨간 border로 강조 (운영 작업 추적용)
            const needsVideo = !isVid && !img.videoFilePath
            // Ghost — 영상 row 인데 그 URL이 이미 다른 이미지에 연결됨 (linkedUrls 기준)
            const isGhost = isVid && linkedUrls.has(img.filePath)
            // 이미지 row에 연결된 영상이 있으면 셀 하단에 함께 미리보기
            const hasLinkedVideoPreview = !isVid && !!img.videoFilePath
            return (
              <div
                key={img.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (dropTargetId !== img.id) setDropTargetId(img.id)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setDropTargetId((prev) => (prev === img.id ? null : prev))
                }}
                onDrop={(e) => handleReplaceDrop(img, e)}
                className={`rounded-md overflow-hidden bg-gray-800 ${
                  dropTargetId === img.id
                    ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-gray-900'
                    : needsVideo
                      ? 'ring-2 ring-red-500/70 ring-offset-1 ring-offset-gray-900'
                      : ''
                }`}
              >
                <div className="relative group">
                <div className="aspect-[3/4]">
                  <ExpressionThumb src={img.filePath} className="w-full h-full object-cover" />
                </div>
                {dropTargetId === img.id && (
                  <div className="absolute inset-0 bg-indigo-600/70 flex items-center justify-center text-[10px] font-bold text-white pointer-events-none">
                    놓으면 교체
                  </div>
                )}
                {replacingId === img.id && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-[10px] text-white pointer-events-none">
                    교체 중...
                  </div>
                )}
                {isGhost && (
                  <button
                    onClick={() => setRelinkPickerForVideo(img)}
                    className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 h-6 rounded-full bg-amber-700/90 hover:bg-amber-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                    style={NO_OUTLINE}
                    title="이 영상을 다른 이미지에 재연결"
                  >
                    🔗 재연결
                  </button>
                )}
                {img.videoFilePath && !isVid && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-full pointer-events-none">
                    🔗
                  </span>
                )}
                {videoSource && (
                  <button
                    onClick={() => setFrameExtractFor({ ...img, videoSource })}
                    className="absolute top-1.5 right-7 w-6 h-6 rounded-full bg-black/70 hover:bg-indigo-600 text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    style={NO_OUTLINE}
                    title="영상에서 1초 단위 프레임 추출"
                  >
                    🎞
                  </button>
                )}
                {!isVid && (
                  <>
                    {/* 영상 연결 or 해제 버튼 — 중앙 하단 */}
                    {img.videoFilePath ? (
                      <button
                        onClick={() => handleUnlinkVideo(img.id)}
                        disabled={unlinkingId === img.id}
                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 h-6 rounded-full bg-emerald-700/90 hover:bg-red-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 disabled:opacity-50"
                        style={NO_OUTLINE}
                        title="영상 연결 해제"
                      >
                        🔗 해제
                      </button>
                    ) : (
                      <button
                        onClick={() => setLinkPickerForImage(img)}
                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 h-6 rounded-full bg-black/70 hover:bg-emerald-600 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                        style={NO_OUTLINE}
                        title="기존 영상에 연결"
                      >
                        🔗 연결
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => handleRemove(img.id)}
                  disabled={removingId === img.id}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-50"
                  style={NO_OUTLINE}
                  title="삭제"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                </div>
                {hasLinkedVideoPreview && (
                  <div className="bg-black border-t border-emerald-700/40 relative group">
                    <video
                      src={img.videoFilePath}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="w-full aspect-[3/4] object-cover"
                    />
                    <span className="absolute top-1 left-1 text-[9px] font-bold bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-full pointer-events-none">
                      🔗 연결 영상
                    </span>
                    <button
                      onClick={() => pickAndReplace(img, { video: true })}
                      disabled={replacingId === img.id}
                      className="absolute top-1 right-1 px-1.5 h-5 rounded-full bg-black/70 hover:bg-indigo-600 text-white text-[9px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center disabled:opacity-50"
                      style={NO_OUTLINE}
                      title="영상 파일만 교체 — 해금 기록 유지 (이미 마스크 낸 유저도 새 영상을 봅니다)"
                    >
                      🔄 영상 교체
                    </button>
                  </div>
                )}
                {/* 교체 바 — 삭제 후 재업로드와 달리 행 ID를 유지해 해금 기록을 보존한다 */}
                <div className="flex items-stretch border-t border-gray-700/60 divide-x divide-gray-700/60">
                  <button
                    onClick={() => pickAndReplace(img)}
                    disabled={replacingId === img.id}
                    className="flex-1 py-1 text-[9px] text-gray-300 hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50"
                    style={NO_OUTLINE}
                    title={
                      isVid
                        ? '이 영상 파일을 교체 — 행 유지, 해금 기록 보존'
                        : '이 컷의 이미지를 교체 — 행 유지, 해금 기록 보존 (연결 영상은 그대로)'
                    }
                  >
                    🔄 {isVid ? '영상 파일' : '이미지'} 교체
                  </button>
                  {!isVid && !img.videoFilePath && (
                    <button
                      onClick={() => pickAndReplace(img, { video: true })}
                      disabled={replacingId === img.id}
                      className="flex-1 py-1 text-[9px] text-gray-300 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50"
                      style={NO_OUTLINE}
                      title="이 컷에 연결 영상 업로드"
                    >
                      ＋ 영상
                    </button>
                  )}
                </div>
              </div>
            )
          }

          return (
            <div className="space-y-5">
              {/* 🖼 이미지 섹션 */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-blue-300">🖼 이미지</span>
                  <span className="text-[10px] text-gray-500">({imageRows.length}장)</span>
                  <span className="text-[10px] text-emerald-400/80">
                    · 🔗 = 영상 연결됨 ({imageRows.filter((i) => i.videoFilePath).length}장)
                  </span>
                </div>
                {imageRows.length === 0 ? (
                  <p className="text-center text-xs text-gray-600 py-6 border border-dashed border-gray-800 rounded-md">
                    등록된 이미지가 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {imageRows.map(renderCell)}
                  </div>
                )}
              </section>

              {/* 🎥 영상 섹션 — 미연결 standalone만 (이미 linked된 URL은 ghost로 분리) */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-amber-300">🎥 영상 (미연결)</span>
                  <span className="text-[10px] text-gray-500">({videoRows.length}개)</span>
                  <span className="text-[10px] text-gray-500">· 이미지에 연결 가능</span>
                </div>
                {videoRows.length === 0 ? (
                  <p className="text-center text-xs text-gray-600 py-6 border border-dashed border-gray-800 rounded-md">
                    연결 가능한 영상이 없습니다.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {videoRows.map(renderCell)}
                  </div>
                )}
              </section>

              {/* 👻 Ghost 섹션 — 정합성 깨진 잔여 row (이미 linked된 URL과 동일한 standalone) */}
              {ghostRows.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-red-300">👻 Ghost (정합성 오류)</span>
                    <span className="text-[10px] text-gray-500">({ghostRows.length}개)</span>
                    <span className="text-[10px] text-red-300/70">· 이미 다른 이미지에 연결됨 + standalone row도 남아있음 — 재연결로 새 이미지에 옮기거나 삭제</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {ghostRows.map(renderCell)}
                  </div>
                </section>
              )}
            </div>
          )
        })()}

        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg"
            style={NO_OUTLINE}
          >
            닫기
          </button>
        </div>
      </div>

      {aiOpen && (
        <AiExpressionGenerator
          characterId={characterId}
          styleId={styleId}
          emotion={emotion}
          emotionLabel={emotionLabel}
          onClose={() => setAiOpen(false)}
          onSaved={(uploaded) => onAdd({ ...uploaded, emotion })}
        />
      )}

      {/* 영상 picker 모달 — 1:1 관계, 같은 감정 기본 */}
      {linkPickerForImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLinkPickerForImage(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">🔗 영상 연결</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">1:1 관계 · 선택한 영상은 이 이미지로 이전됩니다 (원본 standalone 삭제)</p>
              </div>
              <button
                onClick={() => setLinkPickerForImage(null)}
                className="text-gray-400 hover:text-white"
                style={NO_OUTLINE}
              >
                ✕
              </button>
            </div>

            {/* 선택 대상 이미지 미리보기 */}
            <div className="flex items-center gap-3 mb-4 bg-gray-800/50 rounded-lg p-3">
              <img src={linkPickerForImage.filePath} alt="" className="w-16 rounded-lg object-cover" style={{ aspectRatio: '3/4' }} />
              <div className="text-xs">
                <p className="text-gray-300 font-semibold">{EMOTION_LABEL_MAP[linkPickerForImage.emotion] || linkPickerForImage.emotion}</p>
                <p className="text-gray-500">이미지 ID: {linkPickerForImage.id}</p>
              </div>
            </div>

            {/* 스코프 토글 */}
            <div className="flex gap-2 mb-3 text-xs">
              <button
                onClick={() => setPickerScope('emotion')}
                className={`px-2 py-1 rounded ${pickerScope === 'emotion' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                같은 감정만 (기본)
              </button>
              <button
                onClick={() => setPickerScope('all')}
                className={`px-2 py-1 rounded ${pickerScope === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                전체 감정
              </button>
            </div>

            {availableVideos.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-10">
                연결 가능한 영상이 없습니다.<br/>
                <span className="text-[11px]">
                  {pickerScope === 'emotion'
                    ? '같은 감정의 standalone 영상이 없습니다. 전체 감정 보기로 전환하거나 영상을 업로드하세요.'
                    : '먼저 영상을 업로드하세요.'}
                </span>
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {availableVideos.map((v, idx) => (
                  <button
                    key={`${v.videoUrl}-${idx}`}
                    onClick={() => handleLinkVideo(linkPickerForImage.id, v.videoUrl)}
                    disabled={linkingVideoId === v.videoUrl}
                    className="relative bg-gray-800 hover:bg-gray-700 rounded-lg overflow-hidden border border-gray-700 hover:border-emerald-500 transition-all disabled:opacity-50"
                    style={NO_OUTLINE}
                  >
                    <div className="aspect-[3/4]">
                      <video src={v.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                    </div>
                    <span className="absolute top-1 left-1 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded-full">
                      {EMOTION_LABEL_MAP[v.emotion] || v.emotion}
                    </span>
                    {linkingVideoId === v.videoUrl && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-emerald-400 text-xs">
                        이전 중...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {frameExtractFor && (
        <FrameExtractorModal
          videoUrl={frameExtractFor.videoSource}
          styleId={styleId}
          defaultEmotion={frameExtractFor.emotion || emotion}
          onAdd={(uploaded) => onAdd?.(uploaded)}
          onClose={() => setFrameExtractFor(null)}
        />
      )}

      {/* Ghost 재연결 picker — 영상 → 이미지 방향. 서버 link-video가 기존 연결 해제 + standalone 소모를 자동 처리 */}
      {relinkPickerForVideo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setRelinkPickerForVideo(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">🔗 영상 재연결</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">기존 연결을 끊고 선택한 이미지로 이전합니다. standalone row도 함께 정리됩니다.</p>
              </div>
              <button
                onClick={() => setRelinkPickerForVideo(null)}
                className="text-gray-400 hover:text-white"
                style={NO_OUTLINE}
              >
                ✕
              </button>
            </div>

            {/* 재연결할 영상 미리보기 */}
            <div className="flex items-center gap-3 mb-4 bg-gray-800/50 rounded-lg p-3">
              <video
                src={relinkPickerForVideo.filePath}
                className="w-16 rounded-lg object-cover"
                style={{ aspectRatio: '3/4' }}
                autoPlay
                loop
                muted
                playsInline
              />
              <div className="text-xs">
                <p className="text-gray-300 font-semibold">
                  {EMOTION_LABEL_MAP[relinkPickerForVideo.emotion] || relinkPickerForVideo.emotion} 영상
                </p>
                <p className="text-gray-500">standalone row ID: {relinkPickerForVideo.id}</p>
              </div>
            </div>

            {/* 스코프 토글 */}
            <div className="flex gap-2 mb-3 text-xs">
              <button
                onClick={() => setRelinkScope('emotion')}
                className={`px-2 py-1 rounded ${relinkScope === 'emotion' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                같은 감정만 (기본)
              </button>
              <button
                onClick={() => setRelinkScope('all')}
                className={`px-2 py-1 rounded ${relinkScope === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                style={NO_OUTLINE}
              >
                전체 감정
              </button>
            </div>

            {relinkCandidates.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-10">
                연결 가능한 이미지가 없습니다.<br />
                <span className="text-[11px]">
                  {relinkScope === 'emotion'
                    ? '같은 감정에 영상이 비어있는 이미지가 없습니다. 전체 감정 보기로 전환해보세요.'
                    : '모든 이미지에 이미 영상이 연결되어 있습니다.'}
                </span>
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {relinkCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    onClick={() => handleRelinkGhost(cand.id, relinkPickerForVideo)}
                    disabled={relinkingImageId === cand.id}
                    className="relative bg-gray-800 hover:bg-gray-700 rounded-lg overflow-hidden border border-gray-700 hover:border-amber-500 transition-all disabled:opacity-50"
                    style={NO_OUTLINE}
                  >
                    <div className="aspect-[3/4]">
                      <img src={cand.filePath} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="absolute top-1 left-1 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded-full">
                      {EMOTION_LABEL_MAP[cand.emotion] || cand.emotion}
                    </span>
                    {relinkingImageId === cand.id && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-amber-400 text-xs">
                        재연결 중...
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// AROUSED 전 단계 자동 생성 파이프라인
// ============================================
const PIPELINE_SEQUENCE = [
  { key: 'AROUSED_TEASE', label: '도발' },
  { key: 'AROUSED_TOPLESS', label: '상의탈의' },
  { key: 'AROUSED_NUDE', label: '전라' },
  { key: 'AROUSED_FOREPLAY', label: '전희' },
  { key: 'AROUSED_INSERT', label: '삽입' },
  { key: 'AROUSED_INSERT_ALT', label: '삽입(체위2)' },
  { key: 'AROUSED_CLIMAX', label: '절정' },
  { key: 'AROUSED_AFTERGLOW', label: '여운' },
]

const STEP_LABEL = { prompt: '프롬프트', video: '비디오 생성', upload: '업로드', wan: 'WAN 이미지 생성', frames: '프레임 추출', analyze: '이미지 분석', select: '래퍼런스 선정' }

// ============================================
// 영상 프레임 추출 — videoUrl에서 1초 단위 캡처 → 표정 이미지로 등록
// - 브라우저 canvas로 추출 (서버 ffmpeg 불필요)
// - 영상의 0초, 1초, ..., floor(duration)초 시점 캡처
// - 등록 시 기존 POST /admin/styles/:styleId/images 재사용 (이미지 파일 = JPEG blob)
// - CORS: Supabase storage는 anonymous 허용. video crossOrigin="anonymous" 필요.
// ============================================
function FrameExtractorModal({ videoUrl, styleId, defaultEmotion, onAdd, onClose }) {
  const videoRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [frames, setFrames] = useState([]) // [{ t, blob, blobUrl }]
  const [error, setError] = useState(null)
  const [emotion, setEmotion] = useState(defaultEmotion || 'NEUTRAL')
  const [busyIdx, setBusyIdx] = useState(null)
  const [addedTs, setAddedTs] = useState(() => new Set()) // 이미 추가된 timestamp 집합
  const framesRef = useRef([])
  useEffect(() => {
    framesRef.current = frames
  }, [frames])

  // unmount 시 마지막 frames의 Blob URL 해제 (ref 경유로 stale closure 우회)
  useEffect(
    () => () => {
      framesRef.current.forEach((f) => URL.revokeObjectURL(f.blobUrl))
    },
    [],
  )

  const handleLoadedMetadata = () => {
    const v = videoRef.current
    if (v && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration)
  }

  const seekTo = (v, t) =>
    new Promise((resolve, reject) => {
      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked)
        v.removeEventListener('error', onErr)
        resolve()
      }
      const onErr = () => {
        v.removeEventListener('seeked', onSeeked)
        v.removeEventListener('error', onErr)
        reject(new Error('video seek error'))
      }
      v.addEventListener('seeked', onSeeked)
      v.addEventListener('error', onErr)
      // duration보다 살짝 짧게 — 일부 브라우저가 정확히 duration일 때 frame 못 얻음
      v.currentTime = Math.min(t, Math.max(0, v.duration - 0.05))
    })

  const extractFrames = async () => {
    const v = videoRef.current
    if (!v) return
    setError(null)
    // 이전 추출 결과 정리
    frames.forEach((f) => URL.revokeObjectURL(f.blobUrl))
    setFrames([])
    setAddedTs(new Set())
    setExtracting(true)
    try {
      if (!Number.isFinite(v.duration) || v.duration <= 0) {
        await new Promise((res) => v.addEventListener('loadedmetadata', res, { once: true }))
      }
      const w = v.videoWidth || 720
      const h = v.videoHeight || 1280
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      const totalSec = Math.floor(v.duration)
      const stamps = []
      for (let t = 0; t <= totalSec; t++) stamps.push(t)

      const out = []
      for (const t of stamps) {
        await seekTo(v, t)
        ctx.drawImage(v, 0, 0, w, h)
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
        if (!blob) throw new Error('canvas.toBlob 실패 (CORS 가능성)')
        out.push({ t, blob, blobUrl: URL.createObjectURL(blob) })
      }
      setFrames(out)
    } catch (err) {
      console.error('Frame extraction error:', err)
      setError(err?.message || '프레임 추출 실패 (영상 CORS / 디코딩 문제일 수 있음)')
    } finally {
      setExtracting(false)
    }
  }

  const handleAdd = async (idx) => {
    setBusyIdx(idx)
    setError(null)
    try {
      const f = frames[idx]
      const fd = new FormData()
      fd.append('image', f.blob, `frame_${f.t}s.jpg`)
      fd.append('emotion', emotion)
      fd.append('description', `Extracted from video frame @ ${f.t}s`)
      const { image } = await api.post(`/admin/styles/${styleId}/images`, fd)
      onAdd?.({ ...image, emotion })
      setAddedTs((prev) => {
        const n = new Set(prev)
        n.add(f.t)
        return n
      })
    } catch (err) {
      setError(err?.error || err?.message || '업로드 실패')
    } finally {
      setBusyIdx(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">🎞 영상 프레임 추출</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              영상에서 1초 단위로 프레임을 캡처해 표정 이미지로 등록합니다.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white" style={NO_OUTLINE}>
            ✕
          </button>
        </div>

        {/* 영상 미리보기 + 추출 컨트롤 */}
        <div className="bg-gray-800/50 rounded-lg p-3 mb-3 flex gap-3">
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            muted
            playsInline
            preload="auto"
            controls
            onLoadedMetadata={handleLoadedMetadata}
            className="w-40 rounded-md bg-black"
            style={{ aspectRatio: '3/4' }}
          />
          <div className="flex-1 flex flex-col justify-between min-w-0">
            <div className="text-xs text-gray-400 space-y-1">
              <p>길이: {duration ? `${duration.toFixed(2)}초` : '로딩 중...'}</p>
              <p>
                추출 예정 프레임:{' '}
                {duration ? `${Math.floor(duration) + 1}장 (0초 ~ ${Math.floor(duration)}초)` : '?'}
              </p>
            </div>
            <button
              onClick={extractFrames}
              disabled={extracting || !duration}
              className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 self-start"
              style={NO_OUTLINE}
            >
              {extracting ? '추출 중...' : frames.length > 0 ? '다시 추출' : '프레임 추출'}
            </button>
          </div>
        </div>

        {/* 등록할 감정 선택 */}
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-gray-400">등록할 감정:</span>
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
            style={NO_OUTLINE}
          >
            {Object.entries(EMOTION_LABEL_MAP).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({k})
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {/* 프레임 그리드 */}
        {frames.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">
            아직 추출된 프레임이 없습니다. 위에서 "프레임 추출"을 눌러주세요.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {frames.map((f, idx) => {
              const added = addedTs.has(f.t)
              return (
                <div
                  key={f.t}
                  className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700"
                >
                  <div className="aspect-[3/4]">
                    <img
                      src={f.blobUrl}
                      alt={`frame at ${f.t}s`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="absolute top-1 left-1 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded-full">
                    {f.t}s
                  </span>
                  <button
                    onClick={() => handleAdd(idx)}
                    disabled={busyIdx === idx || added}
                    className={`absolute bottom-1 left-1 right-1 px-2 py-1 rounded-md text-[10px] font-semibold disabled:opacity-50 ${
                      added
                        ? 'bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                    style={NO_OUTLINE}
                  >
                    {added ? '✓ 추가됨' : busyIdx === idx ? '추가 중...' : '+ 표정으로 추가'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg"
            style={NO_OUTLINE}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function ArousedPipelineModal({ characterId, styleId, characterName, teaseImages, onClose }) {
  const [selectedImage, setSelectedImage] = useState(teaseImages[0] || null)
  const [customUrl, setCustomUrl] = useState('')
  const [mode, setMode] = useState('image') // 'image' | 'video'
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const referenceUrl = selectedImage ? selectedImage.filePath : customUrl.trim()

  const handleStart = async () => {
    if (!referenceUrl) return setError('래퍼런스 이미지를 선택하거나 URL을 입력해주세요.')
    setStarting(true)
    setError(null)
    try {
      const endpoint = mode === 'image'
        ? `/admin/characters/${characterId}/start-aroused-image-pipeline`
        : `/admin/characters/${characterId}/start-aroused-pipeline`
      const { jobId: id } = await api.post(endpoint, { styleId, referenceImageUrl: referenceUrl })
      setJobId(id)
    } catch (err) {
      setError(err.message || '시작 실패')
    } finally {
      setStarting(false)
    }
  }

  // Poll job status every 5s
  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const { job: j } = await api.get(`/admin/jobs/${jobId}`)
        setJob(j)
        if (j.status === 'running' || j.status === 'queued') {
          pollRef.current = setTimeout(poll, 5000)
        }
      } catch {}
    }
    poll()
    return () => clearTimeout(pollRef.current)
  }, [jobId])

  const isRunning = job?.status === 'running' || job?.status === 'queued'
  const isDone = job?.status === 'completed'
  const isFailed = job?.status === 'failed'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 overflow-y-auto py-6" onClick={!isRunning ? onClose : undefined}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">🚀 전단계 자동 생성 — {characterName}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">도발 → 여운 8단계 순서대로 자동 생성</p>
          </div>
          {!isRunning && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg" style={NO_OUTLINE}>✕</button>
          )}
        </div>

        {/* 시작 전: 래퍼런스 이미지 선택 */}
        {!jobId && (
          <>
            <p className="text-xs text-gray-400 mb-2">래퍼런스 이미지 선택 <span className="text-gray-600">(도발 감정 슬롯에 있는 이미지 또는 직접 URL 입력)</span></p>

            {teaseImages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {teaseImages.map(img => (
                  <div
                    key={img.id}
                    onClick={() => { setSelectedImage(img); setCustomUrl('') }}
                    className={`relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedImage?.id === img.id ? 'border-amber-500' : 'border-gray-700 hover:border-gray-500'}`}
                    style={{ width: 64 }}
                  >
                    <img src={img.filePath} alt="" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
                    {selectedImage?.id === img.id && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {teaseImages.length === 0 && (
              <p className="text-xs text-yellow-500 mb-2">도발 감정 슬롯에 이미지가 없습니다. 아래에 이미지 URL을 직접 입력하세요.</p>
            )}

            <input
              value={customUrl}
              onChange={e => { setCustomUrl(e.target.value); setSelectedImage(null) }}
              placeholder="또는 이미지 URL 직접 입력"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 mb-3"
            />

            {customUrl && (
              <img src={customUrl} alt="preview" className="w-20 rounded-lg mb-3 border border-gray-700 object-cover" style={{ aspectRatio: '3/4' }} onError={e => e.target.style.display = 'none'} />
            )}

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

            {/* 모드 선택 */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode('image')}
                className={`flex-1 py-2 text-sm rounded-xl font-semibold transition-all ${mode === 'image' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🖼 이미지만
              </button>
              <button
                onClick={() => setMode('video')}
                className={`flex-1 py-2 text-sm rounded-xl font-semibold transition-all ${mode === 'video' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                style={NO_OUTLINE}
              >
                🎬 비디오+이미지
              </button>
            </div>

            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-4 text-[11px] text-gray-400 leading-relaxed">
              <p className="font-semibold text-gray-300 mb-1">진행 순서</p>
              {PIPELINE_SEQUENCE.map((s, i) => (
                <span key={s.key}>{i > 0 && ' → '}<span className="text-white">{s.label}</span></span>
              ))}
              {mode === 'video' ? (
                <p className="mt-2 text-gray-500">각 단계: 프롬프트 생성 → 비디오 생성 (~5분) → 프레임 추출+분석 → 다음 단계 래퍼런스 선정</p>
              ) : (
                <p className="mt-2 text-gray-500">각 단계: WAN 이미지 생성 → 업로드 → 다음 단계 래퍼런스로 사용</p>
              )}
              <p className="mt-1 text-yellow-600">전체 소요 시간: {mode === 'video' ? '약 40~60분' : '약 5~10분'}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>취소</button>
              <button
                onClick={handleStart}
                disabled={starting || !referenceUrl}
                className="flex-1 py-2 text-sm text-white bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold disabled:opacity-50"
                style={NO_OUTLINE}
              >
                {starting ? '시작 중...' : '🚀 시작'}
              </button>
            </div>
          </>
        )}

        {/* 진행 중 / 완료 */}
        {jobId && (
          <>
            {/* 진행 단계 표시 */}
            <div className="space-y-1.5 mb-4">
              {PIPELINE_SEQUENCE.map((s, i) => {
                const isDoneEmotion = job?.completedEmotions?.includes(s.key)
                const isCurrent = job?.currentEmotion === s.key
                const isPending = !isDoneEmotion && !isCurrent
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                      isDoneEmotion ? 'bg-green-900/30 border border-green-700/40 text-green-300' :
                      isCurrent ? 'bg-blue-900/40 border border-blue-600/50 text-blue-200' :
                      'bg-gray-800/40 border border-gray-700/30 text-gray-500'
                    }`}
                  >
                    <span className="w-4 text-center flex-shrink-0">
                      {isDoneEmotion ? '✓' : isCurrent ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                        </svg>
                      ) : String(i + 1)}
                    </span>
                    <span className="font-medium">{s.label}</span>
                    {isCurrent && job?.step && (
                      <span className="text-blue-400 text-[10px]">— {STEP_LABEL[job.step] || job.step}</span>
                    )}
                    {s.key === job?.failedEmotion && (
                      <span className="text-red-400 text-[10px] ml-auto">실패</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 로그 */}
            {job?.logs?.length > 0 && (
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 max-h-40 overflow-y-auto mb-4">
                {job.logs.slice(-20).map((l, i) => (
                  <p key={i} className="text-[10px] text-gray-400 font-mono leading-relaxed">{l}</p>
                ))}
              </div>
            )}

            {isFailed && (
              <p className="text-red-400 text-xs mb-3">오류: {job.error}</p>
            )}

            {(isDone || isFailed) && (
              <button onClick={onClose} className="w-full py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl" style={NO_OUTLINE}>
                {isDone ? '✓ 완료 — 닫기' : '닫기'}
              </button>
            )}

            {isRunning && (
              <p className="text-center text-xs text-gray-500">실행 중... 창을 닫아도 서버에서 계속 실행됩니다.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// AI 이미지/영상 생성 — 기존 이미지 선택 → 분석 → 변형 or 영상
// ============================================
const EMOTION_LABEL_MAP = {
  NEUTRAL: '기본', HAPPY: '웃음', ANGRY: '화남', SAD: '슬픔', SHY: '설렘', WORRIED: '걱정',
  SURPRISED: '놀람', ANNOYED: '짜증', PLAYFUL: '장난', EXCITED: '신남',
  AROUSED_TEASE: '도발', AROUSED_TOPLESS: '상의탈의', AROUSED_NUDE: '전라',
  AROUSED_FOREPLAY: '전희', AROUSED_INSERT: '삽입', AROUSED_INSERT_ALT: '삽입(다른자세)',
  AROUSED_CLIMAX: '절정', AROUSED_AFTERGLOW: '여운',
}


// ============================================
// 레퍼런스 선택기 — 단일/일괄 모달 공통
// reference: { profileImage: string|null, baseImages: string[] } | null
// value: 'profile' | 'baseImages'
// onChange: (newValue) => void
// ============================================
function ReferenceSelector({ reference, value, onChange }) {
  if (!reference) {
    return <div className="mb-4 text-[11px] text-gray-500">레퍼런스 정보 확인 중...</div>
  }
  const hasProfile = !!reference.profileImage
  const hasBase = (reference.baseImages || []).length > 0

  if (!hasProfile && !hasBase) {
    return (
      <div className="mb-4 px-3 py-2 bg-red-950/40 border border-red-800/50 rounded-md text-[11px] text-red-300">
        프로필 이미지와 베이스 이미지가 모두 없습니다. AI 생성을 위해 둘 중 하나를 먼저 등록하세요.
      </div>
    )
  }

  const Option = ({ optionKey, label, urls, disabled }) => {
    const selected = value === optionKey
    return (
      <button
        type="button"
        onClick={() => !disabled && onChange(optionKey)}
        disabled={disabled}
        className={`text-left rounded-lg p-2.5 border transition-colors ${
          selected
            ? 'border-fuchsia-500 bg-fuchsia-500/10'
            : disabled
              ? 'border-gray-800 bg-gray-900/30 opacity-50 cursor-not-allowed'
              : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
        }`}
        style={NO_OUTLINE}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={`inline-block w-3 h-3 rounded-full border ${
              selected ? 'bg-fuchsia-400 border-fuchsia-300' : 'border-gray-600'
            }`}
          />
          <span className={`text-[12px] font-medium ${selected ? 'text-fuchsia-200' : 'text-gray-200'}`}>
            {label}
          </span>
          <span className="text-[10px] text-gray-500">({urls.length}장)</span>
        </div>
        {urls.length > 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {urls.map((u, i) => (
              <div key={i} className="w-14 h-14 rounded-md overflow-hidden bg-gray-800 border border-gray-700/60">
                <img src={u} alt={`${optionKey}-${i}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 py-2">등록된 이미지 없음</div>
        )}
      </button>
    )
  }

  return (
    <div className="mb-4">
      <div className="text-[11px] text-gray-400 mb-1.5">레퍼런스 이미지 선택</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Option
          optionKey="profile"
          label="프로필 이미지"
          urls={hasProfile ? [reference.profileImage] : []}
          disabled={!hasProfile}
        />
        <Option
          optionKey="baseImages"
          label="베이스 이미지"
          urls={reference.baseImages || []}
          disabled={!hasBase}
        />
      </div>
    </div>
  )
}

// 디폴트 선택값 결정 — 둘 다 있으면 base, 하나만 있으면 그것, 아무것도 없으면 null
function pickDefaultReferenceSource(reference) {
  if (!reference) return null
  if ((reference.baseImages || []).length > 0) return 'baseImages'
  if (reference.profileImage) return 'profile'
  return null
}

// ============================================
// AI 생성 모달 — Grok image-to-image, 시안(#00FFFF) chroma key 배경 표정 이미지
// 옵션으로 구도/자세 지시문(posePrompt) 입력 가능
// ============================================

function AiExpressionGenerator({ characterId, styleId, emotion, emotionLabel, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { generatedUrl }
  const [posePrompt, setPosePrompt] = useState('')
  const [reference, setReference] = useState(null) // { profileImage, baseImages: [] }
  const [referenceSource, setReferenceSource] = useState(null) // 'profile' | 'baseImages'

  // Chroma key 배경 제거 — 단색 hard cutoff (tolerance 이내는 투명, 초과는 불투명).
  const [bgRemoveEnabled, setBgRemoveEnabled] = useState(true)
  const [tolerance, setTolerance] = useState(80)
  const [processedUrl, setProcessedUrl] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [detectedBg, setDetectedBg] = useState(null)
  const processedBlobRef = useRef(null)
  const processedObjectUrlRef = useRef(null)

  useEffect(() => {
    api
      .get(`/admin/expressions/reference-preview?characterId=${characterId}`)
      .then((ref) => {
        setReference(ref)
        setReferenceSource(pickDefaultReferenceSource(ref))
      })
      .catch(() => setReference({ profileImage: null, baseImages: [] }))
  }, [characterId])

  // 결과 또는 threshold 변경 시 배경 제거 재처리
  useEffect(() => {
    if (!result?.generatedUrl) return
    if (!bgRemoveEnabled) {
      if (processedObjectUrlRef.current) {
        URL.revokeObjectURL(processedObjectUrlRef.current)
        processedObjectUrlRef.current = null
      }
      processedBlobRef.current = null
      setProcessedUrl(null)
      return
    }
    let cancelled = false
    setProcessing(true)
    removeChromaBackground(result.generatedUrl, { tolerance })
      .then(({ blob, bgColor }) => {
        if (cancelled) return
        if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
        const url = URL.createObjectURL(blob)
        processedBlobRef.current = blob
        processedObjectUrlRef.current = url
        setProcessedUrl(url)
        setDetectedBg(bgColor)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '배경 제거 실패')
      })
      .finally(() => {
        if (!cancelled) setProcessing(false)
      })
    return () => {
      cancelled = true
    }
  }, [result?.generatedUrl, bgRemoveEnabled, tolerance])

  // 모달 닫힐 때 ObjectURL 정리
  useEffect(() => {
    return () => {
      if (processedObjectUrlRef.current) URL.revokeObjectURL(processedObjectUrlRef.current)
    }
  }, [])

  const generate = async () => {
    if (!referenceSource) {
      setError('레퍼런스 이미지를 선택하세요.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.post('/admin/expressions/generate', {
        characterId,
        styleId,
        emotion,
        posePrompt: posePrompt.trim(),
        referenceSource,
      })
      setResult(data)
    } catch (err) {
      setError(err.message || '생성 실패')
    } finally {
      setLoading(false)
    }
  }

  // 배경 제거가 활성화돼 있으면 처리된 blob을, 아니면 원본을 가져온다.
  const getSaveBlob = async () => {
    if (bgRemoveEnabled && processedBlobRef.current) return processedBlobRef.current
    const res = await fetch(result.generatedUrl)
    return res.blob()
  }

  const save = async () => {
    if (!result?.generatedUrl) return
    if (bgRemoveEnabled && processing) {
      setError('배경 제거 처리 중입니다. 잠시 후 다시 시도하세요.')
      return
    }
    setSaving(true)
    try {
      const blob = await getSaveBlob()
      const file = new File([blob], `ai-${emotion.toLowerCase()}-${Date.now()}.png`, { type: 'image/png' })
      const fd = new FormData()
      fd.append('image', file)
      fd.append('emotion', emotion)
      fd.append('description', bgRemoveEnabled ? 'AI 생성 (Grok, 배경 제거)' : 'AI 생성 (Grok)')
      const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, fd)
      onSaved(uploaded)
      onClose()
    } catch (err) {
      setError(err.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const download = async () => {
    if (!result?.generatedUrl) return
    try {
      const blob = await getSaveBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ai-${emotion.toLowerCase()}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || '다운로드 실패')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              ✨ AI 표정 생성 — {emotionLabel}{' '}
              <span className="text-gray-500 text-[11px]">({emotion})</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              NEUTRAL(기본) 이미지를 레퍼런스로 Grok이 시안(#00FFFF) 배경 표정 이미지를 생성합니다.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading || saving || !referenceSource}
            className="px-4 py-2 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-md disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {loading ? '생성 중...' : result?.generatedUrl ? '다시 생성' : '생성'}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-[11px] text-gray-400 mb-1.5">구도 / 자세</label>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-md px-3 py-2 text-[11px] text-gray-400 mb-2">
            <span className="text-gray-500">디폴트 (항상 적용):</span> {DEFAULT_COMPOSITION_KO}
          </div>
          <textarea
            value={posePrompt}
            onChange={(e) => setPosePrompt(e.target.value)}
            placeholder="추가 지시 (선택) — 입력 시 디폴트보다 우선합니다. 예: 전신 구도 / 측면 각도 / 손을 흔드는 자세"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 resize-y"
            style={NO_OUTLINE}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        <ReferenceSelector
          reference={reference}
          value={referenceSource}
          onChange={setReferenceSource}
        />

        {(result?.generatedUrl || loading) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-400">생성 결과</div>
              {result?.generatedUrl && (
                <label className="flex items-center gap-2 text-[12px] text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bgRemoveEnabled}
                    onChange={(e) => setBgRemoveEnabled(e.target.checked)}
                    className="accent-fuchsia-500"
                  />
                  배경 제거 (시안)
                  {processing && <span className="text-gray-500">(처리 중...)</span>}
                </label>
              )}
            </div>

            {result?.generatedUrl && bgRemoveEnabled && (
              <div className="mb-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/60 space-y-2">
                <div className="text-[11px] text-gray-400 leading-relaxed">
                  이미지 코너에서 자동 감지한 배경색을 단색 chroma key로 제거합니다. <b className="text-gray-300">허용 오차</b>가 클수록 배경색에서 더 멀어진 픽셀도 같은 배경으로 간주합니다. 캐릭터가 함께 지워지면 낮추세요.
                </div>
                {detectedBg && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <span>감지된 배경색:</span>
                    <span
                      className="inline-block w-4 h-4 rounded border border-gray-600"
                      style={{ backgroundColor: `rgb(${detectedBg.r}, ${detectedBg.g}, ${detectedBg.b})` }}
                    />
                    <span className="font-mono text-gray-500">rgb({detectedBg.r}, {detectedBg.g}, {detectedBg.b})</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-gray-400 w-28 flex-shrink-0">허용 오차 ({tolerance})</label>
                  <input
                    type="range"
                    min={0}
                    max={441}
                    value={tolerance}
                    onChange={(e) => setTolerance(parseInt(e.target.value))}
                    className="flex-1 accent-fuchsia-500"
                  />
                </div>
              </div>
            )}

            <div
              className="rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center"
              style={{
                minHeight: 320,
                // 배경 제거 시 투명 영역 확인용 체커보드, 아니면 원본 시안 배경
                backgroundColor: bgRemoveEnabled ? '#1f2937' : '#00FFFF',
                backgroundImage: bgRemoveEnabled
                  ? 'linear-gradient(45deg, #374151 25%, transparent 25%), linear-gradient(-45deg, #374151 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #374151 75%), linear-gradient(-45deg, transparent 75%, #374151 75%)'
                  : undefined,
                backgroundSize: bgRemoveEnabled ? '16px 16px' : undefined,
                backgroundPosition: bgRemoveEnabled ? '0 0, 0 8px, 8px -8px, -8px 0px' : undefined,
              }}
            >
              {result?.generatedUrl ? (
                bgRemoveEnabled && processedUrl ? (
                  <img src={processedUrl} alt="generated" className="max-w-full max-h-[480px] object-contain" />
                ) : (
                  <img src={result.generatedUrl} alt="generated" className="max-w-full max-h-[480px] object-contain" />
                )
              ) : (
                <div className="text-gray-500 text-sm py-16">{loading ? '생성 중...' : ''}</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            style={NO_OUTLINE}
          >
            닫기
          </button>
          <button
            onClick={download}
            disabled={!result?.generatedUrl || saving || loading}
            className="px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            PC 다운로드
          </button>
          <button
            onClick={save}
            disabled={!result?.generatedUrl || saving || loading}
            className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            style={NO_OUTLINE}
          >
            {saving ? '저장 중...' : '이 이미지로 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 일괄 AI 생성 모달 — SFW emotion을 병렬 생성 + ZIP 다운로드 + 일괄 저장
// NEUTRAL(기본)은 레퍼런스로 쓰이고, ANGRY(화남)는 사용 빈도가 낮아 일괄 생성에서 제외.
// ============================================
const BATCH_EMOTIONS = SFW_EMOTIONS.filter((e) => e.key !== 'NEUTRAL' && e.key !== 'ANGRY')

function BatchExpressionGenerator({ characterId, styleId, characterName, onClose, onSaved }) {
  const [posePrompt, setPosePrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [zipping, setZipping] = useState(false)
  // results: { [emotionKey]: { status: 'idle'|'loading'|'done'|'failed', generatedUrl?, error? } }
  const [results, setResults] = useState({})
  const [reference, setReference] = useState(null)
  const [referenceSource, setReferenceSource] = useState(null)

  // 일괄 생성은 검정 배경으로 바로 받는다. 별도 chroma key 후처리 없음.
  const getEmotionBlob = async (generatedUrl) => {
    const res = await fetch(generatedUrl)
    return res.blob()
  }

  useEffect(() => {
    api
      .get(`/admin/expressions/reference-preview?characterId=${characterId}`)
      .then((ref) => {
        setReference(ref)
        setReferenceSource(pickDefaultReferenceSource(ref))
      })
      .catch(() => setReference({ profileImage: null, baseImages: [] }))
  }, [characterId])

  const doneCount = Object.values(results).filter((r) => r?.status === 'done').length
  const anyLoading = loading || Object.values(results).some((r) => r?.status === 'loading')

  const generate = async () => {
    if (!referenceSource) return
    setLoading(true)
    const initial = {}
    for (const e of BATCH_EMOTIONS) initial[e.key] = { status: 'loading' }
    setResults(initial)

    await Promise.all(
      BATCH_EMOTIONS.map(async (e) => {
        try {
          const data = await api.post('/admin/expressions/generate', {
            characterId,
            styleId,
            emotion: e.key,
            posePrompt: posePrompt.trim(),
            referenceSource,
            background: 'black',
          })
          setResults((prev) => ({
            ...prev,
            [e.key]: { status: 'done', generatedUrl: data.generatedUrl },
          }))
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [e.key]: { status: 'failed', error: err.message || '생성 실패' },
          }))
        }
      }),
    )
    setLoading(false)
  }

  const downloadZip = async () => {
    setZipping(true)
    try {
      const zip = new JSZip()
      for (const e of BATCH_EMOTIONS) {
        const r = results[e.key]
        if (r?.status !== 'done' || !r.generatedUrl) continue
        const blob = await getEmotionBlob(r.generatedUrl)
        zip.file(`${e.key}.png`, blob)
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${characterName || 'expressions'}-${Date.now()}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP 생성 실패:', err)
    } finally {
      setZipping(false)
    }
  }

  const saveAll = async () => {
    setSaving(true)
    const newImages = []
    for (const e of BATCH_EMOTIONS) {
      const r = results[e.key]
      if (r?.status !== 'done' || !r.generatedUrl) continue
      try {
        const blob = await getEmotionBlob(r.generatedUrl)
        const file = new File([blob], `ai-${e.key.toLowerCase()}-${Date.now()}.png`, {
          type: 'image/png',
        })
        const fd = new FormData()
        fd.append('image', file)
        fd.append('emotion', e.key)
        fd.append('description', 'AI 일괄 생성 (Grok, 검정 배경)')
        const { image: uploaded } = await api.post(`/admin/styles/${styleId}/images`, fd)
        newImages.push({ ...uploaded, emotion: e.key })
      } catch (err) {
        console.error(`${e.key} 저장 실패:`, err)
      }
    }
    if (newImages.length) onSaved(newImages)
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-5xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              ✨ 일괄 AI 표정 생성 — {characterName}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              NEUTRAL을 레퍼런스로 {BATCH_EMOTIONS.length}종({BATCH_EMOTIONS.map((e) => e.label).join('·')})을 병렬 생성. 검정 배경.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={anyLoading || saving || !referenceSource}
            className="px-4 py-2 text-sm bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-md disabled:opacity-50"
            style={NO_OUTLINE}
          >
            {anyLoading ? '생성 중...' : doneCount > 0 ? '다시 생성' : `${BATCH_EMOTIONS.length}종 생성`}
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-[11px] text-gray-400 mb-1.5">구도 / 자세 ({BATCH_EMOTIONS.length}종 모두 공통 적용)</label>
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-md px-3 py-2 text-[11px] text-gray-400 mb-2">
            <span className="text-gray-500">디폴트 (항상 적용):</span> {DEFAULT_COMPOSITION_KO}
          </div>
          <textarea
            value={posePrompt}
            onChange={(e) => setPosePrompt(e.target.value)}
            placeholder="추가 지시 (선택) — 입력 시 디폴트보다 우선합니다. 예: 전신 구도 / 측면 각도 / 팔짱 자세"
            rows={2}
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 resize-y"
            style={NO_OUTLINE}
          />
        </div>

        <ReferenceSelector
          reference={reference}
          value={referenceSource}
          onChange={setReferenceSource}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {BATCH_EMOTIONS.map((e) => {
            const r = results[e.key]
            return (
              <div key={e.key} className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
                <div className="px-2.5 py-1.5 flex items-center justify-between bg-gray-800/70">
                  <span className="text-xs text-white">{e.label}</span>
                  <span className="text-[10px] text-gray-500">{e.key}</span>
                </div>
                <div
                  className="aspect-[3/4] flex items-center justify-center"
                  style={{ backgroundColor: '#000000' }}
                >
                  {!r ? (
                    <span className="text-[10px] text-gray-600">대기</span>
                  ) : r.status === 'loading' ? (
                    <span className="text-[10px] text-gray-400 animate-pulse">생성 중...</span>
                  ) : r.status === 'failed' ? (
                    <span
                      className="text-[10px] text-red-400 px-2 text-center"
                      title={r.error}
                    >
                      실패{r.error ? `: ${r.error.slice(0, 40)}` : ''}
                    </span>
                  ) : r.generatedUrl ? (
                    <img src={r.generatedUrl} alt={e.key} className="w-full h-full object-contain" />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving || zipping}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            style={NO_OUTLINE}
          >
            닫기
          </button>
          <button
            onClick={downloadZip}
            disabled={doneCount === 0 || anyLoading || zipping || saving}
            className="px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
            title="완성된 결과만 ZIP으로 묶어 다운로드"
          >
            {zipping ? 'ZIP 생성 중...' : `ZIP 다운로드 (${doneCount})`}
          </button>
          <button
            onClick={saveAll}
            disabled={doneCount === 0 || anyLoading || saving || zipping}
            className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            style={NO_OUTLINE}
          >
            {saving ? '저장 중...' : `모두 저장 (${doneCount})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 배경 탭 — 라이브러리(전역 풀) + 캐릭터별 할당
// ============================================

// 자동 생성 배경은 server/lib/backgroundGen.js가 description을 "[auto] ..." 로 prefix해서 저장.
const isAutoGenerated = (bg) => typeof bg?.description === 'string' && bg.description.startsWith('[auto]')
const stripAutoPrefix = (desc) => (desc || '').replace(/^\[auto\]\s*/, '')

export function BackgroundsTab({ characterId = null } = {}) {
  const [library, setLibrary] = useState(null)
  const [assignments, setAssignments] = useState(null) // [{id, name, profileImage, backgrounds: [{id, order, background:{id,filePath,tags}}]}]
  const [pickerForCharacter, setPickerForCharacter] = useState(null)
  const [libraryDragOver, setLibraryDragOver] = useState(false)
  const [batchUploading, setBatchUploading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all') // 'all' | 'manual' | 'auto'

  const reloadLibrary = () =>
    api.get('/admin/background-library').then(({ items }) => setLibrary(items || []))
  const reloadAssignments = () =>
    api
      .get('/admin/background-assignments-overview')
      .then(({ characters }) => setAssignments(characters || []))

  useEffect(() => {
    reloadLibrary()
    reloadAssignments()
  }, [])

  const handleUpload = async (file, tags) => {
    const fd = new FormData()
    fd.append('image', file)
    fd.append('tags', JSON.stringify(tags))
    await api.post('/admin/background-library', fd)
    await reloadLibrary()
  }

  // 드래그앤드롭: 여러 파일 동시 업로드. 태그는 한 번 prompt로 받아 모든 파일에 공통 적용.
  const handleDropFiles = async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type?.startsWith('image/'))
    if (imageFiles.length === 0) return
    const tagInput = prompt(
      `태그를 콤마(,)로 구분해 입력하세요 (${imageFiles.length}개 파일에 공통 적용. 예: 카페, 실내, 낮)`,
      '',
    )
    if (tagInput === null) return // 취소
    const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    setBatchUploading(true)
    try {
      for (const file of imageFiles) {
        try {
          await handleUpload(file, tags)
        } catch (err) {
          console.error('Background upload error:', err)
        }
      }
    } finally {
      setBatchUploading(false)
    }
  }

  const handleLibraryDragOver = (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    if (!libraryDragOver) setLibraryDragOver(true)
  }
  const handleLibraryDragLeave = (e) => {
    e.preventDefault()
    // 자식 요소 위로 이동한 경우 무시
    if (e.currentTarget.contains(e.relatedTarget)) return
    setLibraryDragOver(false)
  }
  const handleLibraryDrop = async (e) => {
    e.preventDefault()
    setLibraryDragOver(false)
    if (e.dataTransfer?.files?.length) {
      await handleDropFiles(e.dataTransfer.files)
    }
  }

  const handleDeleteLibrary = async (id) => {
    if (!confirm('이 배경 이미지를 라이브러리에서 삭제할까요? 할당된 모든 캐릭터에서도 제거됩니다.')) return
    await api.delete(`/admin/background-library/${id}`)
    await Promise.all([reloadLibrary(), reloadAssignments()])
  }

  const handleUpdateTags = async (id, tags) => {
    await api.patch(`/admin/background-library/${id}`, { tags })
    await reloadLibrary()
  }

  const handleAssign = async (characterId, backgroundIds) => {
    await api.post(`/admin/characters/${characterId}/backgrounds`, { backgroundIds })
    await reloadAssignments()
    setPickerForCharacter(null)
  }

  const handleUnassign = async (characterId, backgroundId) => {
    await api.delete(`/admin/characters/${characterId}/backgrounds/${backgroundId}`)
    await reloadAssignments()
  }

  if (!library || !assignments) return <div className="text-gray-400">로딩 중...</div>

  const autoCount = library.filter(isAutoGenerated).length
  const manualCount = library.length - autoCount
  const filteredLibrary = library.filter((bg) => {
    if (sourceFilter === 'auto') return isAutoGenerated(bg)
    if (sourceFilter === 'manual') return !isAutoGenerated(bg)
    return true
  })

  return (
    <>
      {/* 라이브러리 — 영역 전체가 drop zone */}
      <section
        className={`mb-8 rounded-xl transition-colors ${
          libraryDragOver ? 'bg-amber-500/10 ring-2 ring-amber-500/40 p-3' : ''
        }`}
        onDragOver={handleLibraryDragOver}
        onDragEnter={handleLibraryDragOver}
        onDragLeave={handleLibraryDragLeave}
        onDrop={handleLibraryDrop}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">배경 라이브러리</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              전역 풀 · {library.length}개 (수동 {manualCount} / AI 생성 {autoCount}) · 이미지를 이 영역에 드래그하면 일괄 업로드
              {batchUploading && <span className="ml-2 text-amber-400">업로드 중...</span>}
            </p>
          </div>
          <LibraryUploadButton onUpload={handleUpload} />
        </div>

        <div className="flex gap-1.5 mb-3">
          {[
            { key: 'all', label: '전체', count: library.length },
            { key: 'manual', label: '수동 업로드', count: manualCount },
            { key: 'auto', label: 'AI 생성', count: autoCount },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setSourceFilter(f.key)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                sourceFilter === f.key
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {f.label} · {f.count}
            </button>
          ))}
        </div>

        {filteredLibrary.length === 0 ? (
          <div className="bg-gray-900/60 border border-dashed border-gray-700 rounded-xl p-8 text-center text-sm text-gray-500">
            {library.length === 0
              ? '아직 등록된 배경이 없습니다. 우측 상단 버튼을 누르거나 이미지를 드래그해서 추가하세요.'
              : '이 필터에 해당하는 배경이 없습니다.'}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filteredLibrary.map((bg) => (
              <LibraryCard
                key={bg.id}
                bg={bg}
                onDelete={() => handleDeleteLibrary(bg.id)}
                onUpdateTags={(tags) => handleUpdateTags(bg.id, tags)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 캐릭터별 할당 — 상세 화면(characterId 지정)에서는 해당 캐릭터만 노출 */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-3">캐릭터별 배경 할당</h3>
        <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
          {(characterId ? assignments.filter((c) => c.id === characterId) : assignments).map((c) => (
            <CharacterBackgroundRow
              key={c.id}
              character={c}
              onAddClick={() => setPickerForCharacter(c.id)}
              onUnassign={(bid) => handleUnassign(c.id, bid)}
            />
          ))}
        </div>
      </section>

      {/* 라이브러리 픽커 모달 */}
      {pickerForCharacter && (
        <LibraryPickerModal
          library={library}
          alreadyAssigned={
            new Set(
              (assignments.find((c) => c.id === pickerForCharacter)?.backgrounds || []).map(
                (b) => b.background.id,
              ),
            )
          }
          onClose={() => setPickerForCharacter(null)}
          onConfirm={(ids) => handleAssign(pickerForCharacter, ids)}
        />
      )}
    </>
  )
}

function LibraryUploadButton({ onUpload }) {
  const [uploading, setUploading] = useState(false)
  const trigger = () => {
    if (uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const tagInput = prompt('태그를 콤마(,)로 구분해 입력하세요 (예: 카페, 실내, 낮)', '') || ''
      const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
      setUploading(true)
      try {
        await onUpload(file, tags)
      } catch (err) {
        console.error('Background upload error:', err)
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }
  return (
    <button
      onClick={trigger}
      disabled={uploading}
      className="px-3 py-1.5 rounded-md text-sm bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
      style={NO_OUTLINE}
    >
      {uploading ? '업로드 중...' : '+ 배경 업로드'}
    </button>
  )
}

function LibraryCard({ bg, onDelete, onUpdateTags }) {
  const [editing, setEditing] = useState(false)
  const [tagInput, setTagInput] = useState((bg.tags || []).join(', '))
  const auto = isAutoGenerated(bg)
  const cleanDescription = stripAutoPrefix(bg.description)

  const saveTags = async () => {
    const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean)
    await onUpdateTags(tags)
    setEditing(false)
  }

  return (
    <div className="group relative rounded-lg overflow-hidden bg-gray-800/40 border border-gray-700/50">
      <div className="aspect-[4/3] bg-gray-800 overflow-hidden">
        <img src={bg.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      {auto && (
        <span
          className="absolute top-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-600/90 text-white shadow-sm"
          title={`AI 자동 생성${bg.createdAt ? ` · ${new Date(bg.createdAt).toLocaleString('ko-KR')}` : ''}`}
        >
          AI 생성
        </span>
      )}
      <div className="p-2">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="태그 (콤마 구분)"
              className="w-full text-[11px] bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
              style={NO_OUTLINE}
            />
            <div className="flex gap-1">
              <button
                onClick={saveTags}
                className="flex-1 text-[10px] py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                style={NO_OUTLINE}
              >저장</button>
              <button
                onClick={() => { setEditing(false); setTagInput((bg.tags || []).join(', ')) }}
                className="flex-1 text-[10px] py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                style={NO_OUTLINE}
              >취소</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className="cursor-pointer min-h-[20px]">
            {bg.tags?.length ? (
              <div className="flex flex-wrap gap-1">
                {bg.tags.map((t) => (
                  <span key={t} className="text-[10px] bg-gray-700/60 text-gray-200 px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-gray-500 italic">+ 태그 추가</span>
            )}
          </div>
        )}
        {cleanDescription && (
          <p
            className="text-[10px] text-gray-400 mt-1.5 line-clamp-2 leading-snug"
            title={cleanDescription}
          >
            {cleanDescription}
          </p>
        )}
        <p className="text-[10px] text-gray-500 mt-1.5">{bg._count?.assignments ?? 0}개 캐릭터에 사용 중</p>
      </div>
      <button
        onClick={onDelete}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        style={NO_OUTLINE}
        title="삭제"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function CharacterBackgroundRow({ character, onAddClick, onUnassign }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-[160px]">
        {character.profileImage ? (
          <img src={character.profileImage} alt="" className="w-7 h-7 rounded-full object-cover bg-gray-800" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-800" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{character.name}</p>
          {!character.isPublic && (
            <span className="text-[10px] bg-gray-700 text-gray-300 px-1 py-0.5 rounded">비공개</span>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-wrap items-center gap-2">
        {character.backgrounds.map((b) => (
          <div key={b.background.id} className="relative group">
            <div className="w-14 h-10 rounded-md overflow-hidden bg-gray-800 border border-gray-700/60">
              <img src={b.background.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <button
              onClick={() => onUnassign(b.background.id)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              style={NO_OUTLINE}
              title="해제"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
        <button
          onClick={onAddClick}
          className="w-14 h-10 rounded-md border border-dashed border-gray-600 hover:border-amber-500 text-gray-500 hover:text-amber-400 text-xs"
          style={NO_OUTLINE}
        >
          +
        </button>
      </div>
    </div>
  )
}

function LibraryPickerModal({ library, alreadyAssigned, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set())
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-3xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">라이브러리에서 추가</h3>
          <span className="text-[11px] text-gray-500">{selected.size}개 선택됨</span>
        </div>

        {library.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">라이브러리가 비어 있습니다.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-4">
            {library.map((bg) => {
              const isAssigned = alreadyAssigned.has(bg.id)
              const isSelected = selected.has(bg.id)
              return (
                <button
                  key={bg.id}
                  onClick={() => !isAssigned && toggle(bg.id)}
                  disabled={isAssigned}
                  className={`relative aspect-[4/3] rounded-md overflow-hidden border-2 transition-all ${
                    isAssigned
                      ? 'border-gray-700 opacity-40 cursor-not-allowed'
                      : isSelected
                        ? 'border-amber-500'
                        : 'border-transparent hover:border-gray-500'
                  }`}
                  style={NO_OUTLINE}
                >
                  <img src={bg.filePath} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {isAssigned && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-[10px] text-gray-300">이미 할당됨</span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                  {bg.tags?.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[9px] text-white truncate">{bg.tags.slice(0, 3).join(', ')}</p>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg"
            style={NO_OUTLINE}
          >취소</button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="flex-1 py-2 text-sm text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
            style={NO_OUTLINE}
          >추가 ({selected.size})</button>
        </div>
      </div>
    </div>
  )
}

