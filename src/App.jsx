import { useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import useStore from './store/useStore'
import { api } from './lib/api'
import { registerPushNotifications } from './lib/push'
// Admin
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import AdminCharacters from './pages/admin/Characters'
import CharacterStyles from './pages/admin/CharacterStyles'
import CharacterFeeds from './pages/admin/CharacterFeeds'
import CharacterGallery from './pages/admin/CharacterGallery'
import AdminUsers from './pages/admin/Users'

// User
import UserLayout from './pages/user/UserLayout'
import Home from './pages/user/Home'
import CharacterDetail from './pages/user/CharacterDetail'
import CharacterFeed from './pages/user/CharacterFeed'
import ChatList from './pages/user/ChatList'
import Chat from './pages/user/Chat'
import MyPage from './pages/user/MyPage'
import Feed from './pages/user/Feed'
import About from './pages/user/About'
import Terms from './pages/user/Terms'
import DeleteAccount from './pages/user/DeleteAccount'
import DeleteAccountInfo from './pages/user/DeleteAccountInfo'
import PrivacyPolicy from './pages/user/PrivacyPolicy'
import Subscription from './pages/user/Subscription'
import FeedbackList from './pages/user/FeedbackList'
import FeedbackDetail from './pages/user/FeedbackDetail'
import FeedbackWrite from './pages/user/FeedbackWrite'
import MessageNotification from './components/MessageNotification'

function App() {
  const { token, setToken, setUser, clearAuth } = useStore()

  const navigate = useNavigate()
  const location = useLocation()

  // Capacitor 네이티브 뒤로가기 버튼 처리
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let appPlugin
    import('@capacitor/app').then(({ App }) => {
      appPlugin = App
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else {
          App.minimizeApp()
        }
      })
    })

    return () => {
      appPlugin?.removeAllListeners()
    }
  }, [])

  // SW 푸시 알림 클릭 → SPA 네비게이션
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.path) {
        const path = event.data.path
        // 채팅 딥링크일 때 뒤로가기가 가능하도록 홈을 먼저 history에 넣음
        if (path.startsWith('/chats/') && window.history.length <= 1) {
          navigate('/', { replace: true })
          setTimeout(() => navigate(path), 0)
        } else {
          navigate(path)
        }
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [navigate])

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
      .then(({ user }) => {
        setUser(user)
        registerPushNotifications()
      })
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
        <Route path="characters/:id/gallery" element={<CharacterGallery />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      {/* 공개 페이지 (인증 불필요) */}
      <Route path="/account/delete-info" element={<DeleteAccountInfo />} />

      {/* 유저 - 탭바 레이아웃 */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/chats" element={<ChatList />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/characters/:id" element={<CharacterDetail />} />
        <Route path="/characters/:id/feed" element={<CharacterFeed />} />
        <Route path="/chats/:id" element={<Chat />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/account/delete" element={<DeleteAccount />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/feedback" element={<FeedbackList />} />
        <Route path="/feedback/:id" element={<FeedbackDetail />} />
        <Route path="/feedback/write" element={<FeedbackWrite />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
