import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export default function Inquiries() {
  const [inquiries, setInquiries] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (statusFilter) qs.set('status', statusFilter)
    qs.set('page', String(page))
    api.get(`/inquiries/admin/all?${qs.toString()}`).then((data) => {
      setInquiries(data.inquiries)
      setTotalPages(data.totalPages)
      setLoading(false)
    })
  }

  useEffect(() => {
    load()
  }, [statusFilter, page])

  const openDetail = (inq) => {
    setSelected(inq)
    setReplyText(inq.reply || '')
  }

  const closeDetail = () => {
    setSelected(null)
    setReplyText('')
  }

  const submitReply = async () => {
    if (!replyText.trim() || saving) return
    setSaving(true)
    try {
      const { inquiry } = await api.post(`/inquiries/admin/${selected.id}/reply`, {
        reply: replyText.trim(),
      })
      setInquiries((list) => list.map((q) => (q.id === inquiry.id ? { ...q, ...inquiry } : q)))
      setSelected({ ...selected, ...inquiry })
    } catch (err) {
      alert(err.message || '오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">문의 관리</h2>

      <div className="flex gap-2 mb-4">
        {[
          { value: '', label: '전체' },
          { value: 'PENDING', label: '대기' },
          { value: 'ANSWERED', label: '답변완료' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === opt.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {loading ? (
          <p className="p-4 text-gray-500">로딩 중...</p>
        ) : inquiries.length === 0 ? (
          <p className="p-4 text-gray-500">문의가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">상태</th>
                <th className="p-3">유저</th>
                <th className="p-3">제목</th>
                <th className="p-3">작성일</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((q) => (
                <tr key={q.id} className="border-b border-gray-800/50 text-sm">
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        q.status === 'ANSWERED'
                          ? 'bg-indigo-600/20 text-indigo-300'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {q.status === 'ANSWERED' ? '답변완료' : '대기'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="text-gray-200">{q.user?.name || '-'}</div>
                    <div className="text-xs text-gray-500">{q.user?.email}</div>
                  </td>
                  <td className="p-3 text-gray-200">{q.title}</td>
                  <td className="p-3 text-gray-400">
                    {new Date(q.createdAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openDetail(q)}
                      className="text-xs px-3 py-1.5 bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                page === p ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={closeDetail}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">문의 상세</h3>
              <button
                onClick={closeDetail}
                className="text-gray-500 hover:text-gray-300"
                style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">유저</p>
                <p className="text-sm text-gray-200">
                  {selected.user?.name || '-'}{' '}
                  <span className="text-gray-500">({selected.user?.email})</span>
                </p>
              </div>
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">제목</p>
                <p className="text-sm text-gray-100 font-semibold">{selected.title}</p>
              </div>
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-1">내용</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-3">
                  {selected.content}
                </p>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 mb-2">답변</p>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="답변 내용을 입력하세요"
                  rows={6}
                  maxLength={2000}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-600">{replyText.length}/2000</p>
                  <div className="flex gap-2">
                    <button
                      onClick={closeDetail}
                      className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      닫기
                    </button>
                    <button
                      onClick={submitReply}
                      disabled={!replyText.trim() || saving}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-40"
                      style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                    >
                      {saving ? '저장 중...' : selected.status === 'ANSWERED' ? '답변 수정' : '답변 등록'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
