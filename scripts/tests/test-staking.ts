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
 * Test the Staking module functionality after upgrade
 */
async function testStaking() {
  try {
    console.log('Testing Staking module functionality...');
    
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const packageIdV2 = process.env.PACKAGE_ID_V2 || process.env.PACKAGE_ID;
    
    if (!privateKey || !packageIdV2) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_PRIVATE_KEY and PACKAGE_ID_V2 are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`Sender address: ${sender}`);
    console.log(`Package ID: ${packageIdV2}`);
    
    // Create a staking pool
    console.log('\nCreating a staking pool...');
    
    const txb = new TransactionBlock();
    
    // Call the create_staking_pool function
    txb.moveCall({
      target: `${packageIdV2}::Staking::create_staking_pool`,
      arguments: [
        txb.pure(500),  // reward_rate: 5%
        txb.pure(30),   // min_lock_period: 30 days
      ],
    });
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    console.log('\nStaking pool creation transaction result:');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    if (result.effects?.status?.status === 'success') {
      console.log('\n✅ Staking pool created successfully!');
      
      // Find the staking pool from created objects
      let stakingPoolId = '';
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          // Check if this is a created object of the right type
          if (
            change.type === 'created' && 
            'objectType' in change && 
            change.objectType.includes('::Staking::StakingPool') &&
            'objectId' in change
          ) {
            stakingPoolId = change.objectId;
            break;
          }
        }
      }
      
      if (stakingPoolId) {
        console.log(`\nCreated Staking Pool ID: ${stakingPoolId}`);
        
        // Update the .env file with the staking pool ID
        console.log('\nUpdating .env file with the staking pool ID...');
        let envContent = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8');
        
        if (envContent.includes('STAKING_POOL_ID=')) {
          // Update existing variable
          envContent = envContent.replace(/STAKING_POOL_ID=.*/, `STAKING_POOL_ID=${stakingPoolId}`);
        } else {
          // Add new variable
          envContent += `\nSTAKING_POOL_ID=${stakingPoolId}`;
        }
        
        fs.writeFileSync(path.join(__dirname, '../../.env'), envContent);
        console.log('Updated .env file with STAKING_POOL_ID');
      } else {
        console.log('No staking pool object found in transaction results');
      }
    } else {
      console.error('\n❌ Staking pool creation failed');
      if (result.effects?.status?.error) {
        console.error('Error:', result.effects.status.error);
      }
    }
    
    return result.digest;
  } catch (error) {
    console.error('Error testing Staking module:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  testStaking()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { testStaking }; 