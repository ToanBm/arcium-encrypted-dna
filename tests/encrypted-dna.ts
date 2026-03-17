import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  awaitComputationFinalization,
  deserializeLE,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import { randomBytes } from "crypto";
import { expect } from "chai";

import idl from "../target/idl/encrypted_dna.json";
import type { EncryptedDna } from "../target/types/encrypted_dna";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_OFFSET = 456; // devnet
const DNA_PROFILE_SEED = Buffer.from("dna_profile");

// @arcium-hq/client 0.8.5 createPacker bug: PackingState.lastInsert is never
// updated for non-full types, so Pack<[u8;128]> overflows FE1 to ~2^816.
// Manual packing matches the Arcis compiler: ARCIS_PACKING_SIZE=214 → 26 u8s
// per field element → ceil(128/26) = 5 field elements.
const SNP_CT_BLOCKS = 5;
const BYTES_PER_FE = 26;

function packSnpData(snpBytes: Uint8Array): bigint[] {
  const result: bigint[] = new Array(SNP_CT_BLOCKS).fill(0n);
  for (let i = 0; i < 128; i++) {
    const feIdx = Math.floor(i / BYTES_PER_FE);
    const offset = (i % BYTES_PER_FE) * 8;
    result[feIdx] |= BigInt(snpBytes[i]) << BigInt(offset);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProgramId(program: Program<EncryptedDna>): PublicKey {
  return program.programId;
}

function getDnaProfilePda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DNA_PROFILE_SEED, owner.toBuffer()],
    programId
  );
}

function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

/** Encrypt a packed SNP profile for submission to the program. */
async function encryptProfile(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  snpBytes: Uint8Array
): Promise<{
  ct: number[][];
  pubKey: number[];
  nonceBN: BN;
}> {
  const mxeKey = await getMXEPublicKey(provider, programId);
  if (!mxeKey) throw new Error("MXE public key not available — is MXE deployed?");

  const ephPriv = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const sharedSecret = x25519.getSharedSecret(ephPriv, mxeKey);

  const packed = packSnpData(snpBytes);
  const cipher = new RescueCipher(sharedSecret);
  const nonce = randomBytes(16);
  const ciphertext = cipher.encrypt(packed, nonce);

  if (ciphertext.length !== SNP_CT_BLOCKS) {
    throw new Error(
      `SNP_CT_BLOCKS mismatch: expected ${SNP_CT_BLOCKS}, got ${ciphertext.length}.` +
        ` Update SNP_CT_BLOCKS in both tests/encrypted-dna.ts and programs/encrypted-dna/src/lib.rs.`
    );
  }

  return {
    ct: ciphertext.map((block) => Array.from(block)),
    pubKey: Array.from(ephPub),
    nonceBN: new BN(deserializeLE(nonce).toString()),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("encrypted-dna", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl as EncryptedDna, provider);
  const payer = (provider.wallet as anchor.Wallet).payer;
  const programId = getProgramId(program);

  // Second user (target)
  const target = Keypair.generate();

  // SNP data: Alice has some pattern, Bob has a similar one
  const aliceSnp = new Uint8Array(128).fill(0xaa); // 10101010 × 128
  const bobSnp = new Uint8Array(128).fill(0xab);   // 10101011 × 128 — differs in 1 bit per byte

  it("initializes computation definitions", async () => {
    const mxeAcc = getMXEAccAddress(programId);

    // init_compute_hamming_comp_def
    try {
      await program.methods
        .initComputeHammingCompDef()
        .accountsPartial({
          mxeAccount: mxeAcc,
          compDefAccount: getCompDefAccAddress(
            programId,
            compDefOffsetNum("compute_hamming")
          ),
        })
        .rpc({ commitment: "confirmed" });
      console.log("  ✓ compute_hamming comp def initialized");
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("already in use")) {
        console.log("  ✓ compute_hamming comp def already exists");
      } else {
        throw e;
      }
    }

    // init_threshold_check_comp_def
    try {
      await program.methods
        .initThresholdCheckCompDef()
        .accountsPartial({
          mxeAccount: mxeAcc,
          compDefAccount: getCompDefAccAddress(
            programId,
            compDefOffsetNum("threshold_check")
          ),
        })
        .rpc({ commitment: "confirmed" });
      console.log("  ✓ threshold_check comp def initialized");
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("already in use")) {
        console.log("  ✓ threshold_check comp def already exists");
      } else {
        throw e;
      }
    }
  });

  it("uploads Alice's encrypted SNP profile", async () => {
    const enc = await encryptProfile(provider, programId, aliceSnp);
    const [profilePda] = getDnaProfilePda(payer.publicKey, programId);

    await program.methods
      .uploadProfile(enc.ct, enc.pubKey, enc.nonceBN)
      .accountsPartial({ profile: profilePda })
      .rpc({ commitment: "confirmed" });

    const profile = await program.account.dnaProfile.fetch(profilePda);
    expect(profile.owner.toBase58()).to.equal(payer.publicKey.toBase58());
    console.log("  ✓ Alice's profile uploaded:", profilePda.toBase58().slice(0, 12) + "…");
  });

  it("uploads Bob's encrypted SNP profile", async () => {
    // Airdrop SOL to Bob so he can pay for the account
    const sig = await provider.connection.requestAirdrop(
      target.publicKey,
      2e9 // 2 SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const targetProvider = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(target),
      { commitment: "confirmed" }
    );
    const targetProgram = new Program(idl as EncryptedDna, targetProvider);

    const enc = await encryptProfile(targetProvider, programId, bobSnp);
    const [profilePda] = getDnaProfilePda(target.publicKey, programId);

    await targetProgram.methods
      .uploadProfile(enc.ct, enc.pubKey, enc.nonceBN)
      .accountsPartial({ profile: profilePda })
      .rpc({ commitment: "confirmed" });

    const profile = await program.account.dnaProfile.fetch(profilePda);
    expect(profile.owner.toBase58()).to.equal(target.publicKey.toBase58());
    console.log("  ✓ Bob's profile uploaded:", profilePda.toBase58().slice(0, 12) + "…");
  });

  it("computes Hamming distance between Alice and Bob", async () => {
    const computationOffset = new BN(randomBytes(8), "hex");
    const [aliceProfile] = getDnaProfilePda(payer.publicKey, programId);
    const [bobProfile] = getDnaProfilePda(target.publicKey, programId);

    // Listen for the event before queuing
    let resolveEvent: (distance: BN) => void;
    const eventPromise = new Promise<BN>((res) => { resolveEvent = res; });
    const listenerId = program.addEventListener("hammingResultEvent", (e) => {
      resolveEvent(e.distance);
    });

    await program.methods
      .requestHamming(computationOffset)
      .accountsPartial({
        computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
        clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
        mxeAccount: getMXEAccAddress(programId),
        mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          programId,
          compDefOffsetNum("compute_hamming")
        ),
        requesterProfile: aliceProfile,
        targetProfile: bobProfile,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      programId,
      "confirmed"
    );

    const distance = await eventPromise;
    await program.removeEventListener(listenerId);

    // Alice: 0xaa = 10101010, Bob: 0xab = 10101011 → XOR = 00000001 → 1 bit per byte
    // Total differing bits = 128 bytes × 1 bit = 128
    console.log("  Hamming distance:", distance.toString());
    expect(distance.toNumber()).to.equal(128);
  });

  it("threshold check: 85% match passes at 80% threshold", async () => {
    const computationOffset = new BN(randomBytes(8), "hex");
    const [aliceProfile] = getDnaProfilePda(payer.publicKey, programId);
    const [bobProfile] = getDnaProfilePda(target.publicKey, programId);

    // Expected: distance=128, match_pct = (1024-128)*100/1024 = 87%
    const THRESHOLD = new BN(80);

    let resolveEvent: (isMatch: boolean) => void;
    const eventPromise = new Promise<boolean>((res) => { resolveEvent = res; });
    const listenerId = program.addEventListener("thresholdResultEvent", (e) => {
      resolveEvent(e.isMatch);
    });

    await program.methods
      .requestThreshold(computationOffset, THRESHOLD)
      .accountsPartial({
        computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
        clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
        mxeAccount: getMXEAccAddress(programId),
        mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          programId,
          compDefOffsetNum("threshold_check")
        ),
        requesterProfile: aliceProfile,
        targetProfile: bobProfile,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      programId,
      "confirmed"
    );

    const isMatch = await eventPromise;
    await program.removeEventListener(listenerId);

    console.log("  Threshold 80%:", isMatch ? "MATCH" : "NO MATCH");
    expect(isMatch).to.be.true;
  });

  it("threshold check: 87% match fails at 95% threshold", async () => {
    const computationOffset = new BN(randomBytes(8), "hex");
    const [aliceProfile] = getDnaProfilePda(payer.publicKey, programId);
    const [bobProfile] = getDnaProfilePda(target.publicKey, programId);

    const THRESHOLD = new BN(95);

    let resolveEvent: (isMatch: boolean) => void;
    const eventPromise = new Promise<boolean>((res) => { resolveEvent = res; });
    const listenerId = program.addEventListener("thresholdResultEvent", (e) => {
      resolveEvent(e.isMatch);
    });

    await program.methods
      .requestThreshold(computationOffset, THRESHOLD)
      .accountsPartial({
        computationAccount: getComputationAccAddress(CLUSTER_OFFSET, computationOffset),
        clusterAccount: getClusterAccAddress(CLUSTER_OFFSET),
        mxeAccount: getMXEAccAddress(programId),
        mempoolAccount: getMempoolAccAddress(CLUSTER_OFFSET),
        executingPool: getExecutingPoolAccAddress(CLUSTER_OFFSET),
        compDefAccount: getCompDefAccAddress(
          programId,
          compDefOffsetNum("threshold_check")
        ),
        requesterProfile: aliceProfile,
        targetProfile: bobProfile,
      })
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      programId,
      "confirmed"
    );

    const isMatch = await eventPromise;
    await program.removeEventListener(listenerId);

    console.log("  Threshold 95%:", isMatch ? "MATCH" : "NO MATCH");
    expect(isMatch).to.be.false;
  });
});
