# HetraCoin Upgrade Guide

This document outlines the process for safely upgrading the HetraCoin smart contract ecosystem on the Sui blockchain.

## Prerequisites

Before proceeding with any upgrade:

1. Ensure you have the `UPGRADE_CAP_ID` in your `.env` file. This capability token was created during the initial deployment.
2. Make sure you have access to the deployer wallet that owns the upgrade capability.
3. Create a complete backup of your current contract state and deployment files.
4. Fully test the upgrade in a separate environment before applying to mainnet.
5. Consider having another audit for significant changes to the codebase.

## Checking the Upgrade Capability

To verify you have the correct upgrade capability:

```bash
# Run the get-upgrade-cap script
npx ts-node scripts/examine/get-upgrade-cap.ts
```

This will check for the upgrade capability, display its ID, and update your `.env` file with the correct `UPGRADE_CAP_ID`.

## Upgrade Process

### 1. Prepare the New Code

When preparing new modules or modifying existing ones, follow these guidelines:

- **Maintain backward compatibility**: Don't remove or change the signature of existing public functions.
- **Add new functionality through new functions**: This ensures existing interfaces remain stable.
- **Keep the same module names**: The module structure must remain consistent.
- **Follow the same coding conventions**: Maintain the same style and patterns.

### 2. Testing the Upgrade

Before applying an upgrade to mainnet:

```bash
# Run the upgrade test script on testnet
npx ts-node scripts/tests/test-upgrade.ts
```

This script will:
- Create a temporary directory containing your upgraded modules
- Build the upgraded package
- Execute a test upgrade transaction
- Verify the upgrade was successful
- Update your `.env` file with the new package ID

### 3. Perform the Upgrade on Mainnet

Once testing is complete and you're ready to upgrade on mainnet:

1. Update your `.env` file to use the mainnet environment:
   ```
   NETWORK=mainnet
   ```

2. Execute the upgrade:
   ```bash
   # Run the upgrade script
   npx ts-node scripts/tests/test-upgrade.ts
   ```

3. Verify the upgrade by checking the transaction result and testing the new functionality.

### 4. Update Client Applications

After the upgrade is complete:

1. Update any client applications to use the new package ID
2. Test all functionality to ensure everything works correctly
3. Update documentation to reflect new features

## Safety Considerations

- **Timelock**: Consider implementing a timelock for upgrades to provide a buffer period for users.
- **Multi-signature**: For production deployments, use a multi-signature wallet to control the upgrade capability.
- **Announcement**: Announce planned upgrades to your community in advance.
- **Audit**: Have significant upgrades audited by a reputable security firm.

## Example: Adding a New Module

When adding a new module to the HetraCoin ecosystem:

1. Create the new module file in the `sources/` directory
2. Ensure it uses the same package name (`hetracoin`) and follows the same coding patterns
3. Build and test the module locally
4. Use the upgrade process outlined above to deploy

## Practical Example: Adding a Staking Module

Here's a complete walkthrough of adding a new Staking module to the HetraCoin ecosystem:

### 1. Preparation

```bash
# Create a temporary directory for the upgrade
mkdir -p temp_upgrade/sources

# Copy all existing source files to the temporary directory
cp -r sources/* temp_upgrade/sources/

# Copy the Move.toml file
cp Move.toml temp_upgrade/
```

### 2. Add the New Staking Module

Create your new `Staking.move` file in the `sources/` directory:

```move
// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

/// @title Staking Module for HetraCoin
module hetracoin::Staking {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::event;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    
    // Your staking implementation here
    // ...
}
```

Make sure to copy this file to your temporary upgrade directory:

```bash
cp sources/Staking.move temp_upgrade/sources/
```

### 3. Update the Move.toml

Ensure the `published-at` field in `temp_upgrade/Move.toml` points to the correct package ID from your last deployment:

```toml
[package]
name = "hetracoin-sui"
version = "0.1.0"
published-at = "0xb51c6a8f43b716c9b4903d9e8d9cf124c781ada7acd8a56008f2b83249581003"  # Your current package ID
```

### 4. Build and Verify

```bash
# Build the package in the temporary directory
cd temp_upgrade
sui move build
cd ..
```

### 5. Execute the Upgrade

Before running the upgrade, ensure these critical requirements are met:

1. **Correct Upgrade Capability ID**: Verify your `UPGRADE_CAP_ID` in the `.env` file matches the one from your most recent deployment.

2. **Correct Active Wallet Address**: The wallet executing the upgrade must be the one that owns the upgrade capability.

   ```bash
   # Check your active address
   sui client active-address
   
   # If needed, switch to the correct address
   sui client switch --address 0xYOUR_DEPLOYER_ADDRESS
   ```

3. **Correct Package ID**: The `published-at` in your `temp_upgrade/Move.toml` must match your current deployed package.

Once verified, run the upgrade:

```bash
sui client upgrade \
  --upgrade-capability YOUR_UPGRADE_CAP_ID \
  temp_upgrade \
  --gas-budget 500000000
```

### 6. Troubleshooting Common Issues

#### Wrong Wallet Address Error

If you see an error like:
```
Transaction was not signed by the correct sender: Object 0x... is owned by account address 0x..., but given owner/signer address is 0x...
```

This means your active Sui client address doesn't match the owner of the upgrade capability. Verify:

1. Which address owns the capability:
   ```bash
   sui client object YOUR_UPGRADE_CAP_ID
   ```

2. Switch to that address:
   ```bash
   sui client switch --address THE_OWNER_ADDRESS
   ```

#### Key Import Issues

If you need to import the private key for the deployer wallet:

1. Use the correct format for importing keys:
   ```bash
   # For raw private keys, first convert to Bech32 format
   sui keytool convert YOUR_RAW_HEX_KEY
   
   # Then import the resulting key that starts with "suiprivkey"
   sui keytool import suiprivkey... ed25519
   ```
   
#### "No published-at field" Error

If you see:
```
No 'published-at' field in Move.toml or 'published-id' in Move.lock for package to be upgraded.
```

Ensure the `temp_upgrade/Move.toml` file has a `published-at` field with the correct package ID:

```toml
[package]
published-at = "0xYOUR_CURRENT_PACKAGE_ID"
```

### 7. Verify the Upgrade

After a successful upgrade:

1. Note the transaction digest from the output
2. Check the transaction for any errors:
   ```bash
   sui client transaction YOUR_TRANSACTION_DIGEST
   ```
3. Verify that your new module is accessible:
   ```bash
   sui client call --function staking_function_name --module Staking --package YOUR_NEW_PACKAGE_ID ...
   ```

## Technical Details

The upgrade process uses the `0x2::package::upgrade_from_modules` function provided by the Sui framework. This function:

1. Takes the `UpgradeCap` object as input
2. Takes the bytecode of the new modules
3. Creates a new version of the package while maintaining the package ID
4. Maintains all existing objects created by the previous version

## Example: Modifying an Existing Module

When modifying an existing module:

1. Make a copy of the current module
2. Add new functionality through new functions
3. Avoid changing signatures of existing functions
4. Test thoroughly before upgrading

## Troubleshooting

If you encounter issues during the upgrade process:

- **Verification Error**: Make sure your new modules follow the compatibility rules.
- **Authorization Error**: Ensure you're using the correct upgrader wallet.
- **Build Error**: Check that all dependencies are correctly specified.

For assistance, contact the Sui developer community or seek help from expert Move developers.

## Conclusion

The upgradeability feature of Sui provides a powerful mechanism to evolve your smart contract ecosystem while maintaining compatibility with existing deployments. By following this guide, you can safely upgrade your HetraCoin implementation to add new features and functionality. 