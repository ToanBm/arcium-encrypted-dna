"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUploadProfile } from "@/hooks/useUploadProfile";
import { randomSnpBytes } from "@/lib/encrypt";
import WalletButton from "@/components/WalletButton";
import Link from "next/link";

export default function UploadPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const uploadProfile = useUploadProfile();

  const [hexInput, setHexInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (uploadProfile.isPending) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [uploadProfile.isPending]);

  function handleRandomize() {
    const bytes = randomSnpBytes();
    setHexInput(Buffer.from(bytes).toString("hex"));
    setInputError(null);
  }

  function parseHex(): Uint8Array | null {
    const clean = hexInput.replace(/\s/g, "");
    if (clean.length !== 256) {
      setInputError(`Expected 256 hex chars (128 bytes), got ${clean.length}`);
      return null;
    }
    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      setInputError("Invalid hex characters");
      return null;
    }
    setInputError(null);
    return new Uint8Array(Buffer.from(clean, "hex"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bytes = parseHex();
    if (!bytes) return;

    setUploadError(null);
    try {
      const profilePda = await uploadProfile.mutateAsync(bytes);
      router.push(`/?uploaded=${profilePda}`);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!publicKey) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-white/50 text-sm">Connect your wallet to upload a profile.</p>
        <WalletButton />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link href="/" className="text-white/30 hover:text-white transition-colors text-sm">
        ← All Profiles
      </Link>

      <div className="bg-doma-card border border-white/10 rounded-2xl p-5 backdrop-blur-md">
        <h1 className="text-xl font-bold text-white mb-1">Upload SNP Profile</h1>
        <p className="text-white/40 text-xs leading-relaxed">
          Enter 128 bytes of SNP data as hex (256 characters). Your data is encrypted locally before submission — the MPC network never sees it in plaintext.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-doma-card border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-md">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-white/80">SNP Data (hex)</label>
            <button
              type="button"
              onClick={handleRandomize}
              className="text-xs text-doma-blue hover:underline"
            >
              Generate random test data
            </button>
          </div>
          <textarea
            value={hexInput}
            onChange={(e) => { setHexInput(e.target.value); setInputError(null); }}
            placeholder="Paste 256 hex characters (128 bytes) or click generate…"
            rows={5}
            disabled={uploadProfile.isPending}
            className="w-full bg-white/5 border border-white/10 rounded-[14px] px-3 py-2.5 text-white/80 placeholder-white/20 text-xs font-mono focus:outline-none focus:border-doma-blue/50 focus:ring-1 focus:ring-doma-blue/20 transition-colors resize-none"
          />
          <div className="flex justify-between mt-1">
            <span className={`text-xs ${inputError ? "text-red-400" : "text-white/25"}`}>
              {inputError ?? `${hexInput.replace(/\s/g, "").length}/256 hex chars`}
            </span>
          </div>
        </div>

        <div className="rounded-[14px] bg-doma-blue/5 border border-doma-blue/15 px-3 py-2.5 text-xs text-white/40 space-y-1">
          <p>🔒 <span className="text-white/60">Encryption happens in your browser</span> using x25519 + RescueCipher</p>
          <p>📦 Data is packed into 5 MPC field elements before encryption</p>
          <p>⛓️ Only the ciphertext and your ephemeral public key are stored on-chain</p>
        </div>

        <button
          type="submit"
          disabled={uploadProfile.isPending || hexInput.replace(/\s/g, "").length !== 256}
          className="w-full px-5 py-2.5 rounded-[14px] bg-doma-blue hover:bg-white text-doma-dark font-bold text-sm transition-all transform hover:scale-105 shadow-glow-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
        >
          {uploadProfile.isPending ? "Encrypting & uploading…" : "Encrypt & Upload Profile"}
        </button>

        {uploadProfile.isPending && (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <div className="w-3 h-3 border-2 border-white/20 border-t-doma-blue rounded-full animate-spin flex-shrink-0" />
            <span>Uploading to Solana… {elapsed}s</span>
          </div>
        )}

        {uploadError && (
          <div className="rounded-[14px] bg-red-900/20 border border-red-800/40 px-3 py-2.5 text-sm text-red-400">
            {uploadError}
          </div>
        )}
      </form>
    </div>
  );
}
