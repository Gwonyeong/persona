import { Helmet } from 'react-helmet-async'
import { useNavigate } from 'react-router-dom'

export default function DeleteAccountInfo() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      <Helmet>
        <title>계정 삭제 안내 - Pesona</title>
        <meta name="description" content="Pesona 계정 삭제 안내 페이지입니다." />
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
        <h1 className="text-lg font-bold">계정 삭제 안내</h1>
      </div>

      <div className="flex-1 px-5 pb-12">
        <div className="mb-6">
          <p className="text-xl font-bold text-white">Pesona</p>
          <p className="text-sm text-gray-400 mt-1">AI 캐릭터 채팅 서비스</p>
        </div>

        <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">계정 삭제 방법</h2>
            <p className="mb-3">Pesona 계정을 삭제하려면 다음 방법 중 하나를 이용해 주세요.</p>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-3">
              <p className="text-white font-semibold mb-2">방법 1: 앱 내에서 삭제</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-400">
                <li>Pesona 앱을 실행합니다.</li>
                <li>하단 탭에서 마이페이지를 선택합니다.</li>
                <li>"회원 탈퇴"를 선택합니다.</li>
                <li>안내 사항을 확인한 후 삭제를 진행합니다.</li>
              </ol>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-white font-semibold mb-2">방법 2: 이메일로 요청</p>
              <p className="text-gray-400">
                아래 이메일로 계정에 등록된 이메일 주소와 함께 삭제 요청을 보내주세요. 요청 접수 후 영업일 기준 3일 이내에 처리됩니다.
              </p>
              <p className="text-white mt-2">busGwonyeong@gmail.com</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">삭제되는 데이터</h2>
            <p className="mb-2">계정 삭제 시 다음 데이터가 영구적으로 삭제됩니다.</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>프로필 정보 (닉네임, 프로필 사진)</li>
              <li>모든 대화 내역 및 캐릭터 친밀도</li>
              <li>보유 마스크 (가상 재화)</li>
              <li>북마크, 팔로우, 알림 설정</li>
              <li>피드 좋아요 및 댓글</li>
              <li>갤러리 잠금 해제 기록</li>
              <li>구독 정보</li>
            </ul>
            <p className="text-xs text-red-400 mt-3">삭제된 데이터는 복구할 수 없습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-100 mb-2">데이터 보존 기간</h2>
            <p>
              계정 삭제 요청 시 개인정보는 지체 없이 파기됩니다. 단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>대금결제 및 재화 등의 공급에 관한 기록 — 5년</li>
              <li>서비스 이용 관련 기록 — 3개월</li>
            </ul>
          </section>
        </div>

        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs text-gray-500">서비스명: Pesona</p>
          <p className="text-xs text-gray-500">운영자: 조권영</p>
          <p className="text-xs text-gray-500">이메일: busGwonyeong@gmail.com</p>
        </div>
      </div>
    </div>
  )
}
