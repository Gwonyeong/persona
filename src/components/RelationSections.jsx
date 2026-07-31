import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import CharacterCard from './CharacterCard'

// 관계 태그별로 캐릭터를 묶어 "제목 + 3열(최대 2줄=6개)" 섹션으로 출력.
// - 관계가 여러 개인 캐릭터는 그중 하나에만 랜덤 배정(중복 노출 방지), 섹션 순서도 매 로드 랜덤.
// - 제목 우측 '더 보기'를 누르면 해당 관계의 전체 캐릭터를 펼쳐 본다.
// - 관계 태그가 없는 캐릭터는 맨 아래 '기타' 섹션에 전량 노출.
const PER_SECTION = 6

function CardGrid({ items, reducedData, safetyMode }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((c) => (
        <CharacterCard key={c.id} character={c} reducedData={reducedData} safetyMode={safetyMode} compact />
      ))}
    </div>
  )
}

function RelationSection({ label, collapsedItems, allItems, reducedData, safetyMode }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const hasMore = allItems.length > collapsedItems.length
  const items = expanded ? allItems : collapsedItems

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-white">{label}</h2>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-200 flex-shrink-0"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {expanded ? t('common.collapse', '접기') : t('common.seeMore', '더 보기')} ›
          </button>
        )}
      </div>
      <CardGrid items={items} reducedData={reducedData} safetyMode={safetyMode} />
    </div>
  )
}

export default function RelationSections({ characters, reducedData, safetyMode }) {
  const { t } = useTranslation()
  const [relationOptions, setRelationOptions] = useState([])

  useEffect(() => {
    api
      .get('/characters/tags')
      .then(({ categories }) => setRelationOptions(categories.find((c) => c.key === 'relation')?.options || []))
      .catch(() => setRelationOptions([]))
  }, [])

  // 관계가 여러 개인 캐릭터는 그중 하나에만 랜덤 배정. characters 갱신 시(=매 로드) 재계산.
  const chosenById = useMemo(() => {
    const map = new Map()
    for (const c of characters || []) {
      const rels = (c.tags || []).filter((tg) => tg.startsWith('relation:'))
      if (rels.length > 0) map.set(c.id, rels[Math.floor(Math.random() * rels.length)])
    }
    return map
  }, [characters])

  // 섹션 목록(+랜덤 순서). collapsed=배정된 것 6개, all=그 관계 태그 전체.
  const sections = useMemo(() => {
    const built = relationOptions
      .map((opt) => ({
        value: opt.value,
        label: opt.label,
        collapsedItems: (characters || []).filter((c) => chosenById.get(c.id) === opt.value).slice(0, PER_SECTION),
        allItems: (characters || []).filter((c) => c.tags?.includes(opt.value)),
      }))
      .filter((s) => s.collapsedItems.length > 0)
    for (let i = built.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[built[i], built[j]] = [built[j], built[i]]
    }
    return built
  }, [relationOptions, characters, chosenById])

  if (!characters?.length) return null

  const untagged = characters.filter((c) => !chosenById.has(c.id))

  return (
    <>
      {sections.map((s) => (
        <RelationSection
          key={s.value}
          label={s.label}
          collapsedItems={s.collapsedItems}
          allItems={s.allItems}
          reducedData={reducedData}
          safetyMode={safetyMode}
        />
      ))}
      {untagged.length > 0 && (
        <div className="mb-5">
          <h2 className="text-lg font-bold text-white mb-2">{t('home.otherCharacters')}</h2>
          <CardGrid items={untagged} reducedData={reducedData} safetyMode={safetyMode} />
        </div>
      )}
    </>
  )
}
