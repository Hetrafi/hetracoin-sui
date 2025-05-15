import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

/**
 * Creates a manual step-by-step guide for upgrading the package
 */
async function createUpgradeInstructions() {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const packageId = process.env.PACKAGE_ID;
    const upgradeCapId = process.env.UPGRADE_CAP_ID;
    
    if (!privateKey || !packageId || !upgradeCapId) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_PRIVATE_KEY, PACKAGE_ID, and UPGRADE_CAP_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`Sender address: ${sender}`);
    console.log(`Package ID: ${packageId}`);
    console.log(`Upgrade Cap ID: ${upgradeCapId}`);
    
    // Step 1: Build a transaction that authorizes the upgrade
    const txBlock1 = new TransactionBlock();
    const upgradeTicket = txBlock1.moveCall({
      target: '0x2::package::authorize_upgrade',
      arguments: [
        txBlock1.object(upgradeCapId),
        txBlock1.pure(packageId)
      ]
    });
    
    // We don't actually need to serialize the transaction for manual instructions
    // Just create the instructions directly
    
    // Step 2: Generate upgrade instructions
    const instructions = `
# HetraCoin Upgrade Instructions

Follow these steps to upgrade the HetraCoin package by adding the Staking module.

## Step 1: Prepare the Upgrade Files

1. Copy all existing Move files from the 'sources' directory to a temporary directory
2. Add the 'Staking.move' file from 'future_contracts/phase_2/' to the temporary directory
3. Copy the Move.toml file to the temporary directory
4. Build the package:

\`\`\`bash
cd temp_directory
sui move build
\`\`\`

## Step 2: Authorize Upgrade

1. Execute the following transaction to get an upgrade ticket:

\`\`\`
sui client call --package 0x2 --module package --function authorize_upgrade --args ${upgradeCapId} ${packageId} --gas-budget 100000000
\`\`\`

2. Save the result object from the response, it contains your upgrade ticket: <UPGRADE_TICKET>

## Step 3: Commit the Upgrade

1. Execute the commit_upgrade function with the upgrade ticket:

\`\`\`
sui client call --package 0x2 --module package --function commit_upgrade --args ${upgradeCapId} ${packageId} <PATH_TO_BYTECODE_MODULES> <UPGRADE_TICKET> --gas-budget 100000000
\`\`\`

You can pass the bytecode modules using:
\`\`\`
--args-json '[["path/to/module1.mv", "path/to/module2.mv"]]'
\`\`\`

2. The response will include a new package ID. Update your .env file with:

\`\`\`
PACKAGE_ID_V2=<NEW_PACKAGE_ID>
\`\`\`

## Step 4: Test the Upgraded Package

1. Create a new staking pool using:

\`\`\`
sui client call --package <PACKAGE_ID_V2> --module Staking --function create_staking_pool --args 500 30 --gas-budget 100000000
\`\`\`

2. Save the StakingPool object ID from the response for future use.
`;
    
    // Write instructions to a file
    const instructionsPath = path.join(__dirname, '../UPGRADE_INSTRUCTIONS.md');
    fs.writeFileSync(instructionsPath, instructions);
    
    console.log(`\nUpgrade instructions have been written to ${instructionsPath}`);
    console.log('Follow these instructions to manually perform the package upgrade.');
    
    return instructionsPath;
  } catch (error) {
    console.error('Error creating upgrade instructions:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  createUpgradeInstructions()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { createUpgradeInstructions }; 