import { Helmet } from 'react-helmet-async'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'

export default function Terms() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('terms.pageTitle')}</title>
        <meta name="description" content={t('terms.metaDescription')} />
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
        <h1 className="text-lg font-bold">{t('terms.heading')}</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">{t('terms.effectiveDate')}</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s1Title')}</h2>
            <p>{t('terms.s1Content')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s2Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s2Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s3Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s3Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s4Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                {t('terms.s4Items', { returnObjects: true })[0]}
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  {t('terms.s4Features', { returnObjects: true }).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </li>
              <li>{t('terms.s4Items', { returnObjects: true })[1]}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s5Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s5Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s6Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s6Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s7Title')}</h2>
            <p>{t('terms.s7Content')}</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {t('terms.s7Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s8Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s8Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s9Title')}</h2>
            <p>{t('terms.s9Content')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s10Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              {t('terms.s10Items', { returnObjects: true }).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s11Title')}</h2>
            <p>
              <Trans i18nKey="terms.s11Content" components={{ link: <Link to="/privacy" className="text-indigo-400 hover:underline" /> }} />
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('terms.s12Title')}</h2>
            <p>{t('terms.s12Content')}</p>
          </section>
        </div>

        {/* 운영자 정보 */}
        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">{t('terms.operatorLabel')}: {t('terms.operatorName')}</p>
          <p className="text-xs text-gray-500">{t('terms.emailLabel')}: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
