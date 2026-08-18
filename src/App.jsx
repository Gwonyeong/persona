import { useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import useStore from './store/useStore'
import { api } from './lib/api'
import { registerPushNotifications } from './lib/push'
import { recoverPendingPurchases } from './lib/purchaseRecovery'
// Admin
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import AdminCharacters from './pages/admin/Characters'
import CharacterStyles from './pages/admin/CharacterStyles'
import CharacterProduction from './pages/admin/CharacterProduction'
import CharacterFeeds from './pages/admin/CharacterFeeds'
import CharacterGallery from './pages/admin/CharacterGallery'
import CharacterGifts from './pages/admin/CharacterGifts'
import CharacterSituations from './pages/admin/CharacterSituations'
import AffinityImages from './pages/admin/AffinityImages'
import BaseImages from './pages/admin/BaseImages'
import Expressions from './pages/admin/Expressions'
import ExpressionDetail from './pages/admin/ExpressionDetail'
import CharacterStorylines from './pages/admin/CharacterStorylines'
import StorylinesOverview from './pages/admin/StorylinesOverview'
import StorylineEdit from './pages/admin/StorylineEdit'
import StoryAnalyticsPremium from './pages/admin/StoryAnalyticsPremium'
import AdminUsers from './pages/admin/Users'
import AdminBanners from './pages/admin/Banners'
import AdminGroupConcepts from './pages/admin/GroupConcepts'
import AdminBroadcasts from './pages/admin/Broadcasts'
import FinancePnl from './pages/admin/FinancePnl'
import FinanceSubscriptions from './pages/admin/FinanceSubscriptions'
import FinanceMaskPurchases from './pages/admin/FinanceMaskPurchases'
import FinanceMaskStats from './pages/admin/FinanceMaskStats'
import AdminInquiries from './pages/admin/Inquiries'
import AdminNotifications from './pages/admin/Notifications'

// User
import UserLayout from './pages/user/UserLayout'
import Home from './pages/user/Home'
import CharacterDetail from './pages/user/CharacterDetail'
import Storyline from './pages/user/Storyline'
import Scenario from './pages/user/Scenario'
import CharacterFeed from './pages/user/CharacterFeed'
import ChatList from './pages/user/ChatList'
import Chat from './pages/user/Chat'
import ChatV2 from './pages/user/ChatV2'
import V2ChatTest from './pages/V2ChatTest'
import ChatSettings from './pages/user/ChatSettings'
import SituationCards from './pages/user/SituationCards'
import VnStory from './pages/user/VnStory'
import GroupChatList from './pages/user/GroupChatList'
import GroupChatCast from './pages/user/GroupChatCast'
import GroupChatNew from './pages/user/GroupChatNew'
import GroupChat from './pages/user/GroupChat'
import GroupChatSettings from './pages/user/GroupChatSettings'
import GroupChatMemory from './pages/user/GroupChatMemory'
import GroupChatMembers from './pages/user/GroupChatMembers'
import MyPage from './pages/user/MyPage'
import CharacterCollection from './pages/user/CharacterCollection'
import AdultVerify from './pages/user/AdultVerify'
import Login from './pages/user/Login'
import About from './pages/user/About'
import Terms from './pages/user/Terms'
import Refund from './pages/user/Refund'
import DeleteAccount from './pages/user/DeleteAccount'
import DeleteAccountInfo from './pages/user/DeleteAccountInfo'
import PrivacyPolicy from './pages/user/PrivacyPolicy'
import MaskShop from './pages/user/MaskShop'
import PgTest from './pages/user/PgTest'
import FeedbackList from './pages/user/FeedbackList'
import FeedbackDetail from './pages/user/FeedbackDetail'
import FeedbackWrite from './pages/user/FeedbackWrite'
import InquiryList from './pages/user/InquiryList'
import InquiryDetail from './pages/user/InquiryDetail'
import InquiryWrite from './pages/user/InquiryWrite'
import UserNotifications from './pages/user/Notifications'
import UserNotificationDetail from './pages/user/NotificationDetail'
import Survey from './pages/user/Survey'
import AdminSurveys from './pages/admin/AdminSurveys'
import AdminMaskPass from './pages/admin/AdminMaskPass'
import AdminCharacterProfileVariants from './pages/admin/AdminCharacterProfileVariants'
import AdminGacha from './pages/admin/AdminGacha'
import AdminSpecialVoices from './pages/admin/AdminSpecialVoices'
import MaskPass from './pages/user/MaskPass'
import Gacha from './pages/user/Gacha'
import GachaBox from './pages/user/GachaBox'
import MessageNotification from './components/MessageNotification'
import WelcomeMaskSheet from './components/WelcomeMaskSheet'
import ImpersonationBanner from './components/ImpersonationBanner'

function App() {
  const { token, setToken, setUser, clearAuth } = useStore()
  const { i18n } = useTranslation()

  const navigate = useNavigate()

  // html lang 속성을 i18n 언어와 동기화
  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  // GA4 설정: 앱/웹 구분 + 로그인 유저 식별
  useEffect(() => {
    if (!window.gtag) return
    const isApp = Capacitor.isNativePlatform()
    window.gtag('set', { traffic_type: isApp ? 'app' : 'web' })
  }, [])

  useEffect(() => {
    if (!window.gtag) return
    const user = useStore.getState().user
    window.gtag('set', { user_id: user?.id || undefined })
  }, [token])

  // GA4 SPA 페이지뷰는 스트림의 향상된 측정(브라우저 기록 이벤트)이 처리한다.
  // 여기서 page_view를 직접 쏘면 같은 조회가 두 번 잡히므로 보내지 않는다.

  // Capacitor 네이티브 뒤로가기 버튼 처리
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let appPlugin
    import('@capacitor/app').then(({ App }) => {
      appPlugin = App
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else if (/^\/chats\/[^/]+$/.test(window.location.pathname)) {
          navigateRef.current('/chats', { replace: true })
        } else if (/^\/group-chats\/.+/.test(window.location.pathname)) {
          navigateRef.current('/group-chats', { replace: true })
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
    window.__handleNativeAuth = (nativeToken, nativeUser, isNewUserFlag) => {
      try {
        setToken(nativeToken)
        setUser(JSON.parse(decodeURIComponent(nativeUser)))
        if (isNewUserFlag === '1' || isNewUserFlag === 1 || isNewUserFlag === true) {
          window.gtag?.('event', 'sign_up', { method: 'google_webview' })
          const conv = import.meta.env.VITE_GADS_CONVERSION_SIGNUP
          if (conv) window.gtag?.('event', 'conversion', { send_to: conv })
        }
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

  // 지급되지 않은 결제 복구.
  // 결제는 성공했는데 검증 요청이 서버에 닿지 못하면 마스크가 들어가지 않는다.
  // 예전에는 마스크 상점을 다시 열어야만 복구됐는데, 그걸 기다리지 않고
  // 앱을 켤 때마다 확인한다.
  useEffect(() => {
    if (!token) return
    recoverPendingPurchases().catch(() => {})
  }, [token])

  return (
    <>
    <MessageNotification />
    <ImpersonationBanner />
    <Routes>
      {/* 어드민 */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="characters" element={<AdminCharacters />} />
        <Route path="base-images" element={<BaseImages />} />
        <Route path="affinity-images" element={<AffinityImages />} />
        <Route path="expressions" element={<Expressions />} />
        <Route path="expressions/:characterId" element={<ExpressionDetail />} />
        <Route path="characters/:id/production" element={<CharacterProduction />} />
        <Route path="characters/:id/styles" element={<CharacterStyles />} />
        <Route path="characters/:id/feeds" element={<CharacterFeeds />} />
        <Route path="characters/:id/gallery" element={<CharacterGallery />} />
        <Route path="characters/:id/gifts" element={<CharacterGifts />} />
        <Route path="characters/:id/situations" element={<CharacterSituations />} />
        <Route path="characters/:id/storylines" element={<CharacterStorylines />} />
        <Route path="characters/:id/profile-variants" element={<AdminCharacterProfileVariants />} />
        <Route path="mask-pass" element={<AdminMaskPass />} />
        <Route path="gacha" element={<AdminGacha />} />
        <Route path="gacha/special-voices" element={<AdminSpecialVoices />} />
        <Route path="storylines" element={<StorylinesOverview />} />
        <Route path="storylines/analytics/premium" element={<StoryAnalyticsPremium />} />
        <Route path="storylines/:id" element={<StorylineEdit />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="group-concepts" element={<AdminGroupConcepts />} />
        <Route path="broadcasts" element={<AdminBroadcasts />} />
        <Route path="finance/pnl" element={<FinancePnl />} />
        <Route path="finance/subscriptions" element={<FinanceSubscriptions />} />
        <Route path="finance/mask-purchases" element={<FinanceMaskPurchases />} />
        <Route path="finance/mask-stats" element={<FinanceMaskStats />} />
        <Route path="inquiries" element={<AdminInquiries />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="surveys" element={<AdminSurveys />} />
      </Route>

      {/* 공개 페이지 (인증 불필요) */}
      <Route path="/account/delete-info" element={<DeleteAccountInfo />} />

      {/* 로그인 페이지 (풀스크린, 탭바 없음) */}
      <Route path="/login" element={<Login />} />

      {/* 스토리 플레이어 (풀스크린, 탭바 없음) */}
      <Route path="/storylines/:id" element={<Storyline />} />

      {/* V2 채팅 테스트 (풀스크린, 탭바 없음, 임시) */}
      <Route path="/v2-test/:id" element={<V2ChatTest />} />

      {/* PG 검수용 웹 전용 테스트 결제 (앱에서는 차단됨, 네비게이션 미노출) */}
      <Route path="/pg-test" element={<PgTest />} />

      {/* 유저 - 탭바 레이아웃 */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/feed" element={<Navigate to="/group-chats" replace />} />
        <Route path="/group-chats" element={<GroupChatList />} />
        <Route path="/group-chats/cast/:conceptId" element={<GroupChatCast />} />
        <Route path="/chats" element={<ChatList />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/collection/:characterId" element={<CharacterCollection />} />
        <Route path="/adult-verify" element={<AdultVerify />} />
        <Route path="/characters/:id" element={<CharacterDetail />} />
        <Route path="/characters/:id/feed" element={<CharacterFeed />} />
        <Route path="/scenarios/:id" element={<Scenario />} />
        <Route path="/chats/:id" element={<Chat />} />
        <Route path="/chats-v2/:id" element={<ChatV2 />} />
        <Route path="/chats/:id/settings" element={<ChatSettings />} />
        <Route path="/chats/:id/situations" element={<SituationCards />} />
        <Route path="/vn/:id" element={<VnStory />} />
        <Route path="/group-chats/new" element={<GroupChatNew />} />
        <Route path="/group-chats/:id" element={<GroupChat />} />
        <Route path="/group-chats/:id/settings" element={<GroupChatSettings />} />
        <Route path="/group-chats/:id/memory" element={<GroupChatMemory />} />
        <Route path="/group-chats/:id/members" element={<GroupChatMembers />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/account/delete" element={<DeleteAccount />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        {/* /subscription 은 마스크 상점 구독 탭으로 통합됨 — 기존 딥링크 호환용 리다이렉트 */}
        <Route path="/subscription" element={<Navigate to="/mask-shop?tab=subscription" replace />} />
        <Route path="/mask-shop" element={<MaskShop />} />
        <Route path="/mask-pass" element={<MaskPass />} />
        <Route path="/gacha" element={<Gacha />} />
        <Route path="/gacha/:id" element={<GachaBox />} />
        <Route path="/feedback" element={<FeedbackList />} />
        <Route path="/feedback/:id" element={<FeedbackDetail />} />
        <Route path="/feedback/write" element={<FeedbackWrite />} />
        <Route path="/inquiry" element={<InquiryList />} />
        <Route path="/inquiry/:id" element={<InquiryDetail />} />
        <Route path="/inquiry/write" element={<InquiryWrite />} />
        <Route path="/notifications" element={<UserNotifications />} />
        <Route path="/notifications/:id" element={<UserNotificationDetail />} />
        <Route path="/survey/:id" element={<Survey />} />
      </Route>
    </Routes>
    <WelcomeMaskSheet />
    </>
  )
}

export default App
