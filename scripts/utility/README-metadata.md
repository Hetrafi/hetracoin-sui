# HetraCoin Metadata Utilities

This directory contains utilities for diagnosing and fixing issues with the HetraCoin metadata display on blockchain explorers like Suiscan.

## Common Metadata Display Issues

Coin metadata might not display correctly on explorers due to various reasons:

1. Image URL uses HTTP instead of HTTPS
2. Image is hosted on an unreliable service
3. Image format is not compatible with the explorer
4. Metadata wasn't properly updated in the blockchain
5. **Incorrect package ID being used when checking metadata**

## Available Scripts

### 1. Find Deployment IDs (Start Here)

This helper script scans your deployment files to find the correct package ID and treasury cap ID:

```bash
node scripts/utility/find-deployment-ids.js
```

The script will:
- Check all deployment and initialization files
- Find all package IDs and treasury cap IDs
- Display ready-to-use commands for the other utilities

### 2. Check Coin Metadata

This script checks the current on-chain metadata for HetraCoin and provides diagnostics.

```bash
# Using the package ID from environment variables
node scripts/utility/check-coin-metadata.js

# Specifying a package ID directly (recommended)
node scripts/utility/check-coin-metadata.js <package-id>
```

The script will:
- Locate the CoinMetadata object for HetraCoin
- Display all metadata fields (name, symbol, description, decimals)
- Check the icon URL for common issues
- Provide recommendations if problems are found

### 3. Update Coin Metadata

This script updates the metadata for HetraCoin with corrected values.

```bash
# Using IDs from environment variables
node scripts/utility/update-coin-metadata.js

# Specifying IDs directly (recommended)
node scripts/utility/update-coin-metadata.js <package-id> <treasury-cap-id>
```

The script will:
- Find the current metadata object
- Create a transaction to update the metadata with the correct values
- Execute the transaction and display the result

## Finding the Correct Package ID

The easiest way is to use the `find-deployment-ids.js` script, but you can also find your package ID in these ways:

1. **From deployment files**: Check the `deployment-phase1-testnet.json` or `deployment-phase1-mainnet.json` file

2. **From environment variables**: Look at your `.env` file for `PACKAGE_ID`

3. **Using Sui CLI**:
   ```
   sui client addresses
   sui client objects --address <your-deployer-address>
   ```

## Finding the Treasury Cap ID

The Treasury Cap ID is needed to update metadata. You can find it:

1. **Using the `find-deployment-ids.js` script** (recommended)

2. **From initialization files**: Check the `initialization-phase1-testnet.json` or `initialization-phase1-mainnet.json` file for `treasuryCapId`

3. **From environment variables**: Look at your `.env` file for `TREASURY_CAP_ID`

4. **Using Sui CLI**:
   ```
   sui client objects --address <your-deployer-address> | grep TreasuryCap
   ```

## Troubleshooting Steps

If your coin metadata is not displaying correctly on explorers:

1. First, run the helper script to find the correct IDs:
   ```
   node scripts/utility/find-deployment-ids.js
   ```

2. Run the check script with your package ID:
   ```
   node scripts/utility/check-coin-metadata.js <your-package-id>
   ```

3. Review the output for any potential issues with the metadata

4. If issues are found, run the update script with both IDs:
   ```
   node scripts/utility/update-coin-metadata.js <your-package-id> <your-treasury-cap-id>
   ```

5. After updating, wait a few minutes and check the explorer again

## Additional Tips for Coin Visibility

- Use high-quality, square PNG images for the coin icon (recommended size: 128x128px or 256x256px)
- Ensure the image host allows cross-origin resource sharing (CORS)
- Consider using dedicated blockchain storage solutions like IPFS for permanent availability
- Some explorers cache metadata, so changes might not appear immediately 