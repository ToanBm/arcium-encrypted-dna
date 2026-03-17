"use client";

import BN from "bn.js";
import {
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
} from "@arcium-hq/client";
import { x25519 } from "@arcium-hq/client";
import { randomBytes } from "@noble/hashes/utils";
import type * as anchor from "@coral-xyz/anchor";
import { PROGRAM_ID, SNP_CT_BLOCKS } from "./constants";

// @arcium-hq/client 0.8.5 createPacker has a bug: PackingState.lastInsert is
// never updated for non-full types, causing field elements beyond index 1 to
// overflow (Pack<[u8;128]> produces a ~2^816 value, exceeding the field prime).
// Pack<[u8;52]> (blackjack) works because it fits in exactly 2×26-byte groups.
// Manual packing matches the Arcis compiler's algorithm exactly:
//   ARCIS_PACKING_SIZE=214 → 26 u8s per field element → ceil(128/26)=5 FEs.
function packSnpData(snpBytes: Uint8Array): bigint[] {
  const BYTES_PER_FE = 26;
  const result: bigint[] = new Array(SNP_CT_BLOCKS).fill(0n);
  for (let i = 0; i < 128; i++) {
    const feIdx = Math.floor(i / BYTES_PER_FE);
    const offset = (i % BYTES_PER_FE) * 8;
    result[feIdx] |= BigInt(snpBytes[i]) << BigInt(offset);
  }
  return result;
}

export interface EncryptedProfile {
  snpCt: number[][];   // [[u8; 32]; SNP_CT_BLOCKS]
  snpPubKey: number[]; // [u8; 32]
  nonceBN: BN;         // u128
}

export async function encryptSnpProfile(
  provider: anchor.AnchorProvider,
  snpBytes: Uint8Array
): Promise<EncryptedProfile> {
  if (snpBytes.length !== 128) {
    throw new Error(`SNP data must be exactly 128 bytes, got ${snpBytes.length}`);
  }

  const mxePubKeyRaw = await getMXEPublicKey(provider, PROGRAM_ID);
  if (!mxePubKeyRaw) throw new Error("Failed to fetch MXE public key");

  const privateKey = x25519.utils.randomSecretKey();
  const pubKey = x25519.getPublicKey(privateKey);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePubKeyRaw);
  const cipher = new RescueCipher(sharedSecret);

  const nonce = randomBytes(16);
  const packed = packSnpData(snpBytes);
  const cts = cipher.encrypt(packed, nonce);

  if (cts.length !== SNP_CT_BLOCKS) {
    throw new Error(`Expected ${SNP_CT_BLOCKS} ciphertext blocks, got ${cts.length}`);
  }

  return {
    snpCt: cts.map((ct) => Array.from(ct) as number[]),
    snpPubKey: Array.from(pubKey) as number[],
    nonceBN: new BN(deserializeLE(nonce).toString()),
  };
}

/** Generate random 128-byte SNP data for testing. */
export function randomSnpBytes(): Uint8Array {
  return randomBytes(128);
}
