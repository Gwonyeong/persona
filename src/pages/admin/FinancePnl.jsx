import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'

// 손익(P&L) — 수익(마스크 당월 실적 + 구독 MRR) − 인프라 원가 = 영업이익.
// 마케팅비는 껐다 켤 수 있는 성장 투자라 영업이익과 분리해 아래에서 따로 뺀다.

const CATEGORY_META = {
  FIXED: { label: '고정비', hint: '사용량과 무관한 정액' },
  VARIABLE: { label: '변동비', hint: '사용량 비례' },
  MARKETING: { label: '마케팅', hint: '성장 투자 — 영업이익과 분리' },
}

const won = (n) => `₩${Math.round(n || 0).toLocaleString('ko-KR')}`
const usd = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

function monthOptions(count = 12) {
  const out = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function Row({ label, value, sub, bold, positive, divider, indent }) {
  const color = positive === undefined ? '' : positive ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div
      className={`flex items-baseline justify-between py-2 ${divider ? 'border-t border-gray-800' : ''}`}
      style={indent ? { paddingLeft: 12 } : undefined}
    >
      <div className="min-w-0">
        <span className={`${bold ? 'font-semibold text-white' : 'text-gray-300'} text-sm`}>{label}</span>
        {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
      </div>
      <span
        className={`tabular-nums flex-shrink-0 ml-3 ${bold ? 'text-base font-bold' : 'text-sm'} ${color || 'text-gray-100'}`}
      >
        {value}
      </span>
    </div>
  )
}

// 원가·수익 항목의 편집 폼이 동일해 하나로 쓴다.
// USD로 정산되는 항목은 달러 값을, 원화 항목은 원 값을 받는다 (저장된 통화를 그대로 유지).
function ItemEditor({ item, badge, onChange, onSave, saving }) {
  const isUsd = item.amountUsd !== '' && item.amountUsd !== null
  return (
    <div className="mb-3 bg-gray-900 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white font-medium">{item.label}</span>
        <span className="text-[10px] text-gray-500">{badge}</span>
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex-1">
          <span className="text-[11px] text-gray-400 block mb-1">{isUsd ? 'USD' : '원'}</span>
          <input
            type="number"
            value={isUsd ? item.amountUsd : item.amountKrw}
            onChange={(e) => onChange(isUsd ? { amountUsd: e.target.value } : { amountKrw: e.target.value })}
            className="w-full bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-2 border border-gray-700"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          />
        </label>
        <label className="flex flex-col items-center pb-2">
          <span className="text-[11px] text-gray-400 mb-1">사용</span>
          <input type="checkbox" checked={item.active} onChange={(e) => onChange({ active: e.target.checked })} />
        </label>
        <button
          onClick={onSave}
          disabled={saving}
          className="text-xs text-white bg-indigo-600 px-3 py-2 rounded-lg disabled:opacity-50"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          저장
        </button>
      </div>
      {item.note && <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{item.note}</p>}
    </div>
  )
}

function Card({ title, right, children }) {
  return (
    <section className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function FinancePnl() {
  const months = useMemo(() => monthOptions(12), [])
  const [month, setMonth] = useState(months[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState([])
  const [revItems, setRevItems] = useState([])
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async (m) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/admin/finance/pnl?month=${m}`)
      setData(res)
      setRate(String(res.cost.usdToKrw))
    } catch (e) {
      setError(e.message || '불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(month)
  }, [month])

  const openEditor = async () => {
    const [costRes, revRes] = await Promise.all([
      api.get('/admin/finance/costs'),
      api.get(`/admin/finance/revenues?month=${month}`),
    ])
    const norm = (it) => ({ ...it, amountUsd: it.amountUsd ?? '', amountKrw: it.amountKrw ?? 0 })
    setItems(costRes.items.map(norm))
    setRevItems(revRes.items.map(norm))
    setEditing(true)
  }

  const saveRevenue = async (it) => {
    setSaving(true)
    try {
      await api.put(`/admin/finance/revenues/${it.id}`, {
        label: it.label,
        month: it.month,
        amountKrw: it.amountKrw,
        amountUsd: it.amountUsd === '' ? null : it.amountUsd,
        vendor: it.vendor,
        note: it.note,
        active: it.active,
        sortOrder: it.sortOrder,
      })
      await load(month)
    } finally {
      setSaving(false)
    }
  }

  const saveItem = async (it) => {
    setSaving(true)
    try {
      await api.put(`/admin/finance/costs/${it.id}`, {
        label: it.label,
        category: it.category,
        amountKrw: it.amountKrw,
        amountUsd: it.amountUsd === '' ? null : it.amountUsd,
        vendor: it.vendor,
        note: it.note,
        active: it.active,
        sortOrder: it.sortOrder,
      })
      await load(month)
    } finally {
      setSaving(false)
    }
  }

  const saveRate = async () => {
    setSaving(true)
    try {
      await api.put('/admin/finance/costs-config', { usdToKrw: Number(rate) })
      await load(month)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-4 text-gray-400 text-sm">불러오는 중…</div>
  if (error) return <div className="p-4 text-rose-400 text-sm">{error}</div>
  if (!data) return null

  const { revenue, cost, profit, monthProgress: prog } = data
  const inProgress = prog > 0 && prog < 1
  const pct = Math.round(prog * 100)

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">손익</h1>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-1.5 border border-gray-700"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {inProgress && (
        <div className="mb-4 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
          당월 진행 중 ({pct}% 경과) — 마스크는 현재까지 실적이고, 괄호 안은 이 속도가 유지될 때의 월말 예상치입니다.
        </div>
      )}

      <Card title="수익 (실입금 기준)">
        <Row
          label="마스크 판매"
          sub={`${revenue.maskCount.toLocaleString('ko-KR')}건 · 결제액 ${won(revenue.maskGrossKrw)}`}
          value={inProgress ? `${won(revenue.maskNetKrw)} (${won(revenue.maskProjectedNetKrw)})` : won(revenue.maskNetKrw)}
        />
        <Row
          label="구독 MRR"
          sub={`유료 ${revenue.subscription.payingCount}명 (신규가 ${revenue.subscription.payingNewCount} / 기존가 ${revenue.subscription.payingOldCount})${
            revenue.subscription.trialCount ? ` · 체험 ${revenue.subscription.trialCount}` : ''
          }`}
          value={won(revenue.subscriptionNetKrw)}
        />
        {(revenue.otherItems || []).map((it) => (
          <Row
            key={it.id}
            label={it.label}
            sub={
              it.amountUsd != null
                ? `${usd(it.amountUsd)} × ₩${cost.usdToKrw}${it.recurring ? ' · 매월' : ''}`
                : it.vendor || (it.recurring ? '매월' : undefined)
            }
            value={
              inProgress && !it.recurring
                ? `${won(it.amountKrw)} (${won(it.projectedKrw)})`
                : won(it.amountKrw)
            }
          />
        ))}
        <Row
          label="수익 합계"
          value={inProgress ? `${won(revenue.totalNetKrw)} (${won(revenue.projectedTotalNetKrw)})` : won(revenue.totalNetKrw)}
          bold
          divider
        />
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Google 수수료 {Math.round(data.meta.playStoreFeeRate * 100)}%를 뺀 실입금액. 구독은 결제 기록이 남지 않아 현재 MRR
          기준입니다.
        </p>
      </Card>

      <Card
        title="원가"
        right={
          <button
            onClick={openEditor}
            className="text-[11px] text-indigo-400 px-2 py-1 rounded-md bg-indigo-500/10"
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            편집
          </button>
        }
      >
        {['FIXED', 'VARIABLE'].map((cat) => (
          <div key={cat} className="mb-2">
            <div className="text-[11px] text-gray-500 mb-1 mt-2">
              {CATEGORY_META[cat].label} · {CATEGORY_META[cat].hint}
            </div>
            {cost.groups[cat].map((it) => (
              <Row
                key={it.id}
                indent
                label={it.label}
                sub={it.amountUsd != null ? `${usd(it.amountUsd)} × ₩${cost.usdToKrw}` : it.vendor || undefined}
                value={won(it.amountKrw)}
              />
            ))}
            {cost.groups[cat].length === 0 && <div className="text-xs text-gray-600 py-2 pl-3">항목 없음</div>}
          </div>
        ))}
        <Row label="인프라 원가 합계" value={won(cost.infraTotalKrw)} bold divider />
      </Card>

      <Card title="이익">
        <Row
          label="영업이익"
          sub="수익 − 인프라 원가 (마케팅 제외)"
          value={
            inProgress
              ? `${won(profit.operatingProfitKrw)} (${won(profit.projectedOperatingProfitKrw)})`
              : won(profit.operatingProfitKrw)
          }
          bold
          positive={profit.operatingProfitKrw >= 0}
        />
        {profit.operatingMarginPct != null && (
          <Row label="영업이익률" value={`${profit.operatingMarginPct.toFixed(1)}%`} />
        )}
        <div className="mt-3 pt-1">
          {cost.groups.MARKETING.map((it) => (
            <Row key={it.id} indent label={it.label} sub="성장 투자 — 끄면 지출이 사라집니다" value={`− ${won(it.amountKrw)}`} />
          ))}
          <Row
            label="최종 순이익"
            sub="영업이익 − 마케팅"
            value={inProgress ? `${won(profit.netProfitKrw)} (${won(profit.projectedNetProfitKrw)})` : won(profit.netProfitKrw)}
            bold
            divider
            positive={profit.netProfitKrw >= 0}
          />
        </div>
      </Card>

      {editing && (
        <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,.6)' }}>
          <div
            className="w-full bg-gray-950 rounded-t-2xl border-t border-gray-800 overflow-y-auto"
            style={{ maxWidth: 480, maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sticky top-0 bg-gray-950 px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">원가 편집</h3>
              <button
                onClick={() => {
                  setEditing(false)
                  load(month)
                }}
                className="text-xs text-gray-400 px-2 py-1"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                닫기
              </button>
            </div>

            <div className="p-4">
              <div className="mb-4 bg-gray-900 rounded-lg p-3 border border-gray-800">
                <label className="text-[11px] text-gray-400 block mb-1">환율 (₩ / $1)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="flex-1 bg-gray-800 text-gray-100 text-sm rounded-lg px-3 py-2 border border-gray-700"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  />
                  <button
                    onClick={saveRate}
                    disabled={saving}
                    className="text-xs text-white bg-indigo-600 px-3 rounded-lg disabled:opacity-50"
                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    저장
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">USD 항목은 이 환율로 매번 다시 환산됩니다.</p>
              </div>

              <div className="text-[11px] text-gray-400 mb-2">원가</div>
              {items.map((it, idx) => (
                <ItemEditor
                  key={it.id}
                  item={it}
                  badge={CATEGORY_META[it.category]?.label}
                  saving={saving}
                  onChange={(patch) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))}
                  onSave={() => saveItem(it)}
                />
              ))}

              <div className="text-[11px] text-gray-400 mb-2 mt-5">기타 수익</div>
              {revItems.length === 0 && (
                <div className="text-xs text-gray-600 pb-2">이 달의 수익 항목이 없습니다.</div>
              )}
              {revItems.map((it, idx) => (
                <ItemEditor
                  key={it.id}
                  item={it}
                  badge={it.month || '매월'}
                  saving={saving}
                  onChange={(patch) => setRevItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))}
                  onSave={() => saveRevenue(it)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
