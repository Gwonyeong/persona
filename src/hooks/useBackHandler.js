import { useEffect, useRef } from 'react'

/**
 * 모달/오버레이가 열려 있을 때 기기 뒤로가기를 누르면 모달을 닫아주는 훅.
 * isOpen이 true가 되면 history에 state를 push하고,
 * popstate(뒤로가기) 발생 시 onClose를 호출한다.
 */
export default function useBackHandler(isOpen, onClose) {
  const closeFnRef = useRef(onClose)
  closeFnRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    // 모달이 열릴 때 더미 history entry를 push
    const stateKey = `modal-${Date.now()}`
    window.history.pushState({ modal: stateKey }, '')

    const handlePopState = () => {
      closeFnRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      // 모달이 닫힐 때(isOpen → false), 우리가 push한 history entry가 아직 남아있으면 제거
      if (window.history.state?.modal === stateKey) {
        window.history.back()
      }
    }
  }, [isOpen])
}
