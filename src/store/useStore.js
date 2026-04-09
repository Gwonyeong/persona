import { create } from 'zustand'

const useStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  masks: 0,
  subscription: null, // { tier, status, expiresAt, autoRenewing }
  setUser: (user) => set({
    user,
    masks: user?.masks ?? 0,
    subscription: user?.subscription || null,
  }),
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  setMasks: (masks) => set({ masks }),
  setSubscription: (subscription) => set({ subscription }),
  clearAuth: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, masks: 0, subscription: null })
  },
}))

export default useStore
