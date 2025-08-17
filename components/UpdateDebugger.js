import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { RefreshCw, Bell, Download, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Button } from './ui/button'

export function UpdateDebugger({ isOpen, onClose }) {
  const { theme } = useTheme()
  const [debugInfo, setDebugInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadDebugInfo()
    }
  }, [isOpen])

  const loadDebugInfo = async () => {
    setLoading(true)
    try {
      const info = {}
      
      // Check if electron is available
      if (typeof window !== 'undefined' && window.electron) {
        info.electronAvailable = true
        
        // Get current version
        info.currentVersion = await window.electron.invoke('get-app-version') || 'Unknown'
        
        // Get update status
        const updateStatus = await window.electron.invoke('get-update-status')
        info.updateStatus = updateStatus
        
        // Get last update check time
        info.lastCheck = updateStatus?.lastUpdateCheck || 'Never'
        
        // Check auto-updater configuration
        info.updateConfig = {
          isCheckingForUpdates: updateStatus?.isCheckingForUpdates || false,
          isDownloading: updateStatus?.isDownloading || false,
          hasUpdateInfo: !!updateStatus?.updateInfo
        }
        
        // Get any recent errors
        info.recentErrors = updateStatus?.lastError || null
        
      } else {
        info.electronAvailable = false
        info.platform = 'Web/PWA'
      }
      
      setDebugInfo(info)
    } catch (error) {
      console.error('Error loading debug info:', error)
      setDebugInfo({ error: error.message })
    }
    setLoading(false)
  }

  const forceUpdateCheck = async () => {
    if (!window.electron) return
    
    setChecking(true)
    try {
      console.log('Forcing update check...')
      const result = await window.electron.invoke('check-for-updates')
      console.log('Update check result:', result)
      
      // Reload debug info to show latest status
      await loadDebugInfo()
    } catch (error) {
      console.error('Error forcing update check:', error)
    }
    setChecking(false)
  }

  if (!isOpen) return null

  // Theme-aware styling
  const getStyles = () => {
    if (theme === 'fallout') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-2xl mx-auto rounded-xl border-2 border-green-600 bg-gray-900 p-6 shadow-2xl shadow-green-600/20 max-h-[80vh] overflow-y-auto',
        text: 'text-green-400',
        subtext: 'text-green-300'
      }
    } else if (theme === 'dark') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-2xl mx-auto rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl max-h-[80vh] overflow-y-auto',
        text: 'text-gray-100',
        subtext: 'text-gray-300'
      }
    } else {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-2xl mx-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[80vh] overflow-y-auto',
        text: 'text-gray-900',
        subtext: 'text-gray-600'
      }
    }
  }

  const styles = getStyles()

  const renderStatusIcon = (status) => {
    if (status === true) return <CheckCircle className="h-4 w-4 text-green-500" />
    if (status === false) return <AlertTriangle className="h-4 w-4 text-red-500" />
    return <Info className="h-4 w-4 text-blue-500" />
  }

  const renderDebugValue = (key, value) => {
    if (typeof value === 'object' && value !== null) {
      return (
        <div key={key} className="space-y-1">
          <span className={`font-semibold ${styles.text}`}>{key}:</span>
          <div className="ml-4 space-y-1">
            {Object.entries(value).map(([subKey, subValue]) => 
              renderDebugValue(subKey, subValue)
            )}
          </div>
        </div>
      )
    }
    
    return (
      <div key={key} className={`flex justify-between ${styles.subtext}`}>
        <span>{key}:</span>
        <span className={styles.text}>{String(value)}</span>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <Bell className={`h-6 w-6 ${styles.text}`} />
          <h2 className={`text-lg font-bold ${styles.text}`}>Update System Debugger</h2>
        </div>

        {loading ? (
          <div className={`text-center py-4 ${styles.subtext}`}>
            Loading debug information...
          </div>
        ) : debugInfo ? (
          <div className="space-y-4">
            {debugInfo.error ? (
              <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-red-900/20 border border-red-600/30' : theme === 'dark' ? 'bg-red-900/20' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className={`font-semibold ${theme === 'dark' ? 'text-red-400' : 'text-red-700'}`}>
                    Debug Error
                  </span>
                </div>
                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>
                  {debugInfo.error}
                </p>
              </div>
            ) : (
              <>
                {/* Electron Status */}
                <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600/30' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {renderStatusIcon(debugInfo.electronAvailable)}
                    <span className={`font-semibold ${styles.text}`}>
                      Platform: {debugInfo.electronAvailable ? 'Electron (Desktop)' : 'Web/PWA'}
                    </span>
                  </div>
                  
                  {debugInfo.electronAvailable && (
                    <div className="space-y-1 text-sm">
                      {renderDebugValue('Current Version', debugInfo.currentVersion)}
                      {renderDebugValue('Last Update Check', debugInfo.lastCheck)}
                    </div>
                  )}
                </div>

                {/* Update Configuration */}
                {debugInfo.electronAvailable && debugInfo.updateConfig && (
                  <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600/30' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold mb-2 ${styles.text}`}>Update Configuration</h3>
                    <div className="space-y-1 text-sm">
                      {Object.entries(debugInfo.updateConfig).map(([key, value]) => 
                        renderDebugValue(key, value)
                      )}
                    </div>
                  </div>
                )}

                {/* Update Status */}
                {debugInfo.electronAvailable && debugInfo.updateStatus && (
                  <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600/30' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <h3 className={`font-semibold mb-2 ${styles.text}`}>Update Status</h3>
                    <div className="space-y-1 text-sm">
                      {Object.entries(debugInfo.updateStatus).map(([key, value]) => 
                        renderDebugValue(key, value)
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Errors */}
                {debugInfo.recentErrors && (
                  <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-yellow-900/20 border border-yellow-600/30' : theme === 'dark' ? 'bg-yellow-900/20' : 'bg-yellow-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className={`font-semibold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-700'}`}>
                        Recent Errors
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      {renderDebugValue('Error Details', debugInfo.recentErrors)}
                    </div>
                  </div>
                )}

                {/* Debug Instructions */}
                <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-blue-900/20 border border-blue-600/30' : theme === 'dark' ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                  <h3 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>
                    Debug Instructions
                  </h3>
                  <div className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>
                    <p className="mb-2">Expected behavior:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>App should check for updates 3 seconds after startup</li>
                      <li>Periodic checks every 30 minutes</li>
                      <li>Manual checks via bell icon should work</li>
                      <li>Current version: v1.3.59, Latest: v1.3.60 should trigger notification</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="flex justify-between gap-3 mt-6">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDebugInfo}
              className={theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            {debugInfo?.electronAvailable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={forceUpdateCheck}
                disabled={checking}
                className={theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}
              >
                <Download className={`h-4 w-4 mr-1 ${checking ? 'animate-spin' : ''}`} />
                Force Check
              </Button>
            )}
          </div>
          <Button
            size="sm"
            onClick={onClose}
            className={theme === 'fallout' ? 'bg-green-600 text-gray-900 hover:bg-green-500' : ''}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
