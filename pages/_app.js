import '../styles/globals.css'
import { ThemeProvider } from 'next-themes'
import { AppErrorBoundary } from '../components/ErrorBoundary'
import useTagStore from '../store/tagStore'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }) {
  const loadTags = useTagStore(state => state.loadTags)

  useEffect(() => {
    loadTags()
  }, [loadTags])

  return (
    <AppErrorBoundary>
      <ThemeProvider attribute="class">
        <Component {...pageProps} />
      </ThemeProvider>
    </AppErrorBoundary>
  )
}

export default MyApp