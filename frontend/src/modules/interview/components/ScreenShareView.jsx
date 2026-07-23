import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Monitor, GripVertical } from 'lucide-react';

export default function ScreenShareView({ screenStream, cameraStream, localName, isCameraOff }) {
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const containerRef = useRef(null);
  const [pipPos, setPipPos] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, pipX: 0, pipY: 0 });
  const [pipSize] = useState({ w: 200, h: 150 });

  useEffect(() => {
    if (screenRef.current && screenStream) {
      screenRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (cameraRef.current && cameraStream) {
      cameraRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, pipX: pipPos.x, pipY: pipPos.y };
  }, [pipPos]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const rect = containerRef.current.getBoundingClientRect();
    const maxX = rect.width - pipSize.w - 16;
    const maxY = rect.height - pipSize.h - 16;
    setPipPos({
      x: Math.max(16, Math.min(maxX, dragStart.current.pipX + dx)),
      y: Math.max(16, Math.min(maxY, dragStart.current.pipY + dy)),
    });
  }, [isDragging, pipSize]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  const initials = (localName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 overflow-hidden"
    >
      <video
        ref={screenRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />

      <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg">
        <Monitor size={14} className="text-emerald-400" />
        <span className="text-xs font-medium text-white">Screen Share</span>
      </div>

      <div
        className="absolute select-none"
        style={{ left: pipPos.x, top: pipPos.y, width: pipSize.w, height: pipSize.h, zIndex: 10 }}
      >
        <div
          className="relative w-full h-full rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900"
          onPointerDown={handlePointerDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          {!isCameraOff && cameraStream ? (
            <video
              ref={cameraRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{initials}</span>
              </div>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
            <span className="text-[10px] font-medium text-white">{localName} (You)</span>
          </div>

          <div className="absolute top-1 right-1 text-white/60 hover:text-white/90 transition-colors">
            <GripVertical size={12} />
          </div>
        </div>
      </div>
    </div>
  );
}
