import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { X, Smartphone, Share, Plus } from 'lucide-react'
import { Button } from './ui/button'

export function MobileInstallGuide() {
  const { theme } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check if user is on mobile
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      const isSmallScreen = window.innerWidth <= 768
      return isMobileDevice || isSmallScreen
    }

    // Check if user has already seen the guide
    const hasSeenGuide = localStorage.getItem('dash-mobile-guide-seen')
    
    // Check if app is already installed (running in standalone mode)
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches

    if (checkMobile() && !hasSeenGuide && !isStandalone) {
      setIsMobile(true)
      // Show guide after a short delay
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleDismiss = (dontShowAgain = false) => {
    setIsVisible(false)
    if (dontShowAgain) {
      localStorage.setItem('dash-mobile-guide-seen', 'true')
    }
  }

  if (!isMobile || !isVisible) return null

  // Theme-aware styling
  const getStyles = () => {
    if (theme === 'fallout') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
        modal: 'fixed bottom-4 left-4 right-4 rounded-xl border-2 border-green-600 bg-gray-900 p-4 shadow-2xl shadow-green-600/20',
        text: 'text-green-400',
        subtext: 'text-green-300',
        highlight: 'text-green-200 font-semibold'
      }
    } else if (theme === 'dark') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        modal: 'fixed bottom-4 left-4 right-4 rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-2xl',
        text: 'text-gray-100',
        subtext: 'text-gray-300',
        highlight: 'text-white font-semibold'
      }
    } else {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
        modal: 'fixed bottom-4 left-4 right-4 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl',
        text: 'text-gray-900',
        subtext: 'text-gray-600',
        highlight: 'text-gray-900 font-semibold'
      }
    }
  }

  const styles = getStyles()

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className={`h-5 w-5 ${styles.text}`} />
            <h3 className={`font-bold ${styles.text}`}>Install Dash App</h3>
          </div>
          <button
            onClick={() => handleDismiss()}
            className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 ${styles.text}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${theme === 'fallout' ? 'bg-green-600' : theme === 'dark' ? 'bg-blue-600' : 'bg-blue-500'} text-white text-sm font-bold`}>
              1
            </div>
            <div>
              <p className={`text-sm ${styles.text}`}>
                Tap the <Share className="inline h-4 w-4 mx-1" /> <span className={styles.highlight}>Share</span> button below the URL bar
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${theme === 'fallout' ? 'bg-green-600' : theme === 'dark' ? 'bg-blue-600' : 'bg-blue-500'} text-white text-sm font-bold`}>
              2
            </div>
            <div>
              <p className={`text-sm ${styles.text}`}>
                Select <Plus className="inline h-4 w-4 mx-1" /> <span className={styles.highlight}>"Add to Home Screen"</span> from the menu
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${theme === 'fallout' ? 'bg-green-600' : theme === 'dark' ? 'bg-blue-600' : 'bg-blue-500'} text-white text-sm font-bold`}>
              3
            </div>
            <div>
              <p className={`text-sm ${styles.text}`}>
                Tap <span className={styles.highlight}>"Add"</span> to install Dash as an app
              </p>
            </div>
          </div>
        </div>

        <div className={`p-3 rounded-lg mb-4 ${theme === 'fallout' ? 'bg-gray-800/50' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <p className={`text-xs ${styles.subtext}`}>
            ✨ <strong>Works offline</strong> • <strong>No tracking</strong> • <strong>Privacy-first</strong>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDismiss(true)}
            className={`text-xs ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}`}
          >
            Don't show again
          </Button>
          <Button
            size="sm"
            onClick={() => handleDismiss()}
            className={`text-xs ${theme === 'fallout' ? 'bg-green-600 text-gray-900 hover:bg-green-500' : theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            Got it!
          </Button>
        </div>
      </div>
    </div>
  )
}
