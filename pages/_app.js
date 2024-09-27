import '../styles/globals.css'
import { ThemeProvider } from 'next-themes'
import useTagStore from '../store/tagStore'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }) {
  const loadTags = useTagStore(state => state.loadTags)

  useEffect(() => {
    loadTags()
  }, [loadTags])

  return (
    <ThemeProvider attribute="class">
      <Component {...pageProps} />
    </ThemeProvider>
  )
}

export default MyApp