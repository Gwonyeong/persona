import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function Refund() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>환불 및 청약철회 규정 | Pesona</title>
        <meta name="description" content="Pesona의 환불, 청약철회, 교환 및 배송 규정을 안내합니다." />
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
        <h1 className="text-lg font-bold">환불 및 청약철회 규정</h1>
      </div>

      {/* 컨텐츠 */}
      <div className="flex-1 px-5 pb-12">
        <p className="text-xs text-gray-500 mb-6">시행일: 2026년 5월 11일</p>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제1조 (목적)</h2>
            <p>본 규정은 파드켓(이하 "회사")이 운영하는 Pesona 서비스에서 유료 상품(LIGHT 구독, 마스크 패키지 등)을 결제한 회원의 청약철회, 환불, 교환에 관한 사항을 「전자상거래 등에서의 소비자보호에 관한 법률」(이하 "전자상거래법") 및 「콘텐츠산업진흥법」에 따라 규정함을 목적으로 합니다.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제2조 (상품의 성격)</h2>
            <p>Pesona에서 판매되는 모든 상품은 디지털 콘텐츠(가상화폐 형태의 "마스크" 및 LIGHT 구독)이며 별도의 실물 배송이 없습니다. 결제 즉시 회원 계정에 콘텐츠가 제공됩니다.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제3조 (청약철회 및 환불)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>회원은 결제일로부터 7일 이내에 다음 각 호에 해당하는 경우 청약철회를 요청할 수 있습니다.
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>결제 후 마스크를 일체 사용하지 않은 경우</li>
                  <li>LIGHT 구독의 경우 결제 후 단 한 번도 유료 콘텐츠를 이용하지 않은 경우</li>
                </ul>
              </li>
              <li>다음 각 호의 경우 「전자상거래법」 제17조 제2항 및 「콘텐츠산업진흥법」 제27조에 따라 청약철회가 제한될 수 있습니다.
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>마스크를 1회라도 사용(채팅 등)한 경우 (사용분에 한하여 환불 불가)</li>
                  <li>LIGHT 구독으로 무료 마스크를 지급받은 경우 또는 구독 전용 콘텐츠를 열람한 경우</li>
                  <li>시간 경과로 인하여 다시 판매하기 곤란하거나 그 가치가 현저히 감소한 경우</li>
                </ul>
              </li>
              <li>회원의 단순 변심에 의한 환불도 위 제1항의 요건을 충족하는 경우 가능합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제4조 (구독 해지 및 환불)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>LIGHT 구독은 Google Play 결제수단을 통해 매월 자동 갱신됩니다. 회원은 언제든지 Google Play 정기결제 메뉴에서 자동 갱신을 해지할 수 있습니다.</li>
              <li>자동 갱신을 해지한 경우, 이미 결제된 회기의 만료일까지 LIGHT 혜택이 유지되며 만료일 이후 자동으로 FREE 등급으로 전환됩니다.</li>
              <li>결제일로부터 7일 이내이며 구독 혜택을 일체 이용하지 않은 경우에 한하여 전액 환불이 가능합니다.</li>
              <li>7일 경과 후에는 일할 계산하여 부분 환불을 요청할 수 없으며, 다음 결제일 전까지 자동 갱신 해지로 처리됩니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제5조 (Google Play 결제 환불 절차)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>모든 결제는 Google Play 인앱결제를 통해 이루어지며, 환불 요청은 다음 두 가지 경로 중 하나로 진행할 수 있습니다.
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Google Play 고객지원 환불 요청 (play.google.com/store/account)</li>
                  <li>회사 고객센터(busGwonyeong@gmail.com)로 환불 요청 메일 발송</li>
                </ul>
              </li>
              <li>회사 고객센터로 요청한 경우, 회사는 영업일 기준 3일 이내에 환불 가능 여부를 검토하여 회신하며, 환불 승인 시 7영업일 이내에 동일 결제수단으로 환불 처리합니다.</li>
              <li>Google Play 환불 정책이 회사 정책에 우선하여 적용될 수 있습니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제6조 (배송에 관한 사항)</h2>
            <p>Pesona의 모든 판매 상품은 디지털 콘텐츠로서 별도의 실물 배송 절차가 존재하지 않습니다. 결제 완료 즉시 회원의 계정에 콘텐츠가 자동 지급됩니다. 따라서 배송비, 배송지연, 배송분실 등에 관한 사항은 적용되지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제7조 (교환에 관한 사항)</h2>
            <p>디지털 콘텐츠의 특성상 동일 상품 간 교환은 적용되지 않습니다. 다만, 회사의 귀책사유로 결제한 콘텐츠가 정상 지급되지 않거나 결함이 있는 경우 다음과 같이 처리합니다.</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>정상 콘텐츠로 재지급 또는 결제 금액 전액 환불</li>
              <li>회사의 귀책사유로 인한 환불의 경우 결제 시점에 관계없이 전액 환불</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제8조 (환불 신청 방법)</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>환불 신청은 busGwonyeong@gmail.com으로 다음 정보를 기재하여 발송합니다.
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>가입 이메일(Google 계정)</li>
                  <li>결제일시 및 결제 상품명</li>
                  <li>Google Play 주문번호</li>
                  <li>환불 사유</li>
                </ul>
              </li>
              <li>신청 접수 후 영업일 기준 3일 이내에 처리 결과를 회신합니다.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">제9조 (분쟁 해결)</h2>
            <p>본 규정과 관련된 분쟁이 발생할 경우 「소비자기본법」에 따른 소비자분쟁해결기준(공정거래위원회 고시)이 적용될 수 있으며, 회사와 회원 간 원만한 협의를 우선합니다.</p>
          </section>
        </div>

        {/* 사업자 정보 */}
        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800 text-xs text-gray-500 space-y-1">
          <p>상호: 파드켓 / 대표자: 조권영</p>
          <p>사업자등록번호: 467-15-02791</p>
          <p>주소: 서울특별시 마포구 월드컵북로6길 19-10</p>
          <p>유선전화: 010-5418-3486</p>
          <p>통신판매신고번호: 2025-서울마포-2857</p>
          <p>이메일: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
