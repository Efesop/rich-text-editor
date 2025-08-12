import React from 'react'
import { useTheme } from 'next-themes'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
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

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      errorId: Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
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

// Functional Error Fallback Component
function ErrorFallback({ error, errorInfo, errorId, onReload, onReset }) {
  const { theme } = useTheme()
  const [showDetails, setShowDetails] = React.useState(false)

  const isDevelopment = process.env.NODE_ENV === 'development'

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      <div className={`max-w-md w-full text-center space-y-6 p-8 rounded-lg shadow-lg ${
        theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex justify-center">
          <AlertTriangle className={`h-16 w-16 ${
            theme === 'dark' ? 'text-red-400' : 'text-red-500'
          }`} />
        </div>

        <div>
          <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong</h1>
          <p className={`text-sm ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            We're sorry, but something unexpected happened. Your data is safe.
          </p>
        </div>

        <div className="space-y-3">
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

        {isDevelopment && (
          <div className="space-y-3">
            <Button 
              onClick={() => setShowDetails(!showDetails)}
              variant="ghost"
              size="sm"
              className="w-full"
            >
              {showDetails ? 'Hide' : 'Show'} Technical Details
            </Button>

            {showDetails && (
              <div className={`text-left text-xs p-4 rounded border overflow-auto max-h-40 ${
                theme === 'dark' 
                  ? 'bg-gray-900 border-gray-600 text-gray-300' 
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
                {error?.stack && (
                  <div className="mb-2">
                    <strong>Stack:</strong>
                    <pre className="whitespace-pre-wrap text-xs mt-1">
                      {error.stack}
                    </pre>
                  </div>
                )}
                {errorInfo?.componentStack && (
                  <div>
                    <strong>Component Stack:</strong>
                    <pre className="whitespace-pre-wrap text-xs mt-1">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className={`text-xs ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
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

  static getDerivedStateFromError(error) {
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