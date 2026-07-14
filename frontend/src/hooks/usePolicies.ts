import { useAsync } from "./useAsync";
import { getPolicies } from "@/services/api/client";
import type { PoliciesResponse } from "@/types/api";

export function usePolicies() {
  return useAsync<PoliciesResponse>(getPolicies);
}