# Security Tests for HetraCoin

This directory contains security tests for the HetraCoin smart contract.

## Prerequisites

1. Sui CLI must be configured and connected to the testnet
2. The HetraCoin package must be published to the testnet
3. The private keys for admin, user, attacker, and treasury owner must be available

## Setup

1. First, mint coins for testing:

```bash
npx ts-node setup-coins.ts \
  --package <PACKAGE_ID> \
  --treasury <TREASURY_CAP_ID> \
  --signer-key <BASE64_PRIVATE_KEY_OF_TREASURY_OWNER>
```

Replace:
- `<PACKAGE_ID>` with your published package ID (e.g., 0x894f2ee95f0368794df8778f7d4d1714d02766dd6d7095188fa51f5a360b66ea)
- `<TREASURY_CAP_ID>` with the TreasuryCap ID object (e.g., 0x3c85e7b873d532c061786c7c239367acc0d2dabc6cdc4b1ca6c13949ca007e60)  
- `<BASE64_PRIVATE_KEY_OF_TREASURY_OWNER>` with the base64-encoded private key of the account that owns the TreasuryCap

This will:
- Mint coins for admin, user, and attacker accounts
- Create a test-config.json file with all necessary object IDs

2. Run the security tests:

```bash
npx ts-node index.ts testnet --package <PACKAGE_ID>
```

The tests will automatically use the object IDs from test-config.json.

## Troubleshooting

If you encounter errors like "Object is owned by account X but given signer is Y", make sure you're using the correct private key for the account that owns the TreasuryCap.

To find the owner of an object, you can use:

```
sui client object <OBJECT_ID>
``` 