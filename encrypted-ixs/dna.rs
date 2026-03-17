use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// 128 bytes encodes 512 SNP positions at 2 bits/nucleotide (ACGT).
    /// Hamming distance range: 0 (identical) – 1024 bits (completely different).
    const SNP_LEN: usize = 128;

    /// Packed SNP profile.
    ///
    /// After `arcium build`, use the generated TypeScript packer:
    ///   `circuits.SnpData.pack({ data: Array.from(snpBytes) })`
    /// where `snpBytes` is a Uint8Array(128) with 2-bit–encoded nucleotides.
    #[derive(Copy, Clone)]
    pub struct SnpData {
        pub data: [u8; SNP_LEN],
    }

    /// Count differing bits between two bytes.
    ///
    /// Arcis does not support bitwise `^`, `&`, `|` on integers (only on booleans).
    /// We use `% 2` to extract each bit (LSB after shifting) and `!=` to compare.
    /// All shift amounts are compile-time constants as required by Arcis.
    fn hamming_byte(a: u8, b: u8) -> u64 {
        ((a % 2 != b % 2) as u64)
            + (((a >> 1) % 2 != (b >> 1) % 2) as u64)
            + (((a >> 2) % 2 != (b >> 2) % 2) as u64)
            + (((a >> 3) % 2 != (b >> 3) % 2) as u64)
            + (((a >> 4) % 2 != (b >> 4) % 2) as u64)
            + (((a >> 5) % 2 != (b >> 5) % 2) as u64)
            + (((a >> 6) % 2 != (b >> 6) % 2) as u64)
            + (((a >> 7) % 2 != (b >> 7) % 2) as u64)
    }

    /// Compute Hamming distance between two encrypted SNP profiles.
    ///
    /// Hamming distance = number of bit positions where the two sequences differ.
    /// Lower = more similar. Maximum for 512 SNPs × 2 bits = 1024.
    ///
    /// Both inputs are decrypted inside the MPC cluster — raw genomic data is
    /// never revealed to any single party.
    ///
    /// Returns the distance as a plaintext u64 (visible to the requester).
    #[instruction]
    pub fn compute_hamming(
        seq_a: Enc<Shared, Pack<SnpData>>,
        seq_b: Enc<Shared, Pack<SnpData>>,
    ) -> u64 {
        let a = seq_a.to_arcis().unpack();
        let b = seq_b.to_arcis().unpack();
        let mut dist: u64 = 0;
        for i in 0..SNP_LEN {
            dist += hamming_byte(a.data[i], b.data[i]);
        }
        dist.reveal()
    }

    /// Privacy-preserving threshold check: does match percentage meet a minimum?
    ///
    /// Reveals only the boolean result — the actual Hamming distance is not
    /// disclosed, preventing inference of raw SNP data from partial scores.
    ///
    /// # Parameters
    /// - `seq_a`, `seq_b`: Encrypted SNP profiles (Shared — client + MXE can decrypt).
    /// - `threshold_pct`:  Plaintext integer 0–100 (e.g. 70 = "at least 70% match").
    ///
    /// # Algorithm
    /// match_pct = (total_bits - hamming_dist) * 100 / total_bits
    /// Returns: match_pct >= threshold_pct
    #[instruction]
    pub fn threshold_check(
        seq_a: Enc<Shared, Pack<SnpData>>,
        seq_b: Enc<Shared, Pack<SnpData>>,
        threshold_pct: u64,
    ) -> bool {
        let a = seq_a.to_arcis().unpack();
        let b = seq_b.to_arcis().unpack();
        let total_bits = (SNP_LEN as u64) * 8; // 1024
        let mut dist: u64 = 0;
        for i in 0..SNP_LEN {
            dist += hamming_byte(a.data[i], b.data[i]);
        }
        let match_pct = (total_bits - dist) * 100 / total_bits;
        (match_pct >= threshold_pct).reveal()
    }
}
