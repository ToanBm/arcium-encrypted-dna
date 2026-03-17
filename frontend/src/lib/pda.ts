import { PublicKey } from "@solana/web3.js";
import { getCompDefAccOffset } from "@arcium-hq/client";

export function getDnaProfilePda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("dna_profile"), owner.toBuffer()],
    programId
  );
}

export function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}
