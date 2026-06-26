import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function DeleteAccountInfo() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>{t('accountDelete.metaTitle')}</title>
        <meta name="description" content={t('accountDelete.metaDescription')} />
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
        <h1 className="text-lg font-bold">{t('accountDelete.title')}</h1>
      </div>

      <div className="flex-1 px-5 pb-12">
        <div className="mb-6">
          <p className="text-xl font-bold text-white">Pesona</p>
          <p className="text-sm text-gray-400 mt-1">{t('accountDelete.tagline')}</p>
        </div>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('accountDelete.howToTitle')}</h2>
            <p className="mb-3">{t('accountDelete.howToIntro')}</p>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-3">
              <p className="text-white font-semibold mb-2">{t('accountDelete.method1Title')}</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>{t('accountDelete.method1Step1')}</li>
                <li>{t('accountDelete.method1Step2')}</li>
                <li>{t('accountDelete.method1Step3')}</li>
                <li>{t('accountDelete.method1Step4')}</li>
              </ol>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-white font-semibold mb-2">{t('accountDelete.method2Title')}</p>
              <p className="text-gray-400">
                {t('accountDelete.method2Body')}
              </p>
              <p className="text-white mt-2">busGwonyeong@gmail.com</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('accountDelete.deletedDataTitle')}</h2>
            <p className="mb-2">{t('accountDelete.deletedDataIntro')}</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>{t('accountDelete.deletedItem1')}</li>
              <li>{t('accountDelete.deletedItem2')}</li>
              <li>{t('accountDelete.deletedItem3')}</li>
              <li>{t('accountDelete.deletedItem4')}</li>
              <li>{t('accountDelete.deletedItem5')}</li>
              <li>{t('accountDelete.deletedItem6')}</li>
              <li>{t('accountDelete.deletedItem7')}</li>
            </ul>
            <p className="text-xs text-red-400 mt-3">{t('accountDelete.deletedWarning')}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">{t('accountDelete.retentionTitle')}</h2>
            <p>
              {t('accountDelete.retentionBody')}
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>{t('accountDelete.retentionItem1')}</li>
              <li>{t('accountDelete.retentionItem2')}</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">{t('accountDelete.footerService')}</p>
          <p className="text-xs text-gray-500">{t('accountDelete.footerOperator')}</p>
          <p className="text-xs text-gray-500">{t('accountDelete.footerEmail')}</p>
        </div>
      </div>
    </div>
  )
}
