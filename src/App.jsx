import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import useStore from './store/useStore'
import { api } from './lib/api'
// Admin
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import AdminCharacters from './pages/admin/Characters'
import CharacterStyles from './pages/admin/CharacterStyles'
import CharacterFeeds from './pages/admin/CharacterFeeds'
import AdminUsers from './pages/admin/Users'

// User
import UserLayout from './pages/user/UserLayout'
import Home from './pages/user/Home'
import CharacterDetail from './pages/user/CharacterDetail'
import ChatList from './pages/user/ChatList'
import Chat from './pages/user/Chat'
import MyPage from './pages/user/MyPage'
import Feed from './pages/user/Feed'
import About from './pages/user/About'
import Terms from './pages/user/Terms'
import MessageNotification from './components/MessageNotification'

function App() {
  const { token, setToken, setUser, clearAuth } = useStore()

  // 네이티브 앱 딥링크 인증 수신
  useEffect(() => {
    window.__handleNativeAuth = (nativeToken, nativeUser) => {
      try {
        setToken(nativeToken)
        setUser(JSON.parse(decodeURIComponent(nativeUser)))
      } catch (e) {
        console.error('Native auth handling failed:', e)
      }
    }
    return () => { delete window.__handleNativeAuth }
  }, [])

  useEffect(() => {
    if (!token) return
    api
      .get('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => clearAuth())
  }, [token])

  return (
    <>
    <MessageNotification />
    <Routes>
      {/* 어드민 */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="characters" element={<AdminCharacters />} />
        <Route path="characters/:id/styles" element={<CharacterStyles />} />
        <Route path="characters/:id/feeds" element={<CharacterFeeds />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      {/* 유저 - 탭바 레이아웃 */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/chats" element={<ChatList />} />
        <Route path="/my" element={<MyPage />} />
      </Route>

      {/* 유저 - 탭바 없는 전체화면 */}
      <Route path="/characters/:id" element={<CharacterDetail />} />
      <Route path="/chats/:id" element={<Chat />} />
      <Route path="/about" element={<About />} />
      <Route path="/terms" element={<Terms />} />
    </Routes>
    </>
  )
}

export default App
