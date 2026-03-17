"use client";

import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { EncryptedDna } from "../../../target/types/encrypted_dna";
import IDL from "../../../target/idl/encrypted_dna.json";

// Minimal wallet interface for read-only use (no signing needed)
const dummyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise.resolve(tx),
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise.resolve(txs),
} as unknown as anchor.Wallet;

/** Read-only program — usable without wallet for fetching accounts. */
export function useReadonlyProgram() {
  const { connection } = useConnection();

  return useMemo(() => {
    const provider = new anchor.AnchorProvider(connection, dummyWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program<EncryptedDna>(IDL as anchor.Idl, provider);
  }, [connection]);
}

/** Full program — requires wallet, used for signing transactions. */
export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      skipPreflight: true,
    });
    const program = new anchor.Program<EncryptedDna>(
      IDL as anchor.Idl,
      provider
    );
    return { program, provider };
  }, [connection, wallet]);
}
