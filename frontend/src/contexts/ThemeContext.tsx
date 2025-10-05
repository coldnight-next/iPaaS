import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { ConfigProvider } from 'antd'
import {
  getThemeConfig,
  getSystemThemePreference,
  getStoredTheme,
  setStoredTheme,
  THEME_STORAGE_KEY
} from '../lib/theme'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
  setTheme: (isDark: boolean) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Initialize theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check stored preference first
    const stored = getStoredTheme()
    if (stored !== null) return stored

    // Fall back to system preference
    return getSystemThemePreference()
  })

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if no stored preference exists
      const stored = getStoredTheme()
      if (stored === null) {
        setIsDark(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const toggleTheme = () => {
    const newTheme = !isDark
    setIsDark(newTheme)
    setStoredTheme(newTheme)
  }

  const setTheme = (newIsDark: boolean) => {
    setIsDark(newIsDark)
    setStoredTheme(newIsDark)
  }

  const themeConfig = getThemeConfig(isDark)

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>
      <ConfigProvider theme={themeConfig}>
        <div className={isDark ? 'dark' : 'light'}>
          {children}
        </div>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}