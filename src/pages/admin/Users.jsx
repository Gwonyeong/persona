import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

export default function Users() {
  const [users, setUsers] = useState([])

  useEffect(() => {
    api.get('/admin/users').then(({ users }) => setUsers(users))
  }, [])

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">유저 관리</h2>

      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {users.length === 0 ? (
          <p className="p-4 text-gray-500">유저가 없습니다.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="p-3">ID</th>
                <th className="p-3">이름</th>
                <th className="p-3">이메일</th>
                <th className="p-3">역할</th>
                <th className="p-3">대화 수</th>
                <th className="p-3">가입일</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-800/50 text-sm">
                  <td className="p-3 text-gray-500">{u.id}</td>
                  <td className="p-3">{u.name || '-'}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <span className={u.role === 'ADMIN' ? 'text-indigo-400' : 'text-gray-400'}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">{u._count.conversations}</td>
                  <td className="p-3 text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
