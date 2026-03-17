"use client";

import Link from "next/link";
import WalletButton from "@/components/WalletButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAnchorProgram } from "@/lib/program";
import { getDnaProfilePda } from "@/lib/pda";
import { PROGRAM_ID } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";

function useMyProfile() {
  const { publicKey } = useWallet();
  const ctx = useAnchorProgram();
  return useQuery({
    queryKey: ["my-profile", publicKey?.toBase58()],
    enabled: !!publicKey && !!ctx,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!publicKey || !ctx) return null;
      const [pda] = getDnaProfilePda(publicKey, PROGRAM_ID);
      return ctx.program.account.dnaProfile.fetchNullable(pda);
    },
  });
}

export default function Nav() {
  const { publicKey } = useWallet();
  const { data: myProfile } = useMyProfile();

  return (
    <header className="sticky top-0 z-40 px-4 sm:px-6 pt-3">
      <div className="w-4/5 mx-auto bg-doma-card border border-white/10 rounded-[20px] px-6 py-3 backdrop-blur-xl flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-xl leading-none">🧬</span>
          <div>
            <h1 className="text-sm font-logo font-extrabold text-white leading-none tracking-wide">
              Encrypted DNA
            </h1>
            <p className="text-xs text-white/40 leading-none mt-0.5">Powered by Arcium MPC</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {publicKey && (
            <>
              {myProfile ? (
                <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-emerald-900/20 border border-emerald-700/30 text-emerald-400 text-xs font-medium">
                  ✓ Profile uploaded
                </span>
              ) : (
                <Link
                  href="/upload"
                  className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-[14px] text-sm font-medium border border-doma-blue/30 text-doma-blue hover:bg-doma-blue/10 transition-colors"
                >
                  + Upload Profile
                </Link>
              )}
            </>
          )}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
