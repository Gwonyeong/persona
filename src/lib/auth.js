export const goToLogin = (navigate) => {
  const path = window.location.pathname + window.location.search
  navigate(`/login?returnTo=${encodeURIComponent(path)}`)
}
