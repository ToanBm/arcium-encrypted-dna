"use client";

import { useMutation } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { randomBytes } from "@noble/hashes/utils";
import {
  getMXEAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getCompDefAccAddress,
  awaitComputationFinalization,
} from "@arcium-hq/client";
import { useAnchorProgram } from "@/lib/program";
import { getDnaProfilePda, compDefOffsetNum } from "@/lib/pda";
import { PROGRAM_ID, CLUSTER_OFFSET } from "@/lib/constants";
import type { EncryptedDna } from "../../../target/types/encrypted_dna";
import type * as anchor from "@coral-xyz/anchor";

const TIMEOUT_MS = 300_000;

function awaitHammingEvent(program: anchor.Program<EncryptedDna>): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      program.removeEventListener(listenerId).catch(() => {});
      reject(new Error("Hamming computation timed out"));
    }, TIMEOUT_MS);

    const listenerId = program.addEventListener(
      "hammingResultEvent",
      (event: { distance: BN | number }) => {
        clearTimeout(timer);
        program.removeEventListener(listenerId).catch(() => {});
        const d = event.distance;
        resolve(typeof d === "number" ? d : d.toNumber());
      }
    );
  });
}

export function useRequestHamming() {
  const ctx = useAnchorProgram();

  return useMutation({
    mutationFn: async (targetProfilePubkey: string) => {
      if (!ctx) throw new Error("Wallet not connected");
      const { program, provider } = ctx;
      const payer = provider.wallet.publicKey;

      const [requesterProfile] = getDnaProfilePda(payer, PROGRAM_ID);
      const targetProfile = new PublicKey(targetProfilePubkey);
      const computationOffset = new BN(Array.from(randomBytes(8)));

      // Subscribe BEFORE queuing so we don't miss the event
      const eventPromise = awaitHammingEvent(program);

      await program.methods
        .requestHamming(computationOffset)
        .accountsPartial({
          payer,
          mxeAccount: getMXEAccAddress(PROGRAM_ID),
          computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
          clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
          mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
          executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
          compDefAccount: getCompDefAccAddress(PROGRAM_ID, compDefOffsetNum("compute_hamming")),
          requesterProfile,
          targetProfile,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });

      // Wait for finalization AND the event (both confirm computation completed)
      await awaitComputationFinalization(provider, computationOffset, PROGRAM_ID, "confirmed", TIMEOUT_MS);

      return eventPromise;
    },
  });
}
