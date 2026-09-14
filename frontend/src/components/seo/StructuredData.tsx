import { useEffect } from 'react'

export function StructuredData({ data }: { data: Record<string, unknown> }) {
  const jsonString = JSON.stringify(data)

  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = jsonString
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [jsonString])

  return null
}
