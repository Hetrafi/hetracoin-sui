/**
 * HetraCoin Shared Object Finder
 * 
 * This script finds the AdminRegistry and EmergencyPauseState shared objects
 * by examining the deployment transaction.
 * 
 * Usage:
 *   npx ts-node scripts/tests/find-shared-objects.ts
 */
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function findSharedObjects() {
  console.log("FINDING HETRACOIN SHARED OBJECTS");
  console.log("--------------------------------");
  
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
      showBalanceChanges: true,
    }
  });
  
  // Look for created objects
  console.log('\nLooking for shared objects in transaction...');
  const objectChanges = txDetails.objectChanges || [];
  
  // Find the shared objects
  const sharedObjects = objectChanges.filter(change => 
    change.type === 'created' && 
    change.objectType?.includes(`${packageId}::HetraCoin::`) &&
    (change.owner?.type === 'Shared' || change.objectType?.includes('Registry') || change.objectType?.includes('EmergencyPauseState'))
  );
  
  // Print all shared objects
  console.log(`\nFound ${sharedObjects.length} potential shared objects:`);
  sharedObjects.forEach((obj, index) => {
    console.log(`\n[${index + 1}] Object ID: ${obj.objectId}`);
    console.log(`    Type: ${obj.objectType}`);
    console.log(`    Owner: ${JSON.stringify(obj.owner)}`);
  });
  
  // Find specific objects we need
  const adminRegistry = sharedObjects.find(obj => 
    obj.objectType?.includes('AdminRegistry')
  );
  
  const pauseState = sharedObjects.find(obj => 
    obj.objectType?.includes('EmergencyPauseState')
  );
  
  console.log('\n--- RESULTS ---');
  
  if (adminRegistry) {
    console.log(`\nAdminRegistry ID: ${adminRegistry.objectId}`);
    console.log(`Add to .env: ADMIN_REGISTRY_ID=${adminRegistry.objectId}`);
  } else {
    console.log('\nAdminRegistry not found in transaction');
  }
  
  if (pauseState) {
    console.log(`\nEmergencyPauseState ID: ${pauseState.objectId}`);
    console.log(`Add to .env: EMERGENCY_PAUSE_STATE_ID=${pauseState.objectId}`);
  } else {
    console.log('\nEmergencyPauseState not found in transaction');
  }
  
  // Create .env file with the correct values
  if (adminRegistry && pauseState) {
    console.log('\nWould you like to update your .env file with these values? (Y/n)');
    console.log('Since this is a script, we\'ll simulate adding to .env:');
    
    // Read existing .env content
    const envPath = path.resolve('./.env');
    let envContent = '';
    
    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      // Add or update the values
      const lines = envContent.split('\n');
      let adminRegistryFound = false;
      let pauseStateFound = false;
      
      // Update existing values
      const updatedLines = lines.map(line => {
        if (line.startsWith('ADMIN_REGISTRY_ID=')) {
          adminRegistryFound = true;
          return `ADMIN_REGISTRY_ID=${adminRegistry.objectId}`;
        } else if (line.startsWith('EMERGENCY_PAUSE_STATE_ID=')) {
          pauseStateFound = true;
          return `EMERGENCY_PAUSE_STATE_ID=${pauseState.objectId}`;
        }
        return line;
      });
      
      // Add new values if not present
      if (!adminRegistryFound) {
        updatedLines.push(`ADMIN_REGISTRY_ID=${adminRegistry.objectId}`);
      }
      
      if (!pauseStateFound) {
        updatedLines.push(`EMERGENCY_PAUSE_STATE_ID=${pauseState.objectId}`);
      }
      
      const newEnvContent = updatedLines.join('\n');
      
      console.log('\nNew .env content would be:');
      console.log('---------------------------');
      console.log(newEnvContent);
      console.log('---------------------------');
      
      // We recommend manually adding these values to .env
      console.log('\nPlease manually add these values to your .env file.');
    } catch (error) {
      console.error(`Error updating .env file: ${error}`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  findSharedObjects().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { findSharedObjects }; 