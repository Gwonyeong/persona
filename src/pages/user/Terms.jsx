import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function Terms() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>이용약관 - Pesona</title>
        <meta name="description" content="Pesona 서비스 이용약관입니다." />
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
        <h1 className="text-lg font-bold">이용약관</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">시행일: 2026년 3월 19일</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제1조 (목적)</h2>
            <p>
              이 약관은 Pesona(이하 "서비스")가 제공하는 AI 캐릭터 채팅 서비스의 이용과 관련하여
              서비스와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제2조 (정의)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>"서비스"란 Pesona가 제공하는 AI 캐릭터 채팅 플랫폼 및 관련 부가 서비스를 말합니다.</li>
              <li>"이용자"란 이 약관에 따라 서비스를 이용하는 자를 말합니다.</li>
              <li>"마스크"란 서비스 내에서 사용되는 가상 재화를 말합니다.</li>
              <li>"캐릭터"란 서비스에서 제공하는 AI 기반 대화 상대를 말합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제3조 (약관의 효력 및 변경)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.</li>
              <li>서비스는 관련 법령을 위반하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경사유를 명시하여 공지합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제4조 (서비스의 제공)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>서비스는 다음과 같은 기능을 제공합니다.
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>AI 캐릭터와의 대화 서비스</li>
                  <li>캐릭터 탐색 및 검색 기능</li>
                  <li>미션 수행 및 보상 시스템</li>
                  <li>게스트 이용 (제한적)</li>
                </ul>
              </li>
              <li>서비스는 운영상, 기술상의 필요에 따라 제공하는 서비스를 변경할 수 있습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제5조 (회원가입 및 계정)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>회원가입은 Google OAuth 2.0을 통해 진행됩니다.</li>
              <li>이용자는 가입 시 정확한 정보를 제공해야 합니다.</li>
              <li>만 14세 미만은 서비스를 이용할 수 없습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제6조 (마스크 및 가상 재화)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>이용자는 회원가입 시 30개의 마스크를 지급받습니다.</li>
              <li>마스크는 AI 캐릭터와의 대화에 사용됩니다.</li>
              <li>미션 수행을 통해 추가 마스크를 획득할 수 있습니다.</li>
              <li>마스크는 현금으로 환불되지 않습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제7조 (이용자의 의무)</h2>
            <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>서비스의 정상적인 운영을 방해하는 행위</li>
              <li>다른 이용자의 정보를 부정하게 수집, 사용하는 행위</li>
              <li>서비스를 이용하여 법령에 위반되는 행위</li>
              <li>서비스를 비정상적인 방법으로 이용하여 부당한 이익을 취하는 행위</li>
              <li>타인의 권리를 침해하는 콘텐츠를 생성하는 행위</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제8조 (AI 생성 콘텐츠)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>서비스 내 AI 캐릭터의 대화 내용은 인공지능에 의해 생성된 것으로, 사실과 다를 수 있습니다.</li>
              <li>AI가 생성한 콘텐츠에 대한 판단과 활용 책임은 이용자에게 있습니다.</li>
              <li>서비스는 AI 생성 콘텐츠의 정확성, 완전성을 보장하지 않습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제9조 (서비스의 중단)</h2>
            <p>
              서비스는 시스템 점검, 설비 장애, 천재지변 등 불가피한 사유가 발생한 경우
              서비스의 전부 또는 일부를 일시적으로 중단할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제10조 (면책조항)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>서비스는 천재지변 또는 이에 준하는 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</li>
              <li>서비스는 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제11조 (개인정보보호)</h2>
            <p>
              이용자의 개인정보 처리에 관한 사항은 별도의{' '}
              <a href="/privacy" className="text-indigo-400 hover:underline">개인정보처리방침</a>에 따릅니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제12조 (분쟁 해결)</h2>
            <p>
              서비스와 이용자 간에 발생한 분쟁에 관한 소송은 대한민국 법령에 따라 관할 법원에 제소합니다.
            </p>
          </section>
        </div>

        {/* 운영자 정보 */}
        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">운영자: 조권영</p>
          <p className="text-xs text-gray-500">이메일: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
