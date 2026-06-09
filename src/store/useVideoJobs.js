import { create } from 'zustand'
import { api } from '../lib/api'

// 어드민 표정 이미지에서 시작한 Seedance 영상 생성 잡을 백그라운드로 추적한다.
// - 서버는 동기 폴링(최대 5분)이라 클라이언트는 fire-and-forget으로 Promise만 잡고 있음.
// - 모달이 닫혀도 store 안에서 await가 계속 진행됨. 페이지 이탈/새로고침 시 잃음 (의도된 한계).
// - 정책: 영상이 생성되면 자동으로 감정 슬롯에 업로드한다 (사용자가 결과를 놓치지 않도록).
// - status: 'generating' → 'uploading' → 'uploaded' (or 'failed', 'upload_failed')
//   upload_failed는 ready+에러 — 사용자가 수동 재시도 가능.

const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const useVideoJobs = create((set, get) => ({
  jobs: [],

  // 잡 시작 — image(원본 표정 이미지)에서 Seedance 영상 생성
  // params: { image, characterId, characterName, styleId, emotion, emotionLabel, prompt }
  startSeedanceJob: (params) => {
    const id = genId()
    const job = {
      id,
      kind: 'seedance-image',
      image: params.image,
      characterId: params.characterId,
      characterName: params.characterName || null,
      styleId: params.styleId,
      emotion: params.emotion,
      emotionLabel: params.emotionLabel,
      prompt: params.prompt || '',
      status: 'generating',
      videoUrl: null,
      uploadedImage: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    }
    set((s) => ({ jobs: [...s.jobs, job] }))

    // fire-and-forget — 생성 완료 후 자동 업로드까지 chain
    ;(async () => {
      let videoUrl = null
      try {
        const res = await api.post(
          `/admin/images/${params.image.id}/generate-video-seedance`,
          { prompt: params.prompt || '' },
        )
        videoUrl = res.videoUrl
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id ? { ...j, videoUrl, status: 'uploading' } : j,
          ),
        }))
      } catch (err) {
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: 'failed',
                  error: err?.message || err?.error || '생성 실패',
                  finishedAt: Date.now(),
                }
              : j,
          ),
        }))
        return
      }

      // 자동 업로드
      try {
        const { image } = await api.post(
          `/admin/images/${params.image.id}/upload-seedance-video`,
          { videoUrl },
        )
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? { ...j, status: 'uploaded', uploadedImage: image, finishedAt: Date.now() }
              : j,
          ),
        }))
      } catch (err) {
        // 업로드 실패 — videoUrl은 있으니 사용자 수동 재시도 가능 (status: 'upload_failed')
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: 'upload_failed',
                  error: err?.message || err?.error || '업로드 실패',
                  finishedAt: Date.now(),
                }
              : j,
          ),
        }))
      }
    })()

    return id
  },

  // 업로드 실패한 잡을 재시도 (사용자 트리거)
  retryUpload: async (jobId, onUploaded) => {
    const job = get().jobs.find((j) => j.id === jobId)
    if (!job || job.status !== 'upload_failed' || !job.videoUrl) return

    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: 'uploading', error: null } : j)),
    }))
    try {
      const { image } = await api.post(
        `/admin/images/${job.image.id}/upload-seedance-video`,
        { videoUrl: job.videoUrl },
      )
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId ? { ...j, status: 'uploaded', uploadedImage: image } : j,
        ),
      }))
      onUploaded?.({ ...image, emotion: job.emotion }, job)
    } catch (err) {
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? { ...j, status: 'upload_failed', error: err?.message || err?.error || '업로드 실패' }
            : j,
        ),
      }))
    }
  },

  dismissJob: (jobId) =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) })),

  clearFinished: () =>
    set((s) => ({
      jobs: s.jobs.filter(
        (j) => j.status !== 'uploaded' && j.status !== 'failed' && j.status !== 'upload_failed',
      ),
    })),
}))

export default useVideoJobs
