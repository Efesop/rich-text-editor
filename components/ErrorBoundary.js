import React from 'react'
import { useTheme } from 'next-themes'
import { AlertTriangle, RefreshCw, Home, Download } from 'lucide-react'
import { Button } from './ui/button'

// Main Error Boundary Class Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null 
    }
  }

  static getDerivedStateFromError(_error) {
    // Update state so the next render will show the fallback UI
    // Note: error details are captured in componentDidCatch
    return {
      hasError: true,
      errorId: Date.now().toString(36) + Math.random().toString(36).slice(2, 11)
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log the error
    console.error('Error Boundary caught an error:', error, errorInfo)
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    })

    // Send error to logging service if available
    this.logErrorToService(error, errorInfo)
  }

  logErrorToService = (error, errorInfo) => {
    try {
      // Create error report
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorId: this.state.errorId
      }

      // Log to console for development
      console.log('Error Report:', errorReport)

      // In a real app, you might send this to a logging service
      // analytics.track('App Error', errorReport)
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null 
    })
  }

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          onReload={this.handleReload}
          onReset={this.handleReset}
          resetErrorBoundary={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

// Standalone update checker for the error fallback — works even when main app is crashed
function ErrorUpdateChecker() {
  const [updateStatus, setUpdateStatus] = React.useState(null) // null | 'checking' | 'available' | 'downloading' | 'ready'
  const [progress, setProgress] = React.useState(0)

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return

    // Check for updates immediately
    window.electron.invoke('check-for-updates').catch(() => {})

    const onAvailable = (info) => setUpdateStatus('available')
    const onDownloaded = () => setUpdateStatus('ready')
    const onProgress = (p) => { setProgress(p?.percent || 0); setUpdateStatus('downloading') }

    window.electron.on('update-available', onAvailable)
    window.electron.on('update-downloaded', onDownloaded)
    window.electron.on('download-progress', onProgress)

    return () => {
      window.electron.removeListener('update-available', onAvailable)
      window.electron.removeListener('update-downloaded', onDownloaded)
      window.electron.removeListener('download-progress', onProgress)
    }
  }, [])

  if (!updateStatus || typeof window === 'undefined' || !window.electron) return null

  if (updateStatus === 'ready') {
    return (
      <Button onClick={() => window.electron.invoke('install-update')} className="w-full" variant="default">
        <Download className="w-4 h-4 mr-2" />
        Install Update &amp; Restart
      </Button>
    )
  }

  if (updateStatus === 'downloading') {
    return (
      <div className="w-full text-center text-sm opacity-70">
        Downloading update... {Math.round(progress)}%
      </div>
    )
  }

  if (updateStatus === 'available') {
    return (
      <Button onClick={() => { window.electron.invoke('download-update'); setUpdateStatus('downloading') }} className="w-full" variant="default">
        <Download className="w-4 h-4 mr-2" />
        Download Update
      </Button>
    )
  }

  return null
}

// Functional Error Fallback Component
function ErrorFallback({ error, errorInfo, errorId, onReload, onReset }) {
  const { theme } = useTheme()
  const [showDetails, setShowDetails] = React.useState(false)

  const isDevelopment = process.env.NODE_ENV === 'development'

  const isDarkBlue = theme === 'darkblue'

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      isDarkBlue ? 'bg-[#0c1017] text-[#e0e6f0]' : theme === 'dark' ? 'bg-[#1a1a1a] text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      <div className={`max-w-md w-full text-center space-y-6 p-8 rounded-lg shadow-lg ${
        isDarkBlue ? 'bg-[#1a2035] border border-[#1c2438]' : theme === 'dark' ? 'bg-[#2f2f2f] border border-[#3a3a3a]' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex justify-center">
          <AlertTriangle className={`h-16 w-16 ${
            isDarkBlue ? 'text-red-400' : theme === 'dark' ? 'text-red-400' : 'text-red-500'
          }`} />
        </div>

        <div>
          <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong</h1>
          <p className={`text-sm ${
            isDarkBlue ? 'text-[#8b99b5]' : theme === 'dark' ? 'text-[#c0c0c0]' : 'text-gray-600'
          }`}>
            We&apos;re sorry, but something unexpected happened. Your data is safe.
          </p>
        </div>

        <div className="space-y-3">
          <ErrorUpdateChecker />

          <Button
            onClick={onReset}
            className="w-full"
            variant="default"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>

          <Button
            onClick={onReload}
            variant="outline"
            className="w-full"
          >
            <Home className="w-4 h-4 mr-2" />
            Reload Application
          </Button>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => setShowDetails(!showDetails)}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            {showDetails ? 'Hide' : 'Show'} {isDevelopment ? 'Technical Details' : 'Error Details'}
          </Button>

          {showDetails && (
            <div className={`text-left text-xs p-4 rounded border overflow-auto max-h-40 ${
              isDarkBlue
                ? 'bg-[#0c1017] border-[#1c2438] text-[#8b99b5]'
                : theme === 'dark'
                  ? 'bg-[#1a1a1a] border-[#3a3a3a] text-[#c0c0c0]'
                  : 'bg-gray-100 border-gray-300 text-gray-700'
            }`}>
              <div className="mb-2">
                <strong>Error ID:</strong> {errorId}
              </div>
              {error && (
                <div className="mb-2">
                  <strong>Error:</strong> {error.message}
                </div>
              )}
              {/* Only show full stack traces in development */}
              {isDevelopment && error?.stack && (
                <div className="mb-2">
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap text-xs mt-1">
                    {error.stack}
                  </pre>
                </div>
              )}
              {isDevelopment && errorInfo?.componentStack && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="whitespace-pre-wrap text-xs mt-1">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
              {!isDevelopment && (
                <div className={`mt-2 pt-2 border-t ${isDarkBlue ? 'border-[#1c2438]' : theme === 'dark' ? 'border-[#3a3a3a]' : 'border-gray-300'}`}>
                  <p className="text-xs opacity-75">
                    Please include this Error ID when reporting issues.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`text-xs ${
          isDarkBlue ? 'text-[#5d6b88]' : theme === 'dark' ? 'text-[#8e8e8e]' : 'text-gray-500'
        }`}>
          Error ID: {errorId}
        </div>
      </div>
    </div>
  )
}

// Editor-specific Error Boundary
export class EditorErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Editor Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto" />
            <div>
              <h3 className="text-lg font-medium">Editor Loading Error</h3>
              <p className="text-sm text-gray-600 mt-1">
                The editor failed to load. Please refresh the page.
              </p>
            </div>
            <Button 
              onClick={() => window.location.reload()}
              size="sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Sidebar-specific Error Boundary
export function SidebarErrorBoundary({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}

// High-level App Error Boundary wrapper
export function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}

export default ErrorBoundary 