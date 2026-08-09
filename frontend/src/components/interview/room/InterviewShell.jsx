/**
 * InterviewShell
 * Full-screen (no dashboard/layout) wrapper for every step of the interview
 * room flow. Dark gradient background so the UI never shows the dashboard.
 */
import { motion } from 'framer-motion'

export default function InterviewShell({ children, headerRight, maxWidth = 'max-w-2xl' }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Brand header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
              FeedWeb Interview
            </div>
            <div className="text-indigo-300/70 text-[10px] mt-0.5 tracking-wide uppercase">
              Secure video room
            </div>
          </div>
        </div>
        {headerRight}
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full ${maxWidth}`}
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
