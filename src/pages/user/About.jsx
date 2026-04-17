import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function About() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('home.title')}</title>
        <meta name="description" content={t('about.metaDescription')} />
        <meta property="og:title" content={t('home.ogTitle')} />
        <meta property="og:description" content={t('home.ogDescription')} />
      </Helmet>

      {/* 헤더 */}
      <div className="flex items-center p-4">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white mr-3"
          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold">{t('about.title')}</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        {/* 히어로 */}
        <section className="text-center py-8">
          <h2 className="text-3xl font-bold mb-3">Pesona</h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto whitespace-pre-line">
            {t('about.hero')}
          </p>
        </section>

        {/* 특징 */}
        <section className="space-y-5 mt-4">
          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">{t('about.feature1Title')}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{t('about.feature1Desc')}</p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">{t('about.feature2Title')}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{t('about.feature2Desc')}</p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">{t('about.feature3Title')}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{t('about.feature3Desc')}</p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">{t('about.feature4Title')}</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{t('about.feature4Desc')}</p>
          </div>
        </section>

        {/* 이용 방법 */}
        <section className="mt-8">
          <h3 className="text-lg font-bold mb-4">{t('about.howToUse')}</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-sm text-gray-300 pt-1">{t('about.step1')}</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
              <p className="text-sm text-gray-300 pt-1">{t('about.step2')}</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
              <p className="text-sm text-gray-300 pt-1">{t('about.step3')}</p>
            </div>
          </div>
        </section>

        {/* 문의 */}
        <section className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800 text-center">
          <p className="text-sm text-gray-400">
            {t('about.contact')} <a href="mailto:busGwonyeong@gmail.com" className="text-indigo-400 hover:underline">busGwonyeong@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
