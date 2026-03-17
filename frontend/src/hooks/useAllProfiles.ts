"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadonlyProgram } from "@/lib/program";

export function useAllProfiles() {
  const program = useReadonlyProgram();

  return useQuery({
    queryKey: ["profiles"],
    refetchInterval: 10_000,
    queryFn: () => program.account.dnaProfile.all(),
  });
}
