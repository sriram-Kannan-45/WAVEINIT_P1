import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar, { navGroups, pageDescriptions } from './saas/Sidebar'
import TopNavbar from './saas/TopNavbar'

function Layout({ user, children, activeTab, onTabChange, onLogout, headerSlot }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const groups = navGroups[user.role] || []

  const closeSidebar = () => setSidebarOpen(false)
  const openSidebar = () => setSidebarOpen(true)

  const currentPageLabel = (() => {
    for (const group of groups) {
      const found = group.items.find(i => i.key === activeTab)
      if (found) return found.label
    }
    return 'Dashboard'
  })()

  const currentPageDescription = pageDescriptions[activeTab] || ''

  const handleOpenCreate = () => {
    const event = new CustomEvent('open-create-course')
    window.dispatchEvent(event)
  }

  const handleProfile = () => {
    if (user?.role === 'TRAINER') navigate('/trainer/profile')
    else onTabChange('profile')
  }

  return (
    <div className={`app-layout ${user.role === 'TRAINER' ? 'theme-trainer' : 'theme-academic'}`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
      >
        Skip to main content
      </a>
      <a
        href="#sidebar-nav"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-44 focus:z-[9999] focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
      >
        Skip to navigation
      </a>

      <Sidebar
        user={user}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={closeSidebar}
        onOpenSidebar={openSidebar}
      />

      <div className="main-content">
        <TopNavbar
          user={user}
          currentPageLabel={currentPageLabel}
          onOpenCreate={handleOpenCreate}
          onProfile={handleProfile}
        />

        <motion.main
          id="main-content"
          role="main"
          aria-label={currentPageLabel}
          className="page-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {currentPageDescription && (
            <span className="sr-only">{currentPageDescription}</span>
          )}
          {children}
        </motion.main>
      </div>
    </div>
  )
}

export default Layout
