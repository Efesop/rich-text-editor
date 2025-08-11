import '../styles/globals.css'
import { ThemeProvider } from 'next-themes'
import { AppErrorBoundary } from '../components/ErrorBoundary'
import useTagStore from '../store/tagStore'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }) {
  const loadTags = useTagStore(state => state.loadTags)

  useEffect(() => {
    loadTags()
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const register = async () => {
        try {
          await navigator.serviceWorker.register('/sw.js')
        } catch (err) {
          console.error('SW registration failed', err)
        }
      }
      register()
    }
  }, [loadTags])

  return (
    <AppErrorBoundary>
      <ThemeProvider 
        attribute="class" 
        themes={['light', 'dark', 'fallout']}
        defaultTheme="light"
      >
        <Component {...pageProps} />
      </ThemeProvider>
    </AppErrorBoundary>
  )
}

export default MyApp