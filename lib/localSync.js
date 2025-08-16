// Local Network Sync - Privacy-first peer-to-peer sync between devices on same WiFi
import { encrypt, decrypt, generateKey } from '@/utils/cryptoUtils'

class LocalSyncManager {
  constructor() {
    this.deviceId = this.generateDeviceId()
    this.deviceName = this.getDeviceName()
    this.isHost = false
    this.isClient = false
    this.peers = new Map()
    this.broadcastChannel = null
    this.webRTCConnections = new Map()
    this.syncKey = null
    this.onPeerDiscovered = null
    this.onPeerConnected = null
    this.onPeerDisconnected = null
    this.onSyncProgress = null
    this.onSyncComplete = null
    this.onError = null
    
    this.init()
  }

  init() {
    // Create broadcast channel for local discovery
    if ('BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('dash-local-sync')
      this.broadcastChannel.onmessage = this.handleBroadcastMessage.bind(this)
    }
    
    // Generate or retrieve sync keys
    this.initSyncKeys()
  }

  generateDeviceId() {
    let deviceId = localStorage.getItem('dash-device-id')
    if (!deviceId) {
      deviceId = 'dash-' + Math.random().toString(36).substring(2, 15)
      localStorage.setItem('dash-device-id', deviceId)
    }
    return deviceId
  }

  getDeviceName() {
    let deviceName = localStorage.getItem('dash-device-name')
    if (!deviceName) {
      // Try to detect device type
      const userAgent = navigator.userAgent
      if (/iPhone|iPad|iPod/i.test(userAgent)) {
        deviceName = 'iPhone'
      } else if (/Android/i.test(userAgent)) {
        deviceName = 'Android'
      } else if (/Mac/i.test(userAgent)) {
        deviceName = 'Mac'
      } else if (/Windows/i.test(userAgent)) {
        deviceName = 'Windows'
      } else {
        deviceName = 'Device'
      }
      deviceName += ' - ' + Math.random().toString(36).substring(2, 6).toUpperCase()
      localStorage.setItem('dash-device-name', deviceName)
    }
    return deviceName
  }

  async initSyncKeys() {
    let syncKey = localStorage.getItem('dash-sync-key')
    if (!syncKey) {
      // Generate new sync key for this device
      syncKey = await generateKey()
      localStorage.setItem('dash-sync-key', syncKey)
    }
    this.syncKey = syncKey
  }

  // Start advertising this device for sync
  startAdvertising() {
    if (!this.broadcastChannel) {
      console.error('BroadcastChannel not supported')
      return false
    }

    this.isHost = true
    console.log('Starting sync advertising as:', this.deviceName)
    
    // Broadcast availability every 2 seconds
    this.advertisingInterval = setInterval(() => {
      this.broadcastChannel.postMessage({
        type: 'DEVICE_AVAILABLE',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        timestamp: Date.now()
      })
    }, 2000)

    return true
  }

  // Stop advertising
  stopAdvertising() {
    if (this.advertisingInterval) {
      clearInterval(this.advertisingInterval)
      this.advertisingInterval = null
    }
    this.isHost = false
    
    // Notify that we're no longer available
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'DEVICE_UNAVAILABLE',
        deviceId: this.deviceId,
        timestamp: Date.now()
      })
    }
  }

  // Scan for nearby devices
  startScanning() {
    if (!this.broadcastChannel) {
      console.error('BroadcastChannel not supported')
      return false
    }

    console.log('Scanning for nearby devices...')
    this.isClient = true
    
    // Clear existing peers
    this.peers.clear()
    
    // Send discovery request
    this.broadcastChannel.postMessage({
      type: 'DEVICE_DISCOVERY',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      timestamp: Date.now()
    })

    return true
  }

  stopScanning() {
    this.isClient = false
  }

  handleBroadcastMessage(event) {
    const { type, deviceId, deviceName, timestamp } = event.data

    // Ignore messages from ourselves
    if (deviceId === this.deviceId) return

    switch (type) {
      case 'DEVICE_DISCOVERY':
        // Someone is looking for devices, respond if we're advertising
        if (this.isHost) {
          this.broadcastChannel.postMessage({
            type: 'DEVICE_AVAILABLE',
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            timestamp: Date.now()
          })
        }
        break

      case 'DEVICE_AVAILABLE':
        // Found a device
        if (this.isClient || this.isHost) {
          const peer = {
            deviceId,
            deviceName,
            lastSeen: timestamp,
            status: 'discovered'
          }
          
          this.peers.set(deviceId, peer)
          if (this.onPeerDiscovered) {
            this.onPeerDiscovered(peer)
          }
        }
        break

      case 'DEVICE_UNAVAILABLE':
        // Device went offline
        if (this.peers.has(deviceId)) {
          const peer = this.peers.get(deviceId)
          peer.status = 'offline'
          this.peers.set(deviceId, peer)
          
          if (this.onPeerDisconnected) {
            this.onPeerDisconnected(peer)
          }
        }
        break

      case 'SYNC_REQUEST':
        // Someone wants to sync with us
        if (this.isHost) {
          this.handleSyncRequest(event.data)
        }
        break
    }
  }

  // Connect to a peer for syncing
  async connectToPeer(deviceId) {
    const peer = this.peers.get(deviceId)
    if (!peer) {
      throw new Error('Peer not found')
    }

    console.log('Connecting to peer:', peer.deviceName)

    try {
      // Create WebRTC connection
      const connection = await this.createWebRTCConnection(deviceId)
      
      // Send sync request via broadcast channel
      this.broadcastChannel.postMessage({
        type: 'SYNC_REQUEST',
        fromDeviceId: this.deviceId,
        fromDeviceName: this.deviceName,
        toDeviceId: deviceId,
        connectionId: connection.id,
        timestamp: Date.now()
      })

      peer.status = 'connecting'
      this.peers.set(deviceId, peer)

      return connection
    } catch (error) {
      console.error('Failed to connect to peer:', error)
      if (this.onError) {
        this.onError(error)
      }
      throw error
    }
  }

  async createWebRTCConnection(peerId) {
    // WebRTC configuration with STUN servers for NAT traversal
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }

    const connection = new RTCPeerConnection(config)
    const connectionId = Math.random().toString(36).substring(2, 15)
    
    // Create data channel for sync
    const dataChannel = connection.createDataChannel('sync', {
      ordered: true
    })

    const rtcConnection = {
      id: connectionId,
      peerId: peerId,
      connection: connection,
      dataChannel: dataChannel,
      isInitiator: true,
      status: 'connecting'
    }

    this.webRTCConnections.set(connectionId, rtcConnection)

    // Set up event handlers
    this.setupWebRTCHandlers(rtcConnection)

    return rtcConnection
  }

  setupWebRTCHandlers(rtcConnection) {
    const { connection, dataChannel, peerId } = rtcConnection

    // Connection state changes
    connection.onconnectionstatechange = () => {
      console.log('WebRTC connection state:', connection.connectionState)
      rtcConnection.status = connection.connectionState
      
      if (connection.connectionState === 'connected') {
        const peer = this.peers.get(peerId)
        if (peer) {
          peer.status = 'connected'
          this.peers.set(peerId, peer)
          if (this.onPeerConnected) {
            this.onPeerConnected(peer)
          }
        }
      } else if (connection.connectionState === 'disconnected' || 
                 connection.connectionState === 'failed') {
        this.handlePeerDisconnected(peerId)
      }
    }

    // Data channel handlers
    dataChannel.onopen = () => {
      console.log('Data channel opened with:', peerId)
    }

    dataChannel.onmessage = (event) => {
      this.handleSyncMessage(event.data, rtcConnection)
    }

    dataChannel.onerror = (error) => {
      console.error('Data channel error:', error)
      if (this.onError) {
        this.onError(error)
      }
    }

    // Handle incoming data channels (for peers connecting to us)
    connection.ondatachannel = (event) => {
      const incomingChannel = event.channel
      rtcConnection.dataChannel = incomingChannel
      
      incomingChannel.onmessage = (event) => {
        this.handleSyncMessage(event.data, rtcConnection)
      }
    }
  }

  handlePeerDisconnected(peerId) {
    const peer = this.peers.get(peerId)
    if (peer) {
      peer.status = 'disconnected'
      this.peers.set(peerId, peer)
      
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(peer)
      }
    }

    // Clean up WebRTC connections
    for (const [connectionId, rtcConnection] of this.webRTCConnections.entries()) {
      if (rtcConnection.peerId === peerId) {
        rtcConnection.connection.close()
        this.webRTCConnections.delete(connectionId)
      }
    }
  }

  // Sync data with connected peer
  async syncWithPeer(peerId, syncData) {
    const rtcConnection = Array.from(this.webRTCConnections.values())
      .find(conn => conn.peerId === peerId && conn.status === 'connected')

    if (!rtcConnection || !rtcConnection.dataChannel) {
      throw new Error('No active connection to peer')
    }

    try {
      // Encrypt sync data
      const encryptedData = await encrypt(JSON.stringify(syncData), this.syncKey)
      
      // Send encrypted data
      const message = {
        type: 'SYNC_DATA',
        data: encryptedData,
        timestamp: Date.now(),
        fromDevice: this.deviceName
      }

      rtcConnection.dataChannel.send(JSON.stringify(message))
      
      if (this.onSyncProgress) {
        this.onSyncProgress(peerId, 'sending')
      }

    } catch (error) {
      console.error('Failed to sync with peer:', error)
      if (this.onError) {
        this.onError(error)
      }
      throw error
    }
  }

  async handleSyncMessage(messageData, rtcConnection) {
    try {
      const message = JSON.parse(messageData)
      
      switch (message.type) {
        case 'SYNC_DATA':
          await this.processSyncData(message, rtcConnection)
          break
        case 'SYNC_ACK':
          if (this.onSyncComplete) {
            this.onSyncComplete(rtcConnection.peerId, 'success')
          }
          break
      }
    } catch (error) {
      console.error('Failed to handle sync message:', error)
      if (this.onError) {
        this.onError(error)
      }
    }
  }

  async processSyncData(message, rtcConnection) {
    try {
      // Decrypt received data
      const decryptedData = await decrypt(message.data, this.syncKey)
      const syncData = JSON.parse(decryptedData)
      
      if (this.onSyncProgress) {
        this.onSyncProgress(rtcConnection.peerId, 'receiving')
      }

      // Process the sync data (this would be implemented based on your needs)
      // For now, we'll just acknowledge receipt
      const ackMessage = {
        type: 'SYNC_ACK',
        timestamp: Date.now(),
        fromDevice: this.deviceName
      }

      rtcConnection.dataChannel.send(JSON.stringify(ackMessage))
      
      if (this.onSyncComplete) {
        this.onSyncComplete(rtcConnection.peerId, 'received', syncData)
      }

    } catch (error) {
      console.error('Failed to process sync data:', error)
      throw error
    }
  }

  // Get list of discovered peers
  getPeers() {
    return Array.from(this.peers.values())
  }

  // Get device info
  getDeviceInfo() {
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      isHost: this.isHost,
      isClient: this.isClient,
      connectedPeers: this.getPeers().filter(p => p.status === 'connected').length
    }
  }

  // Clean up
  destroy() {
    this.stopAdvertising()
    this.stopScanning()
    
    // Close all WebRTC connections
    for (const rtcConnection of this.webRTCConnections.values()) {
      rtcConnection.connection.close()
    }
    this.webRTCConnections.clear()
    
    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close()
    }
  }
}

// Export singleton instance
const localSyncManager = new LocalSyncManager()
export default localSyncManager
