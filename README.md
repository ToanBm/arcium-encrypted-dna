# Encrypted DNA — Privacy-Preserving Genomic Matching on Arcium

Genomic data is among the most sensitive information a person possesses — it reveals ancestry, disease risk, and family relationships, and it cannot be changed. Yet today's genomic matching services require users to hand over raw sequences to a central server, creating a honeypot that is one breach away from permanent exposure.

**Encrypted DNA** solves this: SNP profiles are encrypted in the browser before they ever touch the network. All similarity computation runs inside the [Arcium](https://arcium.com) MPC cluster — no server, no database, no single party ever sees plaintext genomic data. Users get genomic insights with cryptographic privacy guarantees.

**Live on Solana devnet** · Program: `CHuSJgXRpjjkAh2jTnj1aDEx2EvwQD1XnmN1htdKE4hv`

[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/your-username/encrypted-dna)
[![Demo](https://img.shields.io/badge/Demo-Live%20App-blue)](https://encrypted-dna.example.com)

> 🔗 **Repo:** https://github.com/your-username/encrypted-dna
> 🌐 **Demo:** https://encrypted-dna.example.com

---

## The Problem

Direct-to-consumer genomics companies store millions of raw genomes in centralized databases. A single breach exposes data that cannot be revoked, reset, or anonymized after the fact. Research consortia face the same dilemma: sharing genomic datasets for science requires exposing the most private data imaginable.

Existing "privacy-preserving" approaches often rely on trusted third parties or differential-privacy approximations that still leak statistical information. There has been no practical, decentralized way to compute genomic similarity without giving someone the underlying data — until MPC.

---

## Innovation

- **Zero-knowledge genomic similarity on a public blockchain.** Raw sequences are encrypted with x25519 + RescueCipher before being stored on-chain. The Solana program stores only ciphertext; no party — including the MPC nodes — ever reconstructs the full plaintext.

- **Dual-mode privacy.** Beyond raw Hamming distance, the app offers a **threshold check** mode that returns only a boolean ("≥ X% similar?"). This prevents distance-inference attacks where an adversary makes many queries to triangulate exact sequences from a sequence of distances.

- **Decentralized compute, not just decentralized storage.** Many blockchain apps use MPC for key custody. This project uses Arcium's MPC network as a **compute layer** — the encrypted inputs flow into the cluster, the circuit runs over secret shares, and only the final result exits in plaintext. There is no trusted coordinator.

- **Pack<T> genomic encoding.** Arcis' `Pack<SnpData>` primitive compresses 128 bytes (512 SNP positions at 2 bits/nucleotide) into 5 MPC field elements, making on-chain genomic data both compact and MPC-native.

---

## How Arcium Is Used

Arcium provides the **MPC execution environment (MXE)** that runs encrypted computation. Here is exactly how it integrates:

1. **Client-side encryption** — `@arcium-hq/client` encrypts the user's SNP bytes with the MXE's public x25519 key. The resulting `Enc<Shared, Pack<SnpData>>` ciphertext is stored on-chain. Only the MPC cluster — never any single node — can decrypt it.

2. **Arcis circuits** — Two circuits in `encrypted-ixs/dna.rs` define what computation the cluster runs:
   - `compute_hamming(seq_a, seq_b) → u64` — counts bit differences between two encrypted profiles
   - `threshold_check(seq_a, seq_b, threshold_pct) → bool` — computes similarity percentage and returns only yes/no

3. **Queuing computation** — The Solana program's `request_hamming` / `request_threshold` instructions push a computation job onto the Arcium queue, passing the encrypted ciphertexts as arguments.

4. **MPC finalization** — The Arcium cluster decrypts both profiles inside a multi-party computation (no single node ever has the full plaintext), runs the circuit, and calls back the Solana program with the plaintext result.

5. **Result emission** — The callback instruction emits an Anchor event (`HammingResultEvent` or `ThresholdResultEvent`). The frontend subscribes via `program.addEventListener` before queuing, so the result is delivered the moment the callback fires.

**Privacy guarantee:** The `Enc<Shared, ...>` type requires the entire MPC cluster to cooperate for decryption. Compromise of any subset of nodes reveals nothing about the underlying sequence.

---

## How It Works (User Flow)

1. **Upload** — Enter 128 bytes of SNP data in the browser. The app encrypts it (x25519 + RescueCipher) and submits a Solana transaction storing only the ciphertext on-chain. Raw data never leaves your browser unencrypted.

2. **Match** — Pick any uploaded profile. Choose Hamming distance (raw count, 0–1024) or threshold mode (percentage cutoff). Submit the match request — it queues an MPC computation.

3. **Result** — After ~1–3 minutes on devnet, the Arcium cluster finalizes the computation and the result appears:
   - **Hamming mode:** distance integer (lower = more similar)
   - **Threshold mode:** "Match" or "No match" (more private)

### SNP Encoding

Each profile: 128 bytes = 512 SNP positions at 2 bits/nucleotide (A=00, C=01, G=10, T=11). Maximum Hamming distance = 1024 bits (completely different sequences). Packed into 5 MPC field elements via Arcis' `Pack<SnpData>`.

### Where to get real SNP data

SNP data comes from a **genetic test**. Consumer options include 23andMe, AncestryDNA, and MyHeritage — after testing, each service offers a raw data download (`.txt` file) containing hundreds of thousands of SNP positions.

To use real data with this app:
1. Download your raw data file from your provider
2. Select 128 SNP positions of interest (specific rsIDs)
3. Encode each allele as a bit (e.g. reference = 0, alternate = 1)
4. Pack into 128 bytes → convert to hex (256 hex characters)
5. Paste into the upload field

The **"Generate random test data"** button produces valid random bytes for demonstration — the privacy computation is identical whether the input is real genomic data or random.

---

## Real-World Impact

| Use Case | How Encrypted DNA Helps |
|---|---|
| **Consumer genomics** | Users share similarity scores with relatives without exposing raw sequences to a company |
| **Research consortia** | Institutions can identify sequence overlap across cohorts without pooling raw data |
| **Ancestry matching** | Two parties prove familial relationship without a trusted intermediary |
| **Clinical trials** | Eligibility screening by genomic profile without disclosing patient data to sponsors |
| **Biosecurity** | Pathogen similarity checks against reference sequences without publishing the reference |

The same MPC primitive — private Hamming distance on packed byte arrays — applies to any domain where binary similarity is meaningful and privacy is critical (e.g., encrypted image fingerprinting, private set intersection on biometric hashes).

---

## Architecture

```
encrypted-dna/
├── programs/encrypted-dna/src/lib.rs   # Anchor program (Solana instructions)
├── encrypted-ixs/dna.rs                # Arcis MPC circuits
├── build/                              # Compiled circuits (arcium build output)
│   ├── compute_hamming.arcis
│   ├── threshold_check.arcis
│   └── circuits.ts                     # Generated TypeScript packer
├── tests/encrypted-dna.ts             # End-to-end devnet tests
├── scripts/
│   ├── fix-circuits.ts                 # Upload circuits to devnet (idempotent)
│   └── init-comp-defs.ts              # One-time comp def initializer
└── frontend/                           # Next.js 16 web app
    ├── src/app/                        # Pages: /, /upload, /match/[pubkey]
    ├── src/hooks/                      # React Query hooks
    └── src/lib/                        # Encryption, program, PDAs
```

### On-chain Accounts

| Account | Seeds | Description |
|---------|-------|-------------|
| `DnaProfile` | `["dna_profile", owner]` | Encrypted SNP ciphertext (5×32 bytes), nonce, ephemeral pubkey, owner |

### MPC Circuits

| Circuit | Inputs | Output | Privacy level |
|---------|--------|--------|---------------|
| `compute_hamming` | `Enc<Shared, Pack<SnpData>>` × 2 | `u64` distance (0–1024) | High — sequences hidden |
| `threshold_check` | `Enc<Shared, Pack<SnpData>>` × 2 + `u64` threshold | `bool` | Maximum — distance also hidden |

Results are emitted as Anchor events (`HammingResultEvent`, `ThresholdResultEvent`) in the callback instruction after the MPC cluster finalizes.

---

## Privacy Properties

| What is public | What stays private |
|---|---|
| That a profile exists (owner pubkey) | The actual SNP sequence |
| The Hamming distance (if `compute_hamming`) | Each individual's raw data |
| Whether similarity ≥ threshold (if `threshold_check`) | The exact distance (threshold mode) |
| The MXE's x25519 public key | The shared encryption secret |
| The computation result | The inputs to that computation |

The `Enc<Shared, ...>` type means ciphertext can only be decrypted by the MPC cluster collectively — no single Arcium node can read it, and the on-chain program stores only encrypted bytes.

---

## Prerequisites

- [Rust](https://rustup.rs/) + Solana toolchain (`solana-install`)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.32.1
- [Arcium CLI](https://docs.arcium.com/developers) (`arcium`)
- Node.js 18+ and Yarn
- A funded devnet wallet at `~/.config/solana/id.json`

---

## Getting Started

### 1. Install dependencies

```bash
yarn install
cd frontend && npm install && cd ..
```

### 2. Build the Arcis circuits

```bash
arcium build
```

Compiles `encrypted-ixs/dna.rs` → `build/*.arcis` + `build/circuits.ts`.

### 3. Deploy the program

```bash
arcium deploy \
  --cluster-offset 456 \
  --keypair-path ~/.config/solana/id.json \
  --recovery-set-size 5 \
  --program-keypair target/deploy/encrypted_dna-keypair.json \
  --program-name encrypted_dna \
  --rpc-url devnet
```

### 4. Upload circuits to devnet

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-node scripts/fix-circuits.ts
```

Idempotent — safe to re-run if interrupted. Initializes computation definitions, resizes on-chain accounts, uploads missing chunks, and finalizes both circuits.

### 5. Run tests

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn test
```

Covers: comp def init, profile upload (Alice + Bob), Hamming distance computation, threshold checks at 80% and 95%.

### 6. Start the frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect a Phantom/Backpack wallet, upload a profile, then navigate to any profile to run a match.

---

## Key Constants

| Constant | Value | Description |
|---|---|---|
| `SNP_CT_BLOCKS` | `5` | Ciphertext blocks for `Pack<SnpData>` (ARCIS packing: 26 u8s/field element, ceil(128/26)=5) |
| `SNP_LEN` | `128` | Bytes per SNP profile |
| Cluster offset | `456` | Devnet Arcium cluster |
| Max Hamming | `1024` | 128 bytes × 8 bits |

---

## Tech Stack

- **Solana** — account storage, transaction ordering
- **Anchor** 0.32.1 — program framework and IDL generation
- **Arcium / Arcis** — MPC circuit compilation and execution
- **Next.js** 16.1 + Tailwind CSS v4 — frontend
- **@arcium-hq/client** — encryption (x25519 + RescueCipher), `awaitComputationFinalization`
- **@solana/wallet-adapter** — browser wallet integration
- **TanStack Query** — async state management
