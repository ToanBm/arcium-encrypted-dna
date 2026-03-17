"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SystemProgram } from "@solana/web3.js";
import { useAnchorProgram } from "@/lib/program";
import { getDnaProfilePda } from "@/lib/pda";
import { encryptSnpProfile } from "@/lib/encrypt";
import { PROGRAM_ID } from "@/lib/constants";

export function useUploadProfile() {
  const ctx = useAnchorProgram();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snpBytes: Uint8Array) => {
      if (!ctx) throw new Error("Wallet not connected");
      const { program, provider } = ctx;
      const payer = provider.wallet.publicKey;

      const { snpCt, snpPubKey, nonceBN } = await encryptSnpProfile(provider, snpBytes);
      const [profilePda] = getDnaProfilePda(payer, PROGRAM_ID);

      await program.methods
        .uploadProfile(snpCt, snpPubKey, nonceBN)
        .accountsPartial({
          payer,
          profile: profilePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      return profilePda.toBase58();
    },
    onSuccess: (_profilePda) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      if (ctx) {
        const payer = ctx.provider.wallet.publicKey;
        const [pda] = getDnaProfilePda(payer, PROGRAM_ID);
        queryClient.invalidateQueries({ queryKey: ["profile", pda.toBase58()] });
      }
    },
  });
}
