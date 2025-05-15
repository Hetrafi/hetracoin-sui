/**
 * HetraCoin Deployment Transaction Checker
 * 
 * This script examines the deployment transaction to identify all created objects.
 * 
 * Usage:
 *   npx ts-node scripts/tests/check-deployment-tx.ts
 */
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkDeploymentTransaction() {
  console.log("CHECKING HETRACOIN DEPLOYMENT TRANSACTION");
  console.log("----------------------------------------");
  
  // Initialize client
  console.log('Initializing SUI client...');
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  console.log('SUI client initialized');
  
  // Load deployment info
  console.log('Loading deployment info...');
  const deploymentPath = path.join(__dirname, '../../deployment-phase1-testnet.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    process.exit(1);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  const transactionDigest = deploymentInfo.transactionDigest;
  console.log(`Package ID: ${packageId}`);
  console.log(`Transaction digest: ${transactionDigest}`);
  
  // Get transaction details
  console.log('\nFetching transaction details...');
  const txDetails = await client.getTransactionBlock({
    digest: transactionDigest,
    options: {
      showEffects: true,
      showEvents: true,
      showInput: true,
      showObjectChanges: true,
    }
  });
  
  // Look for created objects
  console.log('\nLooking for created objects in transaction...');
  
  if (!txDetails.objectChanges) {
    console.error('No object changes found in the transaction');
    return;
  }
  
  // Log all objects for inspection
  console.log('\n=== ALL OBJECTS CREATED IN TRANSACTION ===');
  console.log(JSON.stringify(txDetails.objectChanges, null, 2));
  
  // Look specifically for AdminRegistry and EmergencyPauseState
  console.log('\n=== SEARCHING FOR SHARED OBJECTS ===');
  for (const change of txDetails.objectChanges) {
    if (change.type === 'created') {
      // @ts-ignore - Accessing dynamically checked properties
      const objectType = change.objectType || '';
      // @ts-ignore - Accessing dynamically checked properties
      const objectId = change.objectId || '';
      // @ts-ignore - Accessing dynamically checked properties
      const owner = change.owner || {};
      
      const isShared = JSON.stringify(owner).includes('Shared');
      
      if (objectType.includes('HetraCoin') && isShared) {
        console.log('\nPossible shared object found:');
        console.log(`ID: ${objectId}`);
        console.log(`Type: ${objectType}`);
        console.log(`Owner: ${JSON.stringify(owner)}`);
        
        if (objectType.includes('AdminRegistry')) {
          console.log('\n>>> ADMIN REGISTRY FOUND <<<');
          console.log(`Add to .env: ADMIN_REGISTRY_ID=${objectId}`);
        }
        
        if (objectType.includes('EmergencyPauseState')) {
          console.log('\n>>> EMERGENCY PAUSE STATE FOUND <<<');
          console.log(`Add to .env: EMERGENCY_PAUSE_STATE_ID=${objectId}`);
        }
      }
    }
  }
}

// Run if called directly
if (require.main === module) {
  checkDeploymentTransaction().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { checkDeploymentTransaction }; 