import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Database, Smartphone, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react'
import { Button } from './ui/button'
import { getStorageInfo } from '@/lib/storage'

export function StorageDebugger({ isOpen, onClose }) {
  const { theme } = useTheme()
  const [storageInfo, setStorageInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadStorageInfo()
    }
  }, [isOpen])

  const loadStorageInfo = async () => {
    setLoading(true)
    try {
      const info = await getStorageInfo()
      setStorageInfo(info)
    } catch (error) {
      console.error('Error loading storage info:', error)
      setStorageInfo({ error: error.message })
    }
    setLoading(false)
  }

  if (!isOpen) return null

  const getStatusColor = () => {
    if (!storageInfo || storageInfo.error) return 'text-red-500'
    if (storageInfo.type === 'IndexedDB' && storageInfo.persistent) return 'text-green-500'
    if (storageInfo.type === 'IndexedDB') return 'text-yellow-500'
    return 'text-orange-500'
  }

  const getStatusIcon = () => {
    if (!storageInfo || storageInfo.error) return <AlertTriangle className="h-5 w-5 text-red-500" />
    if (storageInfo.type === 'IndexedDB' && storageInfo.persistent) return <CheckCircle className="h-5 w-5 text-green-500" />
    if (storageInfo.type === 'IndexedDB') return <Database className="h-5 w-5 text-yellow-500" />
    return <HardDrive className="h-5 w-5 text-orange-500" />
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Theme-aware styling
  const getStyles = () => {
    if (theme === 'fallout') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-md mx-auto rounded-xl border-2 border-green-600 bg-gray-900 p-6 shadow-2xl shadow-green-600/20',
        text: 'text-green-400',
        subtext: 'text-green-300'
      }
    } else if (theme === 'dark') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-md mx-auto rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl',
        text: 'text-gray-100',
        subtext: 'text-gray-300'
      }
    } else {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
        modal: 'fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-md mx-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl',
        text: 'text-gray-900',
        subtext: 'text-gray-600'
      }
    }
  }

  const styles = getStyles()

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <Database className={`h-6 w-6 ${styles.text}`} />
          <h2 className={`text-lg font-bold ${styles.text}`}>Storage Status</h2>
        </div>

        {loading ? (
          <div className={`text-center py-4 ${styles.subtext}`}>
            Loading storage information...
          </div>
        ) : storageInfo ? (
          <div className="space-y-4">
            {/* Storage Status */}
            <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600/30' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon()}
                <span className={`font-semibold ${getStatusColor()}`}>
                  {storageInfo.error ? 'Error' : 
                   storageInfo.type === 'IndexedDB' && storageInfo.persistent ? 'Optimal' :
                   storageInfo.type === 'IndexedDB' ? 'Good' : 'Basic'}
                </span>
              </div>
              
              {storageInfo.error ? (
                <p className={`text-sm ${styles.subtext}`}>
                  {storageInfo.error}
                </p>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className={`flex justify-between ${styles.subtext}`}>
                    <span>Storage Type:</span>
                    <span className={styles.text}>{storageInfo.type}</span>
                  </div>
                  <div className={`flex justify-between ${styles.subtext}`}>
                    <span>Persistent:</span>
                    <span className={storageInfo.persistent ? 'text-green-500' : 'text-yellow-500'}>
                      {storageInfo.persistent ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {storageInfo.quota > 0 && (
                    <>
                      <div className={`flex justify-between ${styles.subtext}`}>
                        <span>Used:</span>
                        <span className={styles.text}>{formatBytes(storageInfo.usage)}</span>
                      </div>
                      <div className={`flex justify-between ${styles.subtext}`}>
                        <span>Available:</span>
                        <span className={styles.text}>{formatBytes(storageInfo.quota)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Device Info */}
            <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-gray-800 border border-green-600/30' : theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className={`h-4 w-4 ${styles.text}`} />
                <span className={`font-semibold ${styles.text}`}>Device Info</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className={`flex justify-between ${styles.subtext}`}>
                  <span>iOS Device:</span>
                  <span className={storageInfo.isIOS ? 'text-blue-500' : styles.text}>
                    {storageInfo.isIOS ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className={`flex justify-between ${styles.subtext}`}>
                  <span>PWA Mode:</span>
                  <span className={storageInfo.isPWA ? 'text-blue-500' : styles.text}>
                    {storageInfo.isPWA ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            {storageInfo.isIOS && !storageInfo.persistent && (
              <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-yellow-900/20 border border-yellow-600/30' : theme === 'dark' ? 'bg-yellow-900/20' : 'bg-yellow-50'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  <div>
                    <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-700'}`}>
                      iOS Storage Notice
                    </p>
                    <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-600'}`}>
                      Use the app regularly to prevent iOS from clearing your data. Export important notes as backup.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {storageInfo.type === 'localStorage' && (
              <div className={`p-4 rounded-lg ${theme === 'fallout' ? 'bg-orange-900/20 border border-orange-600/30' : theme === 'dark' ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                  <div>
                    <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-orange-400' : 'text-orange-700'}`}>
                      Basic Storage Active
                    </p>
                    <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-orange-300' : 'text-orange-600'}`}>
                      Your data may be cleared by the browser. Consider using the mobile app for better persistence.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-between gap-3 mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStorageInfo}
            className={theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}
          >
            Refresh
          </Button>
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
