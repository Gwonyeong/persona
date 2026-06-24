import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Refund() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('refund.metaTitle')}</title>
        <meta name="description" content={t('refund.metaDescription')} />
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
        <h1 className="text-lg font-bold">{t('refund.title')}</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">{t('refund.effectiveDate')}</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art1Title')}</h2>
            <p>{t('refund.art1Body')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art2Title')}</h2>
            <p>{t('refund.art2Body')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art3Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t('refund.art3Item1')}
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>{t('refund.art3Item1Sub1')}</li>
                  <li>{t('refund.art3Item1Sub2')}</li>
                </ul>
              </li>
              <li>{t('refund.art3Item2')}
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>{t('refund.art3Item2Sub1')}</li>
                  <li>{t('refund.art3Item2Sub2')}</li>
                  <li>{t('refund.art3Item2Sub3')}</li>
                </ul>
              </li>
              <li>{t('refund.art3Item3')}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art4Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t('refund.art4Item1')}</li>
              <li>{t('refund.art4Item2')}</li>
              <li>{t('refund.art4Item3')}</li>
              <li>{t('refund.art4Item4')}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art5Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t('refund.art5Item1')}
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>{t('refund.art5Item1Sub1')}</li>
                  <li>{t('refund.art5Item1Sub2')}</li>
                </ul>
              </li>
              <li>{t('refund.art5Item2')}</li>
              <li>{t('refund.art5Item3')}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art6Title')}</h2>
            <p>{t('refund.art6Body')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art7Title')}</h2>
            <p>{t('refund.art7Body')}</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>{t('refund.art7Item1')}</li>
              <li>{t('refund.art7Item2')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art8Title')}</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>{t('refund.art8Item1')}
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>{t('refund.art8Item1Sub1')}</li>
                  <li>{t('refund.art8Item1Sub2')}</li>
                  <li>{t('refund.art8Item1Sub3')}</li>
                  <li>{t('refund.art8Item1Sub4')}</li>
                </ul>
              </li>
              <li>{t('refund.art8Item2')}</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('refund.art9Title')}</h2>
            <p>{t('refund.art9Body')}</p>
          </section>
        </div>

        {/* 사업자 정보 */}
        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800 text-xs text-gray-500 space-y-1">
          <p>{t('refund.bizInfo1')}</p>
          <p>{t('refund.bizInfo2')}</p>
          <p>{t('refund.bizInfo3')}</p>
          <p>{t('refund.bizInfo4')}</p>
          <p>{t('refund.bizInfo5')}</p>
          <p>{t('refund.bizInfo6')}</p>
        </div>
      </div>
    </div>
  )
}
