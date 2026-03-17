"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAllProfiles } from "@/hooks/useAllProfiles";
import ProfileCard from "@/components/ProfileCard";
import WalletButton from "@/components/WalletButton";

export default function Home() {
  const { publicKey } = useWallet();
  const { data: profiles, isLoading, error } = useAllProfiles();

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-doma-blue/10 border border-doma-blue/20 flex items-center justify-center text-4xl shadow-glow-blue">
          🧬
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            Privacy-Preserving Genomic Matching
          </h2>
          <p className="text-white/50 max-w-md leading-relaxed text-sm">
            Upload your encrypted SNP profile. The Arcium MPC network privately
            computes genomic similarity — your raw data never leaves your device
            unencrypted.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 max-w-sm w-full text-center">
          {[
            { icon: "🔒", label: "Encrypted upload" },
            { icon: "📏", label: "Hamming distance" },
            { icon: "✅", label: "Threshold check" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="bg-doma-card border border-white/10 rounded-xl p-3 backdrop-blur-sm"
            >
              <div className="text-xl mb-1">{icon}</div>
              <p className="text-xs text-white/50">{label}</p>
            </div>
          ))}
        </div>
        <WalletButton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">DNA Profiles</h2>
          <p className="text-white/40 text-xs mt-0.5">
            {profiles?.length ?? 0} profile{profiles?.length !== 1 ? "s" : ""} on-chain
          </p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-2 px-5 py-2.5 rounded-[14px] bg-doma-blue hover:bg-white text-doma-dark font-bold text-sm transition-all transform hover:scale-105 shadow-glow-blue"
        >
          + Upload My Profile
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-white/40">
          <div className="w-5 h-5 border-2 border-white/20 border-t-doma-blue rounded-full animate-spin" />
          <span className="text-sm">Loading profiles…</span>
        </div>
      )}

      {error && (
        <div className="text-center py-8 rounded-2xl bg-red-900/10 border border-red-800/30 text-red-400 text-sm">
          Failed to load profiles. Check your connection.
        </div>
      )}

      {!isLoading && !error && profiles && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/40">
          <span className="text-4xl">🧬</span>
          <p className="text-sm">
            No profiles yet.{" "}
            <Link href="/upload" className="text-doma-blue hover:underline">
              Upload the first one
            </Link>
          </p>
        </div>
      )}

      {!isLoading && profiles && profiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(({ publicKey: pk, account }) => (
            <ProfileCard
              key={pk.toBase58()}
              profilePubkey={pk.toBase58()}
              owner={account.owner}
              isOwn={account.owner.toBase58() === publicKey.toBase58()}
            />
          ))}
        </div>
      )}

      <div className="bg-doma-card border border-white/5 rounded-2xl p-4 text-xs text-white/25 leading-relaxed">
        <span className="text-white/40 font-medium">How it works: </span>
        SNP data is packed and encrypted client-side using x25519 + RescueCipher before upload. Hamming distance and threshold checks run entirely inside the Arcium MPC network — the plaintext sequence is never revealed on-chain.
      </div>
    </div>
  );
}
