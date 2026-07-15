import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from '../components/saas/Sidebar'
import TopNavbar from '../components/saas/TopNavbar'
import { colors, shadows, radius, transitions } from '../theme/tokens'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

export default function DashboardLayout({
  user,
  children,
  activeTab,
  onTabChange,
  onLogout,
  headerSlot,
  navGroups,
  pageDescriptions = {},
}) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const closeSidebar = () => setSidebarOpen(false)
  const openSidebar = () => setSidebarOpen(true)

  const currentPageLabel = (() => {
    const groups = navGroups?.[user?.role] || []
    for (const group of groups) {
      const found = group.items?.find(i => i.key === activeTab)
      if (found) return found.label
    }
    return 'Dashboard'
  })()

  const currentPageDescription = pageDescriptions[activeTab] || ''

  const handleOpenCreate = () => {
    window.dispatchEvent(new CustomEvent('open-create-course'))
  }

  const handleProfile = () => {
    if (user?.role === 'TRAINER') navigate('/trainer/profile')
    else onTabChange?.('profile')
  }

  return (
    <div
      className={user?.role === 'TRAINER' ? 'theme-trainer' : 'theme-academic'}
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--color-bg-base)',
      }}
    >
      <Sidebar
        user={user}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={closeSidebar}
        onOpenSidebar={openSidebar}
      />

      <div
        className="main-content"
        style={{
          flex: 1,
          marginLeft: 'var(--sidebar-width)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: 'margin-left 300ms ease',
        }}
      >
        <TopNavbar
          user={user}
          currentPageLabel={currentPageLabel}
          onOpenCreate={handleOpenCreate}
          onProfile={handleProfile}
        />

        {headerSlot && (
          <div style={{ padding: '0 var(--space-6)', paddingTop: 'var(--space-4)' }}>
            {headerSlot}
          </div>
        )}

        <motion.main
          className="page-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            flex: 1,
            padding: 'var(--space-6) var(--space-7)',
            maxWidth: '1440px',
            width: '100%',
          }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  )
}

export { pageVariants }
