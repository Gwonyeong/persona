import { create } from 'zustand'

const useStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  masks: 0,
  setUser: (user) => set({ user, masks: user?.masks ?? 0 }),
  setToken: (token) => {
    localStorage.setItem('token', token)
    set({ token })
  },
  setMasks: (masks) => set({ masks }),
  clearAuth: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, masks: 0 })
  },
}))

export default useStore
