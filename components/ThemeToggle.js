import React from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Terminal, CloudMoon } from 'lucide-react'
import Tooltip from './Tooltip'

const ThemeToggle = ({ className = '' }) => {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('darkblue')
    } else if (theme === 'darkblue') {
      setTheme('fallout')
    } else {
      setTheme('light')
    }
  }

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4 pointer-events-none" />
      case 'dark':
        return <Moon className="h-4 w-4 pointer-events-none" />
      case 'darkblue':
        return <CloudMoon className="h-4 w-4 pointer-events-none" />
      case 'fallout':
        return <Terminal className="h-4 w-4 pointer-events-none" />
      default:
        return <Sun className="h-4 w-4 pointer-events-none" />
    }
  }

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : theme === 'darkblue' ? 'Night' : theme === 'fallout' ? 'Terminal' : 'Light'

  return (
    <Tooltip text={`Theme: ${themeLabel}`}>
    <button
      onClick={cycleTheme}
      className={`p-2 rounded-lg transition-colors ${className}`}
    >
      {getIcon()}
    </button>
    </Tooltip>
  )
}

export default ThemeToggle