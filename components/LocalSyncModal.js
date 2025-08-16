import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { X, Wifi, Smartphone, Monitor, RefreshCw, Check, AlertCircle, Users, Shield } from 'lucide-react'
import { Button } from './ui/button'
import localSyncManager from '@/lib/localSync'
import { readPages, readTags } from '@/lib/persistentStorage'

export function LocalSyncModal({ isOpen, onClose, onSyncComplete }) {
  const { theme } = useTheme()
  const [syncMode, setSyncMode] = useState('discovery') // 'discovery', 'hosting', 'scanning'
  const [peers, setPeers] = useState([])
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle') // 'idle', 'syncing', 'success', 'error'
  const [syncProgress, setSyncProgress] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      initializeSync()
    } else {
      cleanupSync()
    }

    return () => cleanupSync()
  }, [isOpen])

  const initializeSync = () => {
    // Set up event handlers
    localSyncManager.onPeerDiscovered = handlePeerDiscovered
    localSyncManager.onPeerConnected = handlePeerConnected
    localSyncManager.onPeerDisconnected = handlePeerDisconnected
    localSyncManager.onSyncProgress = handleSyncProgress
    localSyncManager.onSyncComplete = handleSyncComplete
    localSyncManager.onError = handleError

    // Get device info
    setDeviceInfo(localSyncManager.getDeviceInfo())
    setPeers(localSyncManager.getPeers())
  }

  const cleanupSync = () => {
    localSyncManager.stopAdvertising()
    localSyncManager.stopScanning()
    setSyncMode('discovery')
    setPeers([])
    setSyncStatus('idle')
    setError(null)
  }

  const handlePeerDiscovered = (peer) => {
    setPeers(prev => {
      const updated = prev.filter(p => p.deviceId !== peer.deviceId)
      return [...updated, peer]
    })
  }

  const handlePeerConnected = (peer) => {
    setPeers(prev => prev.map(p => 
      p.deviceId === peer.deviceId ? peer : p
    ))
  }

  const handlePeerDisconnected = (peer) => {
    setPeers(prev => prev.map(p => 
      p.deviceId === peer.deviceId ? peer : p
    ))
  }

  const handleSyncProgress = (peerId, status) => {
    setSyncStatus('syncing')
    setSyncProgress(`${status} data...`)
  }

  const handleSyncComplete = async (peerId, result, syncData) => {
    setSyncStatus('success')
    setSyncProgress('Sync completed successfully!')
    
    if (onSyncComplete && syncData) {
      await onSyncComplete(syncData)
    }

    // Auto-close after success
    setTimeout(() => {
      onClose()
    }, 2000)
  }

  const handleError = (error) => {
    setError(error.message)
    setSyncStatus('error')
  }

  const startHosting = () => {
    const success = localSyncManager.startAdvertising()
    if (success) {
      setSyncMode('hosting')
      setSyncStatus('idle')
      setError(null)
    } else {
      setError('Failed to start hosting. BroadcastChannel not supported.')
    }
  }

  const startScanning = () => {
    const success = localSyncManager.startScanning()
    if (success) {
      setSyncMode('scanning')
      setSyncStatus('idle')
      setError(null)
      setPeers([])
    } else {
      setError('Failed to start scanning. BroadcastChannel not supported.')
    }
  }

  const connectToPeer = async (peer) => {
    try {
      setSyncStatus('syncing')
      setSyncProgress('Connecting to device...')
      
      await localSyncManager.connectToPeer(peer.deviceId)
      
      // Get current data to sync
      const [pages, tags] = await Promise.all([readPages(), readTags()])
      const syncData = { pages, tags, timestamp: Date.now() }
      
      setSyncProgress('Sending data...')
      await localSyncManager.syncWithPeer(peer.deviceId, syncData)
      
    } catch (error) {
      handleError(error)
    }
  }

  if (!isOpen) return null

  const getThemeStyles = () => {
    if (theme === 'fallout') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
        modal: 'fixed inset-4 md:inset-8 rounded-xl border-2 border-green-600 bg-gray-900 shadow-2xl shadow-green-600/20',
        text: 'text-green-400',
        subtext: 'text-green-300',
        card: 'bg-gray-800 border border-green-600',
        button: 'bg-green-600 text-gray-900 hover:bg-green-500'
      }
    } else if (theme === 'dark') {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        modal: 'fixed inset-4 md:inset-8 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl',
        text: 'text-gray-100',
        subtext: 'text-gray-300',
        card: 'bg-gray-800 border border-gray-700',
        button: 'bg-blue-600 text-white hover:bg-blue-500'
      }
    } else {
      return {
        overlay: 'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
        modal: 'fixed inset-4 md:inset-8 rounded-xl border border-gray-200 bg-white shadow-2xl',
        text: 'text-gray-900',
        subtext: 'text-gray-600',
        card: 'bg-gray-50 border border-gray-200',
        button: 'bg-blue-600 text-white hover:bg-blue-500'
      }
    }
  }

  const styles = getThemeStyles()

  const renderDiscoveryMode = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <Wifi className={`h-16 w-16 ${styles.text}`} />
        </div>
        <h3 className={`text-xl font-bold ${styles.text}`}>Local Network Sync</h3>
        <p className={`text-sm ${styles.subtext} max-w-md mx-auto`}>
          Securely sync your notes with other Dash devices on the same WiFi network. 
          All data is end-to-end encrypted and never leaves your local network.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={`p-6 rounded-lg ${styles.card}`}>
          <div className="text-center space-y-4">
            <Monitor className={`h-8 w-8 mx-auto ${styles.text}`} />
            <h4 className={`font-semibold ${styles.text}`}>Host Sync Session</h4>
            <p className={`text-sm ${styles.subtext}`}>
              Allow other devices to find and sync with this device
            </p>
            <Button 
              onClick={startHosting}
              className={styles.button}
              size="sm"
            >
              Start Hosting
            </Button>
          </div>
        </div>

        <div className={`p-6 rounded-lg ${styles.card}`}>
          <div className="text-center space-y-4">
            <Smartphone className={`h-8 w-8 mx-auto ${styles.text}`} />
            <h4 className={`font-semibold ${styles.text}`}>Find Devices</h4>
            <p className={`text-sm ${styles.subtext}`}>
              Scan for nearby devices hosting sync sessions
            </p>
            <Button 
              onClick={startScanning}
              className={styles.button}
              size="sm"
            >
              Scan for Devices
            </Button>
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-lg ${styles.card} flex items-start gap-3`}>
        <Shield className={`h-5 w-5 ${styles.text} mt-0.5`} />
        <div>
          <h5 className={`font-medium ${styles.text}`}>Privacy & Security</h5>
          <p className={`text-sm ${styles.subtext}`}>
            • All data is encrypted end-to-end<br/>
            • Sync only works on your local WiFi network<br/>
            • No data is sent to external servers<br/>
            • You control which devices can connect
          </p>
        </div>
      </div>
    </div>
  )

  const renderHostingMode = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <Monitor className={`h-12 w-12 ${styles.text}`} />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
        <h3 className={`text-xl font-bold ${styles.text}`}>Hosting Sync Session</h3>
        <p className={`text-sm ${styles.subtext}`}>
          Your device "{deviceInfo?.deviceName}" is now discoverable by other Dash devices on this network
        </p>
      </div>

      {peers.length > 0 && (
        <div className="space-y-3">
          <h4 className={`font-semibold ${styles.text} flex items-center gap-2`}>
            <Users className="h-4 w-4" />
            Connected Devices ({peers.length})
          </h4>
          {peers.map(peer => (
            <div key={peer.deviceId} className={`p-3 rounded-lg ${styles.card} flex items-center justify-between`}>
              <div>
                <div className={`font-medium ${styles.text}`}>{peer.deviceName}</div>
                <div className={`text-sm ${styles.subtext}`}>Status: {peer.status}</div>
              </div>
              {peer.status === 'connected' && (
                <Check className="h-5 w-5 text-green-500" />
              )}
            </div>
          ))}
        </div>
      )}

      <Button 
        onClick={() => {
          localSyncManager.stopAdvertising()
          setSyncMode('discovery')
        }}
        variant="ghost"
        size="sm"
        className={`w-full ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}`}
      >
        Stop Hosting
      </Button>
    </div>
  )

  const renderScanningMode = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <RefreshCw className={`h-12 w-12 ${styles.text} animate-spin`} />
        </div>
        <h3 className={`text-xl font-bold ${styles.text}`}>Scanning for Devices</h3>
        <p className={`text-sm ${styles.subtext}`}>
          Looking for nearby Dash devices hosting sync sessions...
        </p>
      </div>

      {peers.length > 0 && (
        <div className="space-y-3">
          <h4 className={`font-semibold ${styles.text}`}>Available Devices ({peers.length})</h4>
          {peers.map(peer => (
            <div key={peer.deviceId} className={`p-3 rounded-lg ${styles.card} flex items-center justify-between`}>
              <div>
                <div className={`font-medium ${styles.text}`}>{peer.deviceName}</div>
                <div className={`text-sm ${styles.subtext}`}>
                  {peer.status === 'discovered' && 'Ready to sync'}
                  {peer.status === 'connecting' && 'Connecting...'}
                  {peer.status === 'connected' && 'Connected'}
                </div>
              </div>
              <Button 
                onClick={() => connectToPeer(peer)}
                disabled={peer.status !== 'discovered' || syncStatus === 'syncing'}
                className={styles.button}
                size="sm"
              >
                {peer.status === 'discovered' && 'Sync'}
                {peer.status === 'connecting' && 'Connecting...'}
                {peer.status === 'connected' && 'Connected'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {peers.length === 0 && (
        <div className={`text-center p-6 rounded-lg ${styles.card}`}>
          <p className={`text-sm ${styles.subtext}`}>
            No devices found. Make sure another Dash device is hosting a sync session on this network.
          </p>
        </div>
      )}

      <Button 
        onClick={() => {
          localSyncManager.stopScanning()
          setSyncMode('discovery')
        }}
        variant="ghost"
        size="sm"
        className={`w-full ${theme === 'fallout' ? 'text-green-400 hover:bg-green-600/20' : ''}`}
      >
        Stop Scanning
      </Button>
    </div>
  )

  const renderSyncStatus = () => {
    if (syncStatus === 'idle') return null

    return (
      <div className={`p-4 rounded-lg ${styles.card} mt-4`}>
        <div className="flex items-center gap-3">
          {syncStatus === 'syncing' && <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />}
          {syncStatus === 'success' && <Check className="h-5 w-5 text-green-500" />}
          {syncStatus === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
          
          <div>
            <div className={`font-medium ${styles.text}`}>
              {syncStatus === 'syncing' && 'Syncing...'}
              {syncStatus === 'success' && 'Sync Complete!'}
              {syncStatus === 'error' && 'Sync Failed'}
            </div>
            {syncProgress && (
              <div className={`text-sm ${styles.subtext}`}>{syncProgress}</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className={`text-xl font-bold ${styles.text}`}>Local Network Sync</h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 ${styles.text}`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <span className="text-red-700 dark:text-red-400">{error}</span>
                </div>
              </div>
            )}

            {syncMode === 'discovery' && renderDiscoveryMode()}
            {syncMode === 'hosting' && renderHostingMode()}
            {syncMode === 'scanning' && renderScanningMode()}
            
            {renderSyncStatus()}
          </div>
        </div>
      </div>
    </div>
  )
}
