import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AppThemeContext = createContext(null)
const STORAGE_KEY = 'wave-theme'

export function AppThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return localStorage.getItem(STORAGE_KEY) || 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      toggleTheme: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
      setTheme: (next) => setThemeState(next),
    }),
    [theme],
  )

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext)
  if (!ctx) {
    return { theme: 'light', isDark: false, toggleTheme: () => {}, setTheme: () => {} }
  }
  return ctx
}
