import React from 'react'
import { useTheme } from 'next-themes'
import { Button } from "./ui/button"
import { Sun, Moon, Terminal } from 'lucide-react'

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('fallout')
    } else {
      setTheme('light')
    }
  }

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />
      case 'dark':
        return <Moon className="h-4 w-4" />
      case 'fallout':
        return <Terminal className="h-4 w-4" />
      default:
        return <Sun className="h-4 w-4" />
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      title={`Current theme: ${theme || 'light'}`}
    >
      {getIcon()}
    </Button>
  )
}

export default ThemeToggle