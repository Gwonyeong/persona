import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export default function Dashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/admin/stats').then(setData).catch(console.error)
  }, [])

  if (!data) return <div className="p-6 text-gray-400">로딩 중...</div>

  const { stats, popularCharacters } = data

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">대시보드</h2>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: '총 유저', value: stats.userCount },
          { label: '총 캐릭터', value: stats.characterCount },
          { label: '총 대화', value: stats.conversationCount },
          { label: '총 메시지', value: stats.messageCount },
        ].map((item) => (
          <div key={item.label} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">{item.label}</p>
            <p className="text-2xl font-bold mt-1">{item.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold mb-3">인기 캐릭터</h3>
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {popularCharacters.length === 0 ? (
          <p className="p-4 text-gray-500">등록된 캐릭터가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">이름</th>
                <th className="p-3">대화 수</th>
                <th className="p-3">공개</th>
              </tr>
            </thead>
            <tbody>
              {popularCharacters.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 text-sm">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c._count.conversations}</td>
                  <td className="p-3">{c.isPublic ? '공개' : '비공개'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
