import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function PrivacyPolicy() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('privacy.pageTitle')}</title>
        <meta name="description" content={t('privacy.metaDescription')} />
      </Helmet>

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
        <h1 className="text-lg font-bold">{t('privacy.heading')}</h1>
      </div>

      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">{t('privacy.effectiveDate')}</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s1Title')}</h2>
            <p className="mb-2">{t('privacy.s1Content')}</p>
            <ul className="list-disc list-inside space-y-1">
              {t('privacy.s1Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s2Title')}</h2>
            <ul className="list-disc list-inside space-y-1">
              {t('privacy.s2Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s3Title')}</h2>
            <p>{t('privacy.s3Content')}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {t('privacy.s3Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s4Title')}</h2>
            <p>{t('privacy.s4Content')}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {t('privacy.s4Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s5Title')}</h2>
            <p>{t('privacy.s5Content')}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {t('privacy.s5Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s6Title')}</h2>
            <p>{t('privacy.s6Content')}</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {t('privacy.s6Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s7Title')}</h2>
            <p>{t('privacy.s7Content')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s8Title')}</h2>
            <ul className="list-none space-y-1">
              <li>{t('privacy.s8NameLabel')}: {t('privacy.s8Name')}</li>
              <li>{t('privacy.s8EmailLabel')}: busGwonyeong@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('privacy.s9Title')}</h2>
            <p>{t('privacy.s9Content')}</p>
          </section>
        </div>

        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">{t('privacy.operatorLabel')}: {t('privacy.operatorName')}</p>
          <p className="text-xs text-gray-500">{t('privacy.emailLabel')}: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
