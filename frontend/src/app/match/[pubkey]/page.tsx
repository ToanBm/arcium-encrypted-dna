"use client";

import { use, useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useProfile } from "@/hooks/useProfile";
import { useRequestHamming } from "@/hooks/useRequestHamming";
import { useRequestThreshold } from "@/hooks/useRequestThreshold";
import { useAnchorProgram } from "@/lib/program";
import { getDnaProfilePda } from "@/lib/pda";
import { PROGRAM_ID } from "@/lib/constants";
import WalletButton from "@/components/WalletButton";

interface PageProps {
  params: Promise<{ pubkey: string }>;
}

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);
  if (!running) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-white/40">
      <div className="w-3 h-3 border-2 border-white/20 border-t-doma-blue rounded-full animate-spin flex-shrink-0" />
      <span>
        MPC computing… {elapsed}s{elapsed >= 10 ? " (1–3 min on devnet)" : ""}
      </span>
    </div>
  );
}

export default function MatchPage({ params }: PageProps) {
  const { pubkey } = use(params);
  const { publicKey } = useWallet();
  const ctx = useAnchorProgram();

  const { data: targetProfile, isLoading } = useProfile(pubkey);
  const requestHamming = useRequestHamming();
  const requestThreshold = useRequestThreshold();

  const [thresholdPct, setThresholdPct] = useState(70);
  const [hammingResult, setHammingResult] = useState<number | null>(null);
  const [thresholdResult, setThresholdResult] = useState<boolean | null>(null);
  const [hammingError, setHammingError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [myProfileExists, setMyProfileExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!publicKey || !ctx) return;
    const [pda] = getDnaProfilePda(publicKey, PROGRAM_ID);
    ctx.program.account.dnaProfile.fetchNullable(pda).then((acc) => {
      setMyProfileExists(acc !== null);
    });
  }, [publicKey, ctx]);

  if (!publicKey) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-white/50 text-sm">Connect your wallet to run a match.</p>
        <WalletButton />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-white/40">
        <div className="w-5 h-5 border-2 border-white/20 border-t-doma-blue rounded-full animate-spin" />
        <span className="text-sm">Loading profile…</span>
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="text-center py-16 rounded-2xl bg-red-900/10 border border-red-800/30 text-red-400 text-sm">
        Profile not found.
      </div>
    );
  }

  const ownerStr = targetProfile.owner.toBase58();
  const isOwnProfile = ownerStr === publicKey.toBase58();

  async function handleHamming() {
    setHammingError(null);
    setHammingResult(null);
    try {
      const dist = await requestHamming.mutateAsync(pubkey);
      setHammingResult(dist);
    } catch (err: unknown) {
      setHammingError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleThreshold() {
    setThresholdError(null);
    setThresholdResult(null);
    try {
      const match = await requestThreshold.mutateAsync({ targetProfilePubkey: pubkey, thresholdPct });
      setThresholdResult(match);
    } catch (err: unknown) {
      setThresholdError(err instanceof Error ? err.message : String(err));
    }
  }

  // Hamming similarity: 0 = identical (1024 max difference for 128 bytes × 8 bits)
  const MAX_HAMMING = 1024;
  const similarityPct = hammingResult !== null
    ? Math.round((1 - hammingResult / MAX_HAMMING) * 100)
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/" className="text-white/30 hover:text-white transition-colors text-sm">
        ← All Profiles
      </Link>

      {/* Target profile header */}
      <div className="bg-doma-card border border-white/10 rounded-2xl p-5 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-doma-blue/10 border border-doma-blue/20 flex items-center justify-center text-xl">
            🧬
          </div>
          <div>
            <h1 className="text-white font-bold">Genomic Match</h1>
            <p className="text-white/30 text-xs font-mono">{ownerStr.slice(0, 16)}…{ownerStr.slice(-6)}</p>
          </div>
        </div>
        <p className="text-white/30 text-xs font-mono mt-1">Profile: {pubkey.slice(0, 16)}…{pubkey.slice(-6)}</p>
      </div>

      {isOwnProfile && (
        <div className="rounded-2xl bg-yellow-900/20 border border-yellow-800/40 px-4 py-3 text-sm text-yellow-400">
          This is your own profile. Select another user&apos;s profile to run a match.
        </div>
      )}

      {myProfileExists === false && (
        <div className="rounded-2xl bg-doma-blue/5 border border-doma-blue/20 px-4 py-3 text-sm text-doma-blue/80">
          You need to{" "}
          <Link href="/upload" className="underline font-medium">upload your own profile</Link>
          {" "}before running a match.
        </div>
      )}

      {!isOwnProfile && myProfileExists && (
        <>
          {/* Hamming Distance */}
          <div className="bg-doma-card border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-md">
            <div>
              <h2 className="text-white font-semibold">Hamming Distance</h2>
              <p className="text-white/40 text-xs mt-0.5">
                Counts differing bits between the two SNP sequences. Lower = more similar. Max = 1024 (128 bytes × 8 bits).
              </p>
            </div>

            <button
              onClick={handleHamming}
              disabled={requestHamming.isPending || requestThreshold.isPending}
              className="w-full px-5 py-2.5 rounded-[14px] bg-doma-blue hover:bg-white text-doma-dark font-bold text-sm transition-all transform hover:scale-105 shadow-glow-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              {requestHamming.isPending ? "Computing via MPC…" : "Compute Hamming Distance"}
            </button>

            <ElapsedTimer running={requestHamming.isPending} />

            {hammingResult !== null && (
              <div className="rounded-[14px] bg-emerald-900/20 border border-emerald-700/40 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Hamming distance</span>
                  <span className="text-2xl font-bold text-white font-mono">{hammingResult}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50">Similarity</span>
                  <span className={`text-lg font-bold ${similarityPct! >= 70 ? "text-emerald-400" : similarityPct! >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                    {similarityPct}%
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${similarityPct! >= 70 ? "bg-emerald-400" : similarityPct! >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${similarityPct}%` }}
                  />
                </div>
                <p className="text-xs text-white/25">Computed privately by the Arcium MPC network — neither sequence was revealed.</p>
              </div>
            )}

            {hammingError && (
              <div className="rounded-[14px] bg-red-900/20 border border-red-800/40 px-3 py-2.5 text-sm text-red-400">
                {hammingError}
              </div>
            )}
          </div>

          {/* Threshold Check */}
          <div className="bg-doma-card border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-md">
            <div>
              <h2 className="text-white font-semibold">Threshold Match</h2>
              <p className="text-white/40 text-xs mt-0.5">
                Returns only a yes/no — more private than the raw distance. Checks if similarity meets the required percentage.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white/80">Required similarity</label>
                <span className="font-mono text-doma-blue font-bold">{thresholdPct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(Number(e.target.value))}
                disabled={requestThreshold.isPending}
                className="w-full accent-[#4AC6FF]"
              />
              <div className="flex justify-between text-xs text-white/25 mt-1">
                <span>0% (any)</span>
                <span>50%</span>
                <span>100% (identical)</span>
              </div>
            </div>

            <button
              onClick={handleThreshold}
              disabled={requestHamming.isPending || requestThreshold.isPending}
              className="w-full px-5 py-2.5 rounded-[14px] border border-doma-blue/40 text-doma-blue font-bold text-sm hover:bg-doma-blue/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {requestThreshold.isPending ? "Checking via MPC…" : `Check ≥ ${thresholdPct}% Match`}
            </button>

            <ElapsedTimer running={requestThreshold.isPending} />

            {thresholdResult !== null && (
              <div className={`rounded-[14px] px-4 py-3 border ${thresholdResult ? "bg-emerald-900/20 border-emerald-700/40" : "bg-red-900/20 border-red-800/40"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{thresholdResult ? "✅" : "❌"}</span>
                  <div>
                    <p className={`font-bold ${thresholdResult ? "text-emerald-400" : "text-red-400"}`}>
                      {thresholdResult ? `Match — similarity ≥ ${thresholdPct}%` : `No match — similarity < ${thresholdPct}%`}
                    </p>
                    <p className="text-xs text-white/25 mt-0.5">Only the boolean result was revealed.</p>
                  </div>
                </div>
              </div>
            )}

            {thresholdError && (
              <div className="rounded-[14px] bg-red-900/20 border border-red-800/40 px-3 py-2.5 text-sm text-red-400">
                {thresholdError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
