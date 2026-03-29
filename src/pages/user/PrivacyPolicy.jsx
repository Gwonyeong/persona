import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>개인정보처리방침 - Pesona</title>
        <meta name="description" content="Pesona 개인정보처리방침입니다." />
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
        <h1 className="text-lg font-bold">개인정보처리방침</h1>
      </div>

      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">시행일: 2026년 3월 19일</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">1. 개인정보의 수집 항목 및 수집 방법</h2>
            <p className="mb-2">Pesona(이하 "서비스")는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Google 계정 정보: 이름, 이메일 주소, 프로필 사진</li>
              <li>서비스 이용 기록: 대화 내역, 캐릭터 이용 기록</li>
              <li>결제 정보: 구매 내역 (결제 정보 자체는 Google Play에서 관리)</li>
              <li>기기 정보: 푸시 알림 토큰</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">2. 개인정보의 수집 및 이용 목적</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>회원 식별 및 인증</li>
              <li>AI 캐릭터 채팅 서비스 제공</li>
              <li>마스크(가상 재화) 관리</li>
              <li>푸시 알림 발송</li>
              <li>서비스 개선 및 통계 분석</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">3. 개인정보의 보유 및 이용 기간</h2>
            <p>
              이용자의 개인정보는 서비스 이용 기간 동안 보유하며,
              회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에 의해
              보존이 필요한 경우 해당 기간 동안 보관합니다.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>전자상거래 등에서의 소비자보호에 관한 법률: 대금결제 및 재화 등의 공급에 관한 기록 — 5년</li>
              <li>통신비밀보호법: 서비스 이용 관련 기록 — 3개월</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">4. 개인정보의 제3자 제공</h2>
            <p>
              서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
              다만, 다음의 경우에는 예외로 합니다.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">5. 개인정보의 처리 위탁</h2>
            <p>서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>OpenAI: AI 대화 처리 (대화 내용 전송)</li>
              <li>Google Cloud: 인증 및 결제 처리</li>
              <li>Supabase: 파일 저장</li>
              <li>Vercel: 서비스 호스팅</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">6. 이용자의 권리와 행사 방법</h2>
            <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>개인정보 열람 요청</li>
              <li>개인정보 수정 요청</li>
              <li>회원 탈퇴를 통한 개인정보 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">7. 개인정보의 파기</h2>
            <p>
              서비스는 개인정보 보유 기간이 경과하거나 처리 목적이 달성된 경우,
              지체 없이 해당 개인정보를 파기합니다. 전자적 파일 형태의 정보는
              복구할 수 없는 방법으로 영구 삭제합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">8. 개인정보 보호책임자</h2>
            <ul className="list-none space-y-1">
              <li>성명: 조권영</li>
              <li>이메일: busGwonyeong@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">9. 개인정보처리방침의 변경</h2>
            <p>
              이 개인정보처리방침은 법령, 정책 또는 서비스 변경에 따라
              수정될 수 있으며, 변경 시 서비스 내 공지를 통해 안내합니다.
            </p>
          </section>
        </div>

        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">운영자: 조권영</p>
          <p className="text-xs text-gray-500">이메일: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
