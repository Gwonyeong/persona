import { Routes, Route } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

const LANG_MAP = { ko: 'ko', en: 'en', ja: 'ja' }

function Home() {
  const { t, i18n } = useTranslation()
  const lang = LANG_MAP[i18n.language] || 'ko'

  return (
    <div>
      <Helmet>
        <html lang={lang} />
        <title>{t('home.title')}</title>
        <meta name="description" content={t('home.description')} />
        <meta property="og:title" content={t('home.title')} />
        <meta property="og:description" content={t('home.description')} />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="flex gap-2 p-4">
        {Object.keys(LANG_MAP).map((lng) => (
          <button
            key={lng}
            onClick={() => i18n.changeLanguage(lng)}
            className={`px-3 py-1 rounded ${i18n.language === lng ? 'bg-black text-white' : 'bg-gray-200'}`}
            style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
          >
            {lng.toUpperCase()}
          </button>
        ))}
      </div>
      <h1 className="text-2xl font-bold px-4">{t('home.title')}</h1>
      <p className="px-4 text-gray-600">{t('home.description')}</p>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}

export default App
