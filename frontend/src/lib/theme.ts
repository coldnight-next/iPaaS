// Custom Design System for SyncFlow
import { theme } from 'antd'

const { defaultAlgorithm, darkAlgorithm } = theme

// Brand Colors
export const brandColors = {
  primary: {
    50: '#e6f7ff',
    100: '#bae7ff',
    200: '#91d5ff',
    300: '#69c0ff',
    400: '#40a9ff',
    500: '#1890ff', // Main brand color
    600: '#096dd9',
    700: '#0050b3',
    800: '#003a8c',
    900: '#002766',
  },
  success: {
    50: '#f6ffed',
    100: '#b7eb8f',
    200: '#95de64',
    300: '#73d13d',
    400: '#52c41a',
    500: '#389e0d',
    600: '#237804',
    700: '#135200',
    800: '#092b00',
    900: '#000000',
  },
  warning: {
    50: '#fffbe6',
    100: '#fff1b8',
    200: '#ffe58f',
    300: '#ffd666',
    400: '#ffc53d',
    500: '#faad14',
    600: '#d48806',
    700: '#ad6800',
    800: '#874d00',
    900: '#613400',
  },
  error: {
    50: '#fff2f0',
    100: '#ffccc7',
    200: '#ffa39e',
    300: '#ff7875',
    400: '#ff4d4f',
    500: '#f5222d',
    600: '#cf1322',
    700: '#a8071a',
    800: '#820014',
    900: '#5c0011',
  },
}

// Light Theme Configuration
export const lightTheme = {
  algorithm: defaultAlgorithm,
  token: {
    // Primary colors
    colorPrimary: brandColors.primary[500],
    colorPrimaryHover: brandColors.primary[400],
    colorPrimaryActive: brandColors.primary[600],

    // Background colors
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorBgSpotlight: '#ffffff',

    // Text colors
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',

    // Border colors
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#f0f0f0',

    // Success/Warning/Error
    colorSuccess: brandColors.success[500],
    colorWarning: brandColors.warning[500],
    colorError: brandColors.error[500],

    // Font settings
    fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,

    // Spacing
    padding: 16,
    paddingSM: 12,
    paddingLG: 24,
    margin: 16,
    marginSM: 8,
    marginLG: 24,

    // Border radius
    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 12,

    // Box shadow
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  components: {
    Layout: {
      colorBgHeader: '#ffffff',
      colorBgBody: '#f5f5f5',
      colorBgTrigger: brandColors.primary[500],
    },
    Menu: {
      colorItemBgSelected: brandColors.primary[50],
      colorItemTextSelected: brandColors.primary[600],
      colorItemBgHover: brandColors.primary[25] || '#f0f8ff',
    },
    Card: {
      colorBorderSecondary: '#f0f0f0',
    },
    Button: {
      borderRadius: 6,
      controlHeight: 40,
    },
    Statistic: {
      colorText: '#262626',
      colorTextDescription: '#8c8c8c',
    },
  },
}

// Dark Theme Configuration
export const darkTheme = {
  algorithm: darkAlgorithm,
  token: {
    // Primary colors
    colorPrimary: brandColors.primary[400],
    colorPrimaryHover: brandColors.primary[300],
    colorPrimaryActive: brandColors.primary[500],

    // Background colors
    colorBgContainer: '#1f1f1f',
    colorBgLayout: '#141414',
    colorBgSpotlight: '#262626',

    // Text colors
    colorText: '#ffffff',
    colorTextSecondary: '#a6a6a6',
    colorTextTertiary: '#737373',

    // Border colors
    colorBorder: '#434343',
    colorBorderSecondary: '#303030',

    // Success/Warning/Error
    colorSuccess: brandColors.success[400],
    colorWarning: brandColors.warning[400],
    colorError: brandColors.error[400],

    // Font settings (same as light)
    fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,

    // Spacing (same as light)
    padding: 16,
    paddingSM: 12,
    paddingLG: 24,
    margin: 16,
    marginSM: 8,
    marginLG: 24,

    // Border radius (same as light)
    borderRadius: 8,
    borderRadiusSM: 4,
    borderRadiusLG: 12,

    // Box shadow for dark theme
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  components: {
    Layout: {
      colorBgHeader: '#1f1f1f',
      colorBgBody: '#141414',
      colorBgTrigger: brandColors.primary[400],
    },
    Menu: {
      colorItemBgSelected: brandColors.primary[900],
      colorItemTextSelected: brandColors.primary[300],
      colorItemBgHover: brandColors.primary[800],
    },
    Card: {
      colorBorderSecondary: '#303030',
    },
    Button: {
      borderRadius: 6,
      controlHeight: 40,
    },
    Statistic: {
      colorText: '#ffffff',
      colorTextDescription: '#737373',
    },
  },
}

// Theme utilities
export const getThemeConfig = (isDark: boolean) => isDark ? darkTheme : lightTheme

// System preference detection
export const getSystemThemePreference = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Local storage helpers
export const THEME_STORAGE_KEY = 'syncflow-theme'

export const getStoredTheme = (): boolean | null => {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored ? JSON.parse(stored) : null
}

export const setStoredTheme = (isDark: boolean): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(isDark))
}