use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// TODO: Replace with the real program ID after running:
//   solana address -k target/deploy/encrypted_dna-keypair.json
declare_id!("CHuSJgXRpjjkAh2jTnj1aDEx2EvwQD1XnmN1htdKE4hv");

// ---------------------------------------------------------------------------
// Computation definition offsets
// ---------------------------------------------------------------------------
const COMP_DEF_OFFSET_COMPUTE_HAMMING: u32 = comp_def_offset("compute_hamming");
const COMP_DEF_OFFSET_THRESHOLD_CHECK: u32 = comp_def_offset("threshold_check");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DNA_PROFILE_SEED: &[u8] = b"dna_profile";

/// Number of 32-byte ciphertext blocks produced by encrypting Pack<SnpData>
/// (SnpData.data = [u8; 128]).
///
/// Estimated as ceil(128 / ~25.6) ≈ 5 field elements.
///
/// IMPORTANT: After running `arcium build`, verify this by checking:
///   circuits.SnpData.pack({ data: new Array(128).fill(0) }).length
/// in the generated build/circuits.ts, and update this constant if it differs.
const SNP_CT_BLOCKS: usize = 5;

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[arcium_program]
pub mod encrypted_dna {
    use super::*;

    // -----------------------------------------------------------------------
    // One-time computation definition initialization (run once after deploy)
    // -----------------------------------------------------------------------

    pub fn init_compute_hamming_comp_def(
        ctx: Context<InitComputeHammingCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_threshold_check_comp_def(
        ctx: Context<InitThresholdCheckCompDef>,
    ) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Profile management (no MPC — just encrypted storage)
    // -----------------------------------------------------------------------

    /// Store or update the caller's encrypted SNP profile on-chain.
    ///
    /// The SNP data must be encrypted client-side using the MXE's x25519 public
    /// key before calling this instruction. The MPC cluster is never involved —
    /// the ciphertext is simply stored until a match is requested.
    ///
    /// Call sequence (TypeScript):
    ///   1. mxeKey = await getMXEPublicKey(provider, programId)
    ///   2. ephPriv = x25519.utils.randomSecretKey()
    ///   3. ephPub  = x25519.getPublicKey(ephPriv)
    ///   4. secret  = x25519.getSharedSecret(ephPriv, mxeKey)
    ///   5. packed  = circuits.SnpData.pack({ data: Array.from(snpBytes) })
    ///   6. ct      = new RescueCipher(secret).encrypt(packed, nonce)
    ///   7. Call upload_profile(ct, ephPub, nonce)
    pub fn upload_profile(
        ctx: Context<UploadProfile>,
        snp_ct: [[u8; 32]; SNP_CT_BLOCKS],
        snp_pub_key: [u8; 32],
        snp_nonce: u128,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.payer.key();
        profile.snp_ct = snp_ct;
        profile.snp_pub_key = snp_pub_key;
        profile.snp_nonce = snp_nonce;
        profile.bump = ctx.bumps.profile;
        emit!(ProfileUploaded {
            owner: ctx.accounts.payer.key(),
        });
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Hamming distance computation
    // -----------------------------------------------------------------------

    /// Queue MPC to compute Hamming distance between two encrypted SNP profiles.
    ///
    /// Both profiles must have been uploaded via `upload_profile`.
    /// The distance is revealed as a plaintext u64 in the `HammingResultEvent`.
    ///
    /// The requester must own the `requester_profile` account.
    /// Any valid `DnaProfile` account may be used as `target_profile`.
    pub fn request_hamming(
        ctx: Context<RequestHamming>,
        computation_offset: u64,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Snapshot profile fields before building ArgBuilder
        // (avoids borrow conflicts with ctx.accounts)
        let req_pub_key = ctx.accounts.requester_profile.snp_pub_key;
        let req_nonce   = ctx.accounts.requester_profile.snp_nonce;
        let req_ct      = ctx.accounts.requester_profile.snp_ct;
        let tgt_pub_key = ctx.accounts.target_profile.snp_pub_key;
        let tgt_nonce   = ctx.accounts.target_profile.snp_nonce;
        let tgt_ct      = ctx.accounts.target_profile.snp_ct;

        // compute_hamming(seq_a: Enc<Shared, Pack<SnpData>>, seq_b: Enc<Shared, Pack<SnpData>>) -> u64
        // ArgBuilder order must exactly match circuit parameter order.
        let mut b = ArgBuilder::new()
            // seq_a — requester's encrypted SNP profile
            .x25519_pubkey(req_pub_key)
            .plaintext_u128(req_nonce);
        for i in 0..SNP_CT_BLOCKS {
            b = b.encrypted_u8(req_ct[i]);
        }
        // seq_b — target's encrypted SNP profile
        b = b
            .x25519_pubkey(tgt_pub_key)
            .plaintext_u128(tgt_nonce);
        for i in 0..SNP_CT_BLOCKS {
            b = b.encrypted_u8(tgt_ct[i]);
        }
        let args = b.build();

        let callback_ix = ComputeHammingCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[], // result delivered via HammingResultEvent
        )?;
        queue_computation(ctx.accounts, computation_offset, args, vec![callback_ix], 1, 0)?;
        Ok(())
    }

    /// Callback: emit HammingResultEvent with the plaintext distance.
    #[arcium_callback(encrypted_ix = "compute_hamming")]
    pub fn compute_hamming_callback(
        ctx: Context<ComputeHammingCallback>,
        output: SignedComputationOutputs<ComputeHammingOutput>,
    ) -> Result<()> {
        let distance = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ComputeHammingOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        emit!(HammingResultEvent { distance });
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Threshold check (reveals only bool — protects against distance inference)
    // -----------------------------------------------------------------------

    /// Queue MPC to check if two SNP profiles match above a given percentage.
    ///
    /// Only reveals a boolean — more privacy-preserving than exposing the
    /// raw Hamming distance.
    ///
    /// `threshold_pct`: integer 0–100 (e.g. 70 = "require ≥ 70% bit match").
    pub fn request_threshold(
        ctx: Context<RequestThreshold>,
        computation_offset: u64,
        threshold_pct: u64,
    ) -> Result<()> {
        require!(threshold_pct <= 100, ErrorCode::InvalidThreshold);
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let req_pub_key = ctx.accounts.requester_profile.snp_pub_key;
        let req_nonce   = ctx.accounts.requester_profile.snp_nonce;
        let req_ct      = ctx.accounts.requester_profile.snp_ct;
        let tgt_pub_key = ctx.accounts.target_profile.snp_pub_key;
        let tgt_nonce   = ctx.accounts.target_profile.snp_nonce;
        let tgt_ct      = ctx.accounts.target_profile.snp_ct;

        // threshold_check(seq_a, seq_b, threshold_pct: u64) -> bool
        let mut b = ArgBuilder::new()
            .x25519_pubkey(req_pub_key)
            .plaintext_u128(req_nonce);
        for i in 0..SNP_CT_BLOCKS {
            b = b.encrypted_u8(req_ct[i]);
        }
        b = b
            .x25519_pubkey(tgt_pub_key)
            .plaintext_u128(tgt_nonce);
        for i in 0..SNP_CT_BLOCKS {
            b = b.encrypted_u8(tgt_ct[i]);
        }
        b = b.plaintext_u64(threshold_pct);
        let args = b.build();

        let callback_ix = ThresholdCheckCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?;
        queue_computation(ctx.accounts, computation_offset, args, vec![callback_ix], 1, 0)?;
        Ok(())
    }

    /// Callback: emit ThresholdResultEvent with the plaintext boolean result.
    #[arcium_callback(encrypted_ix = "threshold_check")]
    pub fn threshold_check_callback(
        ctx: Context<ThresholdCheckCallback>,
        output: SignedComputationOutputs<ThresholdCheckOutput>,
    ) -> Result<()> {
        let is_match = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ThresholdCheckOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        emit!(ThresholdResultEvent { is_match });
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Account structs — comp def init
// ---------------------------------------------------------------------------

#[init_computation_definition_accounts("compute_hamming", payer)]
#[derive(Accounts)]
pub struct InitComputeHammingCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("threshold_check", payer)]
#[derive(Accounts)]
pub struct InitThresholdCheckCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Account structs — upload_profile
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UploadProfile<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = DnaProfile::SPACE,
        seeds = [DNA_PROFILE_SEED, payer.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, DnaProfile>,
    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Account structs — request_hamming / compute_hamming_callback
// ---------------------------------------------------------------------------

#[queue_computation_accounts("compute_hamming", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RequestHamming<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed, space = 9, payer = payer,
        seeds = [&SIGN_PDA_SEED], bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_HAMMING))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    /// The requester's DNA profile — must be owned by payer.
    #[account(
        seeds = [DNA_PROFILE_SEED, payer.key().as_ref()],
        bump = requester_profile.bump,
        constraint = requester_profile.owner == payer.key() @ ErrorCode::NotProfileOwner,
    )]
    pub requester_profile: Box<Account<'info, DnaProfile>>,
    /// The target's DNA profile — any valid uploaded profile.
    #[account(
        seeds = [DNA_PROFILE_SEED, target_profile.owner.as_ref()],
        bump = target_profile.bump,
    )]
    pub target_profile: Box<Account<'info, DnaProfile>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_hamming")]
#[derive(Accounts)]
pub struct ComputeHammingCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_HAMMING))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

// ---------------------------------------------------------------------------
// Account structs — request_threshold / threshold_check_callback
// ---------------------------------------------------------------------------

#[queue_computation_accounts("threshold_check", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RequestThreshold<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed, space = 9, payer = payer,
        seeds = [&SIGN_PDA_SEED], bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_THRESHOLD_CHECK))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    #[account(
        seeds = [DNA_PROFILE_SEED, payer.key().as_ref()],
        bump = requester_profile.bump,
        constraint = requester_profile.owner == payer.key() @ ErrorCode::NotProfileOwner,
    )]
    pub requester_profile: Box<Account<'info, DnaProfile>>,
    #[account(
        seeds = [DNA_PROFILE_SEED, target_profile.owner.as_ref()],
        bump = target_profile.bump,
    )]
    pub target_profile: Box<Account<'info, DnaProfile>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("threshold_check")]
#[derive(Accounts)]
pub struct ThresholdCheckCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_THRESHOLD_CHECK))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

// ---------------------------------------------------------------------------
// Data accounts
// ---------------------------------------------------------------------------

#[account]
pub struct DnaProfile {
    /// PDA bump.
    pub bump: u8,
    /// Wallet that owns this profile (used in PDA seeds).
    pub owner: Pubkey,
    /// Ciphertext blocks for Pack<SnpData> encrypted with x25519 + RescueCipher.
    /// Number of blocks = SNP_CT_BLOCKS (verify after `arcium build`).
    pub snp_ct: [[u8; 32]; SNP_CT_BLOCKS],
    /// Encryption nonce (16 bytes stored as u128, little-endian).
    pub snp_nonce: u128,
    /// Uploader's ephemeral x25519 public key used for this encryption.
    pub snp_pub_key: [u8; 32],
}

impl DnaProfile {
    /// 8 discriminator + 1 bump + 32 owner
    /// + (SNP_CT_BLOCKS × 32) ciphertext + 16 nonce + 32 pub_key
    pub const SPACE: usize = 8 + 1 + 32 + (SNP_CT_BLOCKS * 32) + 16 + 32;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct ProfileUploaded {
    pub owner: Pubkey,
}

/// Emitted by compute_hamming_callback.
/// Lower distance = more similar (0 = identical, 1024 = maximum difference).
#[event]
pub struct HammingResultEvent {
    pub distance: u64,
}

/// Emitted by threshold_check_callback.
/// true  = profiles match at or above the requested percentage.
/// false = profiles do not meet the threshold.
#[event]
pub struct ThresholdResultEvent {
    pub is_match: bool,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("MPC computation was aborted")]
    AbortedComputation,
    #[msg("MPC cluster not configured")]
    ClusterNotSet,
    #[msg("Profile owner does not match the signer")]
    NotProfileOwner,
    #[msg("Threshold must be between 0 and 100")]
    InvalidThreshold,
}
