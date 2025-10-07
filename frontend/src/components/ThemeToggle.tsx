import { useTheme } from '../hooks/useTheme'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      aria-label="Toggle theme"
    >
      <span className="material-icons text-gray-600 dark:text-gray-300">
        {theme === 'dark' ? 'dark_mode' : 'light_mode'}
      </span>
    </button>
  )
}

export default ThemeToggle