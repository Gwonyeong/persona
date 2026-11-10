import { create } from 'zustand'

const useStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  masks: 0,
  subscription: null, // { tier, status, expiresAt, autoRenewing }
  setUser: (user) => set({
    user,
    masks: user?.masks ?? 0,
    subscription: user?.subscription
      ? { ...user.subscription, tier: user.subscriptionTier || 'FREE' }
      : null,
  }),
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  setMasks: (masks) => set({ masks }),
  // 의상 구매권 잔량 (구매 패스 보상). /auth/me 의 user.styleTickets 를 그대로 쓴다.
  setStyleTickets: (styleTickets) =>
    set((s) => ({ user: s.user ? { ...s.user, styleTickets } : s.user })),
  setSubscription: (subscription) => set({ subscription }),
  setSafetyMode: (safetyMode) =>
    set((s) => ({ user: s.user ? { ...s.user, safetyMode } : s.user })),
  setPushEnabled: (pushEnabled) =>
    set((s) => ({ user: s.user ? { ...s.user, pushEnabled } : s.user })),
  setAdultVerified: (verified, verifiedAt = null) =>
    set((s) => ({
      user: s.user
        ? { ...s.user, adultVerified: verified, adultVerifiedAt: verifiedAt ?? s.user.adultVerifiedAt }
        : s.user,
    })),
  clearAuth: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, masks: 0, subscription: null })
  },
}))

export default useStore
