import { motion } from 'framer-motion'

export default function BackgroundBlobs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
      <motion.div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-20 right-0 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(20,184,166,0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ x: [0, -30, 0], y: [0, 50, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 w-[700px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(13,148,136,0.05) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
        animate={{ x: [0, 60, 0], y: [0, -40, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
    </div>
  )
}