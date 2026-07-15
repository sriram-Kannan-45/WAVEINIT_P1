import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react'

const speeds = [0.5, 1, 1.5, 2]

const VideoPlayer = forwardRef(({ src, poster, onTimeUpdate, onEnded, onDuration, className = '' }, ref) => {
  const videoRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo: (time) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
        setCurrentTime(time)
      }
    }
  }))
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef(null)

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setPlaying(!playing)
  }, [playing])

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
    onTimeUpdate?.(videoRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return
    const d = videoRef.current.duration
    setDuration(d)
    if (Number.isFinite(d) && d > 0) onDuration?.(Math.floor(d))
  }

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    const time = pos * duration
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    setMuted(v === 0)
    if (videoRef.current) videoRef.current.volume = v
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted
      setMuted(!muted)
    }
  }

  const changeSpeed = () => {
    const idx = speeds.indexOf(speed)
    const next = speeds[(idx + 1) % speeds.length]
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setFullscreen(true)
    } else {
      await document.exitFullscreen()
      setFullscreen(false)
    }
  }

  const fmt = (s) => {
    if (typeof s !== 'number' || !Number.isFinite(s) || Number.isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = typeof duration === 'number' && duration > 0 && Number.isFinite(duration) ? (currentTime / duration) * 100 : 0

  return (
    <div ref={containerRef} className={`relative bg-black rounded-lg overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => { setPlaying(false); onEnded?.() }}
        playsInline
        preload="metadata"
      />

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 cursor-pointer group" onClick={handleSeek}>
          <div className="h-full bg-blue-500 relative" style={{ width: `${progress}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <button onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 accent-blue-500"
            />

            <span className="text-white/80 text-xs font-mono">
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={changeSpeed} className="text-white/80 hover:text-blue-400 text-xs font-semibold px-2 py-0.5 rounded bg-white/10 transition-colors">
              {speed}x
            </button>

            <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors">
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default VideoPlayer
