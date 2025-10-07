# GodSuite Theme Package

Complete theme configuration for replicating the GodSuite design system in other projects.

## 1. Dependencies

```bash
npm install -D tailwindcss@^3.3.6 postcss autoprefixer
npx tailwindcss init -p
```

## 2. Tailwind Configuration

**tailwind.config.js**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      fontFamily: {
        'sans': ['JetBrains Mono', 'monospace'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
          },
          '50%': {
            boxShadow: '0 0 30px rgba(59, 130, 246, 0.6)'
          },
        }
      }
    },
  },
  plugins: [],
}
```

## 3. CSS Configuration

**src/index.css** or **src/styles/globals.css**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  width: 100%;
  margin: 0;
}

/* Custom animations */
@keyframes divine-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}

.divine-pulse {
  animation: divine-pulse 2s ease-in-out infinite;
}

/* Hover effects */
.hover-glow:hover {
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
  transform: translateY(-2px);
  transition: all 0.3s ease;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.dark ::-webkit-scrollbar-track {
  background: #1f2937;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

## 4. HTML Setup

**index.html**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Material Icons -->
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <title>Your App Name</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## 5. Dark Mode Hook

**src/hooks/useTheme.ts**
```typescript
import { useState, useEffect } from 'react'

export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme
    }

    // Fall back to system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }

    return 'light'
  })

  useEffect(() => {
    // Update localStorage
    localStorage.setItem('theme', theme)

    // Update document class
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
  }

  return { theme, toggleTheme, setTheme }
}
```

## 6. Color Palette Reference

### Primary Colors
```css
/* Light Mode */
--bg-primary: white (#ffffff)
--bg-secondary: gray-50 (#f9fafb)
--text-primary: gray-900 (#111827)
--text-secondary: gray-600 (#4b5563)
--border: gray-200 (#e5e7eb)

/* Dark Mode */
--bg-primary: gray-800 (#1f2937)
--bg-secondary: gray-900 (#111827)
--text-primary: white (#ffffff)
--text-secondary: gray-300 (#d1d5db)
--border: gray-700 (#374151)

/* Accent Colors */
--accent-blue: blue-600 (#2563eb)
--accent-blue-dark: blue-400 (#60a5fa)
--accent-yellow: yellow-400 (#facc15)
--accent-purple: purple-500 (#a855f7)
--accent-pink: pink-900 (#831843)
--accent-indigo: indigo-900 (#312e81)
```

### Gradient Backgrounds
```css
/* Divine Loading Gradient */
background: linear-gradient(to bottom right, #312e81, #7e22ce, #831843);
/* Tailwind: bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 */

/* Card Hover Gradient */
background: linear-gradient(to right, #a855f7, #2563eb);
/* Tailwind: bg-gradient-to-r from-purple-500 to-blue-500 */
```

## 7. Component Examples

### Theme Toggle Button
```tsx
import { useTheme } from './hooks/useTheme'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label="Toggle theme"
    >
      <span className="material-icons text-gray-600 dark:text-gray-300">
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}
```

### Card Component
```tsx
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover-glow transition-all">
      {children}
    </div>
  )
}
```

### Button Component
```tsx
function Button({ children, variant = 'primary' }: { children: React.ReactNode, variant?: 'primary' | 'secondary' }) {
  const baseClasses = "px-4 py-2 rounded-lg font-medium transition-all"

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
  }

  return (
    <button className={`${baseClasses} ${variants[variant]}`}>
      {children}
    </button>
  )
}
```

### Loading Spinner
```tsx
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <div className="text-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="absolute top-4 left-4 w-8 h-8 bg-yellow-400 rounded-full divine-pulse"></div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Loading...</h2>
        <p className="text-indigo-200">Initializing application</p>
      </div>
    </div>
  )
}
```

## 8. Usage in App Component

**App.tsx / App.jsx**
```tsx
import { useTheme } from './hooks/useTheme'

function App() {
  const { theme } = useTheme()

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        {/* Your app content */}
      </div>
    </div>
  )
}
```

## 9. Common Utility Classes

```css
/* Backgrounds */
.bg-card { @apply bg-white dark:bg-gray-800; }
.bg-page { @apply bg-gray-50 dark:bg-gray-900; }

/* Text */
.text-primary { @apply text-gray-900 dark:text-white; }
.text-secondary { @apply text-gray-600 dark:text-gray-400; }

/* Borders */
.border-default { @apply border-gray-200 dark:border-gray-700; }

/* Interactive Elements */
.hover-bg { @apply hover:bg-gray-100 dark:hover:bg-gray-700; }
.interactive { @apply transition-all hover-glow cursor-pointer; }
```

## 10. PostCSS Configuration

**postcss.config.js**
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

## Summary

This theme provides:
- ✅ Professional monospace font (JetBrains Mono)
- ✅ Full dark/light mode support with localStorage persistence
- ✅ Material Icons integration
- ✅ Custom animations (pulse, glow)
- ✅ Consistent color palette
- ✅ Responsive design utilities
- ✅ Custom scrollbar styling
- ✅ Smooth transitions throughout

**Quick Start:**
1. Copy configurations to your project
2. Install dependencies
3. Import CSS in your main file
4. Wrap app with theme provider
5. Use utility classes and components

Enjoy your new theme! 🎨
