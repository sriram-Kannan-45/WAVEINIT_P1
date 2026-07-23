import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, CameraOff, Pin } from 'lucide-react';

function VideoTile({ stream, name, isLocal, isMuted, isCameraOff, isSpeaking, isPinned, style }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`relative rounded-xl overflow-hidden bg-slate-800 ${isSpeaking ? 'ring-2 ring-yellow-400' : ''} ${isPinned ? 'ring-2 ring-emerald-500' : ''}`}
      style={style}
    >
      {!isCameraOff && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-700/50">
          <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center">
            <span className="text-xl font-bold text-white">{initials}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPinned && <Pin size={12} className="text-emerald-400" />}
            <span className="text-xs font-medium text-white truncate">{name}{isLocal ? ' (You)' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isMuted ? (
              <div className="w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center">
                <MicOff size={10} className="text-white" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                <Mic size={10} className="text-white" />
              </div>
            )}
            {isCameraOff && (
              <div className="w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center">
                <CameraOff size={10} className="text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {isSpeaking && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3].map(i => (
              <motion.div
                key={i}
                className="w-0.5 bg-yellow-400 rounded-full"
                animate={{ height: [4, 12, 4] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function VideoGrid({ localStream, remoteStreams = new Map(), localName, isMuted, isCameraOff, participants = [], pinnedId }) {
  const remoteArray = useMemo(() => {
    const arr = [];
    remoteStreams.forEach((stream, peerId) => {
      const participant = participants.find(p => p.id === peerId);
      arr.push({ peerId, stream, name: participant?.name || 'Participant' });
    });
    return arr;
  }, [remoteStreams, participants]);

  const total = 1 + remoteArray.length;
  const pinnedRemote = pinnedId ? remoteArray.find(r => r.peerId === pinnedId) : null;
  const unpinnedRemotes = pinnedId ? remoteArray.filter(r => r.peerId !== pinnedId) : remoteArray;

  const getGridClass = () => {
    const count = pinnedId ? unpinnedRemotes.length + 1 : total;
    if (pinnedId) return 'grid grid-cols-1 lg:grid-cols-4 gap-2 h-full';
    if (count === 1) return 'grid grid-cols-1 gap-2 h-full';
    if (count === 2) return 'grid grid-cols-2 gap-2 h-full';
    if (count <= 4) return 'grid grid-cols-2 grid-rows-2 gap-2 h-full';
    return 'grid grid-cols-3 gap-2 h-full overflow-y-auto auto-rows-fr';
  };

  return (
    <div className={getGridClass()}>
      {pinnedId && (
        <div className="lg:col-span-3 h-full">
          <VideoTile
            stream={pinnedRemote?.stream}
            name={pinnedRemote?.name}
            isLocal={false}
            isMuted={false}
            isCameraOff={false}
            isSpeaking={false}
            isPinned={true}
            style={{ height: '100%', minHeight: 200 }}
          />
        </div>
      )}

      {!pinnedId && (
        <VideoTile
          stream={localStream}
          name={localName}
          isLocal={true}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isSpeaking={false}
          isPinned={false}
          style={{ minHeight: total <= 2 ? 200 : undefined, height: total <= 2 ? '100%' : undefined }}
        />
      )}

      {!pinnedId && unpinnedRemotes.map(r => (
        <VideoTile
          key={r.peerId}
          stream={r.stream}
          name={r.name}
          isLocal={false}
          isMuted={false}
          isCameraOff={!r.stream}
          isSpeaking={false}
          isPinned={false}
          style={{ minHeight: total <= 2 ? 200 : undefined, height: total <= 2 ? '100%' : undefined }}
        />
      ))}

      {pinnedId && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          <VideoTile
            stream={localStream}
            name={localName}
            isLocal={true}
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isSpeaking={false}
            isPinned={false}
            style={{ height: 160, minHeight: 120 }}
          />
          {unpinnedRemotes.map(r => (
            <VideoTile
              key={r.peerId}
              stream={r.stream}
              name={r.name}
              isLocal={false}
              isMuted={false}
              isCameraOff={!r.stream}
              isSpeaking={false}
              isPinned={false}
              style={{ height: 160, minHeight: 120 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
