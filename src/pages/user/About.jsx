import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>Pesona - AI 캐릭터 채팅 플랫폼</title>
        <meta name="description" content="Pesona는 감정 기반 AI 캐릭터와 실시간으로 대화할 수 있는 인터랙티브 채팅 플랫폼입니다." />
        <meta property="og:title" content="Pesona - AI 캐릭터 채팅 플랫폼" />
        <meta property="og:description" content="감정 표현이 가능한 AI 캐릭터와 몰입감 있는 대화를 경험하세요." />
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
        <h1 className="text-lg font-bold">서비스 소개</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        {/* 히어로 */}
        <section className="text-center py-8">
          <h2 className="text-3xl font-bold mb-3">Pesona</h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
            감정 표현이 가능한 AI 캐릭터와<br />몰입감 있는 대화를 경험하세요
          </p>
        </section>

        {/* 특징 */}
        <section className="space-y-5 mt-4">
          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">감정 기반 캐릭터</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              각 캐릭터는 10가지 감정 상태(기쁨, 슬픔, 화남, 놀람, 수줍음 등)에 따라
              표정과 스프라이트가 변화합니다. 대화 내용에 맞는 자연스러운 감정 반응으로
              생동감 있는 인터랙션을 제공합니다.
            </p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">다양한 장르의 캐릭터</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              일상/로맨스, 미스테리/RPG, 학원물, 현대 판타지, 무협/시대극 등
              다양한 장르의 독창적인 AI 캐릭터를 만나보세요. 각 캐릭터마다
              고유한 성격과 스토리 컨셉을 가지고 있습니다.
            </p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">실시간 AI 대화</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              최신 AI 기술을 활용한 실시간 스트리밍 대화를 통해 자연스럽고
              몰입감 있는 채팅을 즐기세요. 캐릭터의 성격과 설정에 맞는
              일관된 대화를 경험할 수 있습니다.
            </p>
          </div>

          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="font-semibold text-indigo-400 mb-2">미션 & 보상 시스템</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              각 캐릭터별로 준비된 미션을 수행하고, 보상으로 마스크를 획득하세요.
              ACT별로 구성된 스토리라인을 따라가며 캐릭터와의 관계를
              더욱 깊게 만들어갈 수 있습니다.
            </p>
          </div>
        </section>

        {/* 이용 방법 */}
        <section className="mt-8">
          <h3 className="text-lg font-bold mb-4">이용 방법</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-sm text-gray-300 pt-1">홈 화면에서 마음에 드는 캐릭터를 찾아보세요</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
              <p className="text-sm text-gray-300 pt-1">캐릭터 상세 페이지에서 설정과 첫 메시지를 확인하세요</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
              <p className="text-sm text-gray-300 pt-1">'대화 시작' 버튼을 눌러 AI 캐릭터와 채팅을 즐기세요</p>
            </div>
          </div>
        </section>

        {/* 문의 */}
        <section className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800 text-center">
          <p className="text-sm text-gray-400">
            문의 및 피드백: <a href="mailto:busGwonyeong@gmail.com" className="text-indigo-400 hover:underline">busGwonyeong@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  )
}
