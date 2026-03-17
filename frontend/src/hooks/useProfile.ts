"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useAnchorProgram } from "@/lib/program";

export function useProfile(pubkey: string | null) {
  const ctx = useAnchorProgram();

  return useQuery({
    queryKey: ["profile", pubkey],
    enabled: !!ctx && !!pubkey,
    refetchInterval: 5000,
    queryFn: async () => {
      if (!ctx || !pubkey) return null;
      return ctx.program.account.dnaProfile.fetchNullable(new PublicKey(pubkey));
    },
  });
}
