"use client";

import Link from "next/link";
import { PublicKey } from "@solana/web3.js";

interface Props {
  profilePubkey: string;
  owner: PublicKey;
  isOwn?: boolean;
}

export default function ProfileCard({ profilePubkey, owner, isOwn }: Props) {
  const ownerStr = owner.toBase58();
  const shortOwner = `${ownerStr.slice(0, 6)}…${ownerStr.slice(-4)}`;
  const shortPda = `${profilePubkey.slice(0, 6)}…${profilePubkey.slice(-4)}`;

  return (
    <div className="bg-doma-card border border-white/10 rounded-2xl p-4 backdrop-blur-md space-y-3 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-full bg-doma-blue/10 border border-doma-blue/20 flex items-center justify-center text-xl flex-shrink-0">
          🧬
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-white/70 truncate">{shortOwner}</span>
            {isOwn && (
              <span className="px-1.5 py-0.5 rounded-full bg-doma-blue/15 border border-doma-blue/30 text-doma-blue text-xs font-medium">
                You
              </span>
            )}
          </div>
          <p className="text-white/25 text-xs font-mono mt-0.5">PDA: {shortPda}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/match/${profilePubkey}`}
          className={`flex-1 text-center px-3 py-2 rounded-[12px] text-xs font-bold transition-all ${
            isOwn
              ? "border border-white/10 text-white/30 cursor-default pointer-events-none"
              : "bg-doma-blue/10 border border-doma-blue/30 text-doma-blue hover:bg-doma-blue/20"
          }`}
        >
          {isOwn ? "Your profile" : "Run Match →"}
        </Link>
      </div>
    </div>
  );
}
