import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  onCapture: (blob: Blob) => void
}

// Live in-page camera with a circular capture guide (native <input capture>
// hands off to the OS camera app, which can't be overlaid). Falls back to
// the file picker when getUserMedia is unavailable/denied — no guide there,
// just a plain preview, since we don't control that native camera UI.
export function CameraCapture({ label, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)
      } catch {
        if (!cancelled) setUseFallback(true)
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  function handleShutter() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob)
    }, 'image/jpeg', 0.92)
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onCapture(file)
  }

  if (useFallback) {
    return (
      <div className="camera-capture">
        <p className="page-hint">{label}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Take / choose photo
        </button>
      </div>
    )
  }

  return (
    <div className="camera-capture">
      <p className="page-hint">{label}</p>
      <div className="camera-viewport">
        <video ref={videoRef} playsInline muted />
        <div className="camera-guide" />
      </div>
      <button type="button" onClick={handleShutter} disabled={!ready} className="shutter-btn">
        {ready ? 'Capture' : 'Starting camera…'}
      </button>
    </div>
  )
}
