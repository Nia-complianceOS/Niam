import { useAsync } from "./useAsync";
import { getAuditTrail } from "@/services/api/client";
import type { AuditResponse } from "@/types/api";

export function useAuditTrail() {
  return useAsync<AuditResponse>(getAuditTrail);
}