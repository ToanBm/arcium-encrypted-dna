/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/encrypted_dna.json`.
 */
export type EncryptedDna = {
  "address": "CHuSJgXRpjjkAh2jTnj1aDEx2EvwQD1XnmN1htdKE4hv",
  "metadata": {
    "name": "encryptedDna",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Privacy-preserving genomic similarity on Solana using Arcium MPC"
  },
  "instructions": [
    {
      "name": "computeHammingCallback",
      "discriminator": [110,121,185,18,210,88,124,50],
      "accounts": [
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"},
        {"name": "compDefAccount"},
        {"name": "mxeAccount"},
        {"name": "computationAccount"},
        {"name": "clusterAccount"},
        {"name": "instructionsSysvar","address": "Sysvar1nstructions1111111111111111111111111"}
      ],
      "args": [{"name": "output","type": {"defined": {"name": "signedComputationOutputs","generics": [{"kind": "type","type": {"defined": {"name": "computeHammingOutput"}}}]}}}]
    },
    {
      "name": "initComputeHammingCompDef",
      "discriminator": [129,193,29,96,240,141,71,131],
      "accounts": [
        {"name": "payer","writable": true,"signer": true},
        {"name": "mxeAccount","writable": true},
        {"name": "compDefAccount","writable": true},
        {"name": "addressLookupTable","writable": true},
        {"name": "lutProgram","address": "AddressLookupTab1e1111111111111111111111111"},
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"},
        {"name": "systemProgram","address": "11111111111111111111111111111111"}
      ],
      "args": []
    },
    {
      "name": "initThresholdCheckCompDef",
      "discriminator": [92,44,93,5,219,15,230,103],
      "accounts": [
        {"name": "payer","writable": true,"signer": true},
        {"name": "mxeAccount","writable": true},
        {"name": "compDefAccount","writable": true},
        {"name": "addressLookupTable","writable": true},
        {"name": "lutProgram","address": "AddressLookupTab1e1111111111111111111111111"},
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"},
        {"name": "systemProgram","address": "11111111111111111111111111111111"}
      ],
      "args": []
    },
    {
      "name": "requestHamming",
      "discriminator": [12,117,171,114,177,174,107,242],
      "accounts": [
        {"name": "payer","writable": true,"signer": true},
        {"name": "signPdaAccount","writable": true},
        {"name": "mxeAccount"},
        {"name": "mempoolAccount","writable": true},
        {"name": "executingPool","writable": true},
        {"name": "computationAccount","writable": true},
        {"name": "compDefAccount"},
        {"name": "clusterAccount","writable": true},
        {"name": "poolAccount","writable": true,"address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"},
        {"name": "clockAccount","writable": true,"address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"},
        {"name": "requesterProfile"},
        {"name": "targetProfile"},
        {"name": "systemProgram","address": "11111111111111111111111111111111"},
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"}
      ],
      "args": [{"name": "computationOffset","type": "u64"}]
    },
    {
      "name": "requestThreshold",
      "discriminator": [200,190,245,210,57,162,199,105],
      "accounts": [
        {"name": "payer","writable": true,"signer": true},
        {"name": "signPdaAccount","writable": true},
        {"name": "mxeAccount"},
        {"name": "mempoolAccount","writable": true},
        {"name": "executingPool","writable": true},
        {"name": "computationAccount","writable": true},
        {"name": "compDefAccount"},
        {"name": "clusterAccount","writable": true},
        {"name": "poolAccount","writable": true,"address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"},
        {"name": "clockAccount","writable": true,"address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"},
        {"name": "requesterProfile"},
        {"name": "targetProfile"},
        {"name": "systemProgram","address": "11111111111111111111111111111111"},
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"}
      ],
      "args": [{"name": "computationOffset","type": "u64"},{"name": "thresholdPct","type": "u64"}]
    },
    {
      "name": "thresholdCheckCallback",
      "discriminator": [52,88,195,139,216,227,60,224],
      "accounts": [
        {"name": "arciumProgram","address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"},
        {"name": "compDefAccount"},
        {"name": "mxeAccount"},
        {"name": "computationAccount"},
        {"name": "clusterAccount"},
        {"name": "instructionsSysvar","address": "Sysvar1nstructions1111111111111111111111111"}
      ],
      "args": [{"name": "output","type": {"defined": {"name": "signedComputationOutputs","generics": [{"kind": "type","type": {"defined": {"name": "thresholdCheckOutput"}}}]}}}]
    },
    {
      "name": "uploadProfile",
      "discriminator": [204,241,86,43,174,240,195,116],
      "accounts": [
        {"name": "payer","writable": true,"signer": true},
        {"name": "profile","writable": true},
        {"name": "systemProgram","address": "11111111111111111111111111111111"}
      ],
      "args": [
        {"name": "snpCt","type": {"array": [{"array": ["u8",32]},5]}},
        {"name": "snpPubKey","type": {"array": ["u8",32]}},
        {"name": "snpNonce","type": "u128"}
      ]
    }
  ],
  "accounts": [
    {"name": "arciumSignerAccount","discriminator": [214,157,122,114,117,44,214,74]},
    {"name": "clockAccount","discriminator": [152,171,158,195,75,61,51,8]},
    {"name": "cluster","discriminator": [236,225,118,228,173,106,18,60]},
    {"name": "computationDefinitionAccount","discriminator": [245,176,217,221,253,104,172,200]},
    {"name": "dnaProfile","discriminator": [35,97,6,126,106,2,75,203]},
    {"name": "feePool","discriminator": [172,38,77,146,148,5,51,242]},
    {"name": "mxeAccount","discriminator": [103,26,85,250,179,159,17,117]}
  ],
  "events": [
    {"name": "hammingResultEvent","discriminator": [245,93,244,26,3,3,242,101]},
    {"name": "profileUploaded","discriminator": [21,222,121,136,65,59,253,78]},
    {"name": "thresholdResultEvent","discriminator": [55,77,251,125,166,104,127,170]}
  ],
  "errors": [
    {"code": 6000,"name": "abortedComputation","msg": "MPC computation was aborted"},
    {"code": 6001,"name": "clusterNotSet","msg": "MPC cluster not configured"},
    {"code": 6002,"name": "notProfileOwner","msg": "Profile owner does not match the signer"},
    {"code": 6003,"name": "invalidThreshold","msg": "Threshold must be between 0 and 100"}
  ],
  "types": [
    {"name": "computeHammingOutput","type": {"kind": "struct","fields": [{"name": "field0","type": "u64"}]}},
    {"name": "thresholdCheckOutput","type": {"kind": "struct","fields": [{"name": "field0","type": "bool"}]}},
    {"name": "dnaProfile","type": {"kind": "struct","fields": [{"name": "bump","type": "u8"},{"name": "owner","type": "pubkey"},{"name": "snpCt","type": {"array": [{"array": ["u8",32]},5]}},{"name": "snpNonce","type": "u128"},{"name": "snpPubKey","type": {"array": ["u8",32]}}]}},
    {"name": "hammingResultEvent","type": {"kind": "struct","fields": [{"name": "distance","type": "u64"}]}},
    {"name": "thresholdResultEvent","type": {"kind": "struct","fields": [{"name": "isMatch","type": "bool"}]}},
    {"name": "profileUploaded","type": {"kind": "struct","fields": [{"name": "owner","type": "pubkey"}]}}
  ]
};
