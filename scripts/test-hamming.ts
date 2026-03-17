/**
 * test-hamming.ts — runs a real compute_hamming computation and dumps callback tx logs
 *
 * ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 * ANCHOR_WALLET=~/.config/solana/id.json \
 * yarn ts-node scripts/test-hamming.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { randomBytes } from "@noble/hashes/utils";
import {
  getMXEAccAddress,
  getMXEPublicKey,
  getComputationAccAddress,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  awaitComputationFinalization,
  RescueCipher,
  deserializeLE,
  x25519,
} from "@arcium-hq/client";
import { SystemProgram } from "@solana/web3.js";
import { EncryptedDna } from "../target/types/encrypted_dna";
import idl from "../target/idl/encrypted_dna.json";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const program = new anchor.Program(idl as anchor.Idl, provider) as unknown as anchor.Program<EncryptedDna>;

const PROGRAM_ID = program.programId;
const CLUSTER_OFFSET = 456; // devnet

function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

function getDnaProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dna_profile"), owner.toBuffer()],
    PROGRAM_ID
  );
}

async function main() {
  const payer = provider.wallet.publicKey;
  console.log("Payer:", payer.toBase58());

  // Fetch all profiles
  const profiles = await (program.account as any).dnaProfile.all();
  console.log(`Found ${profiles.length} profiles on-chain:`);
  for (const p of profiles) {
    console.log("  -", p.publicKey.toBase58(), "owner:", p.account.owner.toBase58());
  }

  if (profiles.length < 2) {
    console.error("Need at least 2 profiles to compute Hamming distance");
    process.exit(1);
  }

  // Use first two profiles
  const [requesterProfile] = getDnaProfilePda(payer);
  const reqExists = await provider.connection.getAccountInfo(requesterProfile);
  if (!reqExists) {
    console.log("Payer has no profile — uploading one now...");
    const mxePubKey = await getMXEPublicKey(provider, PROGRAM_ID);
    const ephPriv = x25519.utils.randomSecretKey();
    const ephPub = x25519.getPublicKey(ephPriv);
    const shared = x25519.getSharedSecret(ephPriv, mxePubKey!);
    const nonce = randomBytes(16);
    const BYTES_PER_FE = 26;
    const snpBytes = randomBytes(128);
    const packed: bigint[] = new Array(5).fill(BigInt(0));
    for (let i = 0; i < 128; i++) {
      const feIdx = Math.floor(i / BYTES_PER_FE);
      packed[feIdx] = packed[feIdx] | (BigInt(snpBytes[i]) << BigInt((i % BYTES_PER_FE) * 8));
    }
    const cts = new RescueCipher(shared).encrypt(packed, nonce) as unknown as Uint8Array[];
    const snpCt = cts.map((ct) => Array.from(ct));
    const snpPubKey = Array.from(ephPub);
    const nonceBN = new BN(deserializeLE(nonce).toString());
    await program.methods
      .uploadProfile(snpCt as any, snpPubKey as any, nonceBN)
      .accountsPartial({ payer, profile: requesterProfile, systemProgram: SystemProgram.programId })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("  ✓ Profile uploaded");
  }

  // Pick a target that is NOT the requester
  const target = profiles.find((p: any) => p.account.owner.toBase58() !== payer.toBase58());
  if (!target) {
    console.error("No other profile found to use as target");
    process.exit(1);
  }
  const targetProfile = target.publicKey as PublicKey;
  console.log("\nRequester profile:", requesterProfile.toBase58());
  console.log("Target profile:   ", targetProfile.toBase58());

  const computationOffset = new BN(Array.from(randomBytes(8)));
  console.log("\nQueuing compute_hamming...");

  const queueSig = await program.methods
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

  console.log("Queue tx:", queueSig);
  console.log("Waiting for MPC computation (up to 5 min)...");

  const callbackSig = await awaitComputationFinalization(
    provider,
    computationOffset,
    PROGRAM_ID,
    "confirmed",
    300_000
  );

  console.log("\nCallback tx:", callbackSig);

  // Fetch and dump logs
  const tx = await provider.connection.getTransaction(callbackSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.error("getTransaction returned null!");
    return;
  }

  console.log("\n=== logMessages ===");
  const logs = tx.meta?.logMessages ?? [];
  logs.forEach((l, i) => console.log(`[${i}] ${l}`));

  console.log("\n=== Trying event decode ===");
  for (const log of logs) {
    if (log.startsWith("Program data: ")) {
      const b64 = log.slice("Program data: ".length);
      try {
        const event = program.coder.events.decode(b64);
        console.log("Decoded event:", JSON.stringify(event, null, 2));
      } catch (e) {
        console.log("Decode failed for:", b64.slice(0, 30), "...", (e as Error).message);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
