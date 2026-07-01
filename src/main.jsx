import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import './index.css'
import './i18n'

// 로컬(dev)에서만 파비콘·탭 제목을 바꿔 라이브 탭과 육안 구분되게 한다.
// import.meta.env.DEV는 프로덕션 빌드에서 false로 상수 인라인되어 이 블록은 통째로 트리셰이킹된다.
if (import.meta.env.DEV) {
  const devSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
    '<rect width="48" height="48" rx="10" fill="#f59e0b"/>' +
    '<text x="24" y="32" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" text-anchor="middle" fill="#1a1a1a">DEV</text></svg>'
  let link = document.querySelector("link[rel~='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = 'image/svg+xml'
  link.href = 'data:image/svg+xml,' + encodeURIComponent(devSvg)

  // Helmet이 라우트마다 title을 갱신하므로, 접두사가 사라지면 다시 붙인다.
  const PREFIX = '🛠 DEV — '
  const ensurePrefix = () => {
    if (!document.title.startsWith(PREFIX)) {
      document.title = PREFIX + document.title.replace(/^🛠 DEV — /, '')
    }
  }
  ensurePrefix()
  const titleEl = document.querySelector('title')
  if (titleEl) new MutationObserver(ensurePrefix).observe(titleEl, { childList: true })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <HelmetProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </HelmetProvider>
    </Suspense>
  </React.StrictMode>,
)
