import { useDocumentTitle } from './useDocumentTitle'
import { useMetaDescription } from './useMetaDescription'
import { useCanonical } from './useCanonical'

export function useSEO({ title, description }: { title: string; description: string }) {
  useDocumentTitle(title)
  useMetaDescription(description)
  useCanonical()
}
