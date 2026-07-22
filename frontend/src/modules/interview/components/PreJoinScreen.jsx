import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Mic, MicOff, CameraOff, Video, Settings, AlertTriangle, Loader2 } from 'lucide-react';

export default function PreJoinScreen({ interview, onJoin, onBack }) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [stream, setStream] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let mediaStream = null;
    const init = async () => {
      try {
        setChecking(true);
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        setError('Camera or microphone access denied. Please grant permissions.');
      } finally {
        setChecking(false);
      }
    };
    init();
    return () => { if (mediaStream) mediaStream.getTracks().forEach(t => t.stop()); };
  }, []);

  const toggleMic = () => {
    stream?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(!micOn);
  };

  const toggleCam = () => {
    stream?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(!camOn);
  };

  const handleJoin = () => {
    onJoin({ stream, micOn, camOn });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 text-white">
          <h2 className="text-lg font-semibold">{interview?.title || 'Interview'}</h2>
          <p className="text-sm text-emerald-100">Camera & microphone check</p>
        </div>

        <div className="p-6">
          {checking ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 size={40} className="text-emerald-500 animate-spin" />
              <p className="text-sm text-slate-600 mt-3">Checking camera and microphone...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8">
              <AlertTriangle size={40} className="text-amber-500 mb-3" />
              <p className="text-sm text-slate-700 text-center">{error}</p>
            </div>
          ) : (
            <>
              <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video mb-4">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                    <CameraOff size={40} className="text-slate-500" />
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                  <button onClick={toggleMic} className={`p-2 rounded-lg text-white text-xs flex items-center gap-1 ${micOn ? 'bg-white/20' : 'bg-red-500'}`}>
                    {micOn ? <Mic size={14} /> : <MicOff size={14} />}
                  </button>
                  <button onClick={toggleCam} className={`p-2 rounded-lg text-white text-xs flex items-center gap-1 ${camOn ? 'bg-white/20' : 'bg-red-500'}`}>
                    {camOn ? <Camera size={14} /> : <CameraOff size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className={`w-2 h-2 rounded-full ${micOn ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  Microphone {micOn ? 'On' : 'Off'}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className={`w-2 h-2 rounded-full ${camOn ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  Camera {camOn ? 'On' : 'Off'}
                </div>
              </div>

              <button
                onClick={handleJoin}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Video size={18} /> Join Interview
              </button>
              <button onClick={onBack} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 mt-2">
                Back
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
