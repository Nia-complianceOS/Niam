import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useCanonical() {
  const location = useLocation()

  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
    const isNew = !link

    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
    }

    link.href = `https://niam.dev${location.pathname}`

    if (isNew) {
      document.head.appendChild(link)
    }

    return () => {
      if (link && document.head.contains(link)) {
        document.head.removeChild(link)
      }
    }
  }, [location.pathname])
}
