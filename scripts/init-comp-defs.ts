/**
 * init-comp-defs.ts
 *
 * One-time script to initialize the two computation definitions on devnet
 * and upload their compiled circuits.
 *
 * Run from the project root:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   yarn ts-node scripts/init-comp-defs.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as fs from "fs";
import {
  getArciumProgram,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  uploadCircuit,
} from "@arcium-hq/client";
import { EncryptedDna } from "../target/types/encrypted_dna";
import idl from "../target/idl/encrypted_dna.json";

anchor.setProvider(anchor.AnchorProvider.env());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const program = new anchor.Program(idl as anchor.Idl, provider) as unknown as Program<EncryptedDna>;
const arciumProgram = getArciumProgram(provider);

function compDefOffsetNum(name: string): number {
  return Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
}

async function getLutAddress() {
  const mxeAccount = getMXEAccAddress(program.programId);
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
  return getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);
}

async function initCompDef(
  name: string,
  methodName: "initComputeHammingCompDef" | "initThresholdCheckCompDef"
) {
  console.log(`\nInitializing ${name} computation definition...`);

  const compDefPubkey = getCompDefAccAddress(
    program.programId,
    compDefOffsetNum(name)
  );
  const existing = await provider.connection.getAccountInfo(compDefPubkey);

  if (existing !== null) {
    console.log(`  (comp def account already exists — skipping init)`);
  } else {
    const lutAddress = await getLutAddress();
    await (program.methods as any)
      [methodName]()
      .accounts({
        payer: provider.wallet.publicKey,
        mxeAccount: getMXEAccAddress(program.programId),
        compDefAccount: compDefPubkey,
        addressLookupTable: lutAddress,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log(`  ✓ ${name} comp def initialized`);
  }

  const rawCircuit = fs.readFileSync(`build/${name}.arcis`);
  try {
    await uploadCircuit(provider, name, program.programId, rawCircuit, true, 5, {
      skipPreflight: true,
      commitment: "confirmed",
    });
  } catch (e: unknown) {
    const err = e as { transactionMessage?: string; message?: string; transactionLogs?: string[]; logs?: string[] };
    const logs = err?.transactionLogs ?? err?.logs ?? null;
    console.error(
      `  uploadCircuit failed for ${name}:`,
      err?.transactionMessage ?? err?.message ?? e
    );
    if (logs) console.error("  Logs:", logs);
    throw e;
  }
  console.log(`  ✓ ${name} circuit uploaded`);
}

async function main() {
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`Payer:   ${provider.wallet.publicKey.toBase58()}`);
  console.log(`Cluster: ${(provider.connection as { _rpcEndpoint?: string })._rpcEndpoint ?? "unknown"}`);

  await initCompDef("compute_hamming", "initComputeHammingCompDef");
  await initCompDef("threshold_check", "initThresholdCheckCompDef");

  console.log("\nAll computation definitions initialized successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
