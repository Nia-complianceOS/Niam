import { useAsync } from '@/hooks/useAsync'
import { getVendors } from '@/services/api/client'
import type { VendorsResponse } from '@/types/api'

export function useVendors() {
  return useAsync<VendorsResponse>(() => getVendors())
}
