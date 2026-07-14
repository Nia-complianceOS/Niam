import { useAsync } from "./useAsync";
import { getRegulations } from "@/services/api/client";
import type { RegulationsResponse } from "@/types/api";

export function useRegulations() {
  return useAsync<RegulationsResponse>(getRegulations);
}