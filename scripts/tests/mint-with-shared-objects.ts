/**
 * HetraCoin Mint Test With Shared Objects
 * 
 * This script demonstrates how to mint HETRA tokens using the proper
 * AdminRegistry and EmergencyPauseState shared objects.
 * 
 * Usage:
 *   npx ts-node scripts/tests/mint-with-shared-objects.ts <amount>
 */
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function mintWithSharedObjects() {
  log("HETRACOIN MINTING WITH SHARED OBJECTS", colors.cyan);
  
  // Parse arguments
  const args = process.argv.slice(2);
  const amountArg = args[0] || "1000000000"; // Default to 1 HETRA (1 billion base units with 9 decimals)
  const amount = BigInt(amountArg);
  
  log(`Minting ${Number(amount) / 1e9} HETRA tokens...`, colors.blue);
  
  // Check for required environment variables
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    log("Error: DEPLOYER_PRIVATE_KEY not set in environment variables", colors.red);
    process.exit(1);
  }
  
  // Get the shared object IDs
  const adminRegistryId = process.env.ADMIN_REGISTRY_ID;
  const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;
  
  if (!adminRegistryId) {
    log("Error: ADMIN_REGISTRY_ID not set in environment variables", colors.red);
    process.exit(1);
  }
  
  if (!pauseStateId) {
    log("Error: EMERGENCY_PAUSE_STATE_ID not set in environment variables", colors.red);
    process.exit(1);
  }
  
  log(`Using AdminRegistry: ${adminRegistryId}`, colors.blue);
  log(`Using EmergencyPauseState: ${pauseStateId}`, colors.blue);
  
  // Initialize SUI client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Create keypair from private key
  let keypair: Ed25519Keypair;
  try {
    const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKeyString) throw new Error("Private key is undefined");
    
    let privateKeyArray = fromB64(privateKeyString);
    
    if (privateKeyArray.length !== 32) {
      if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
        privateKeyArray = privateKeyArray.slice(1);
      } else if (privateKeyArray.length === 44) {
        privateKeyArray = privateKeyArray.slice(0, 32);
      } else {
        throw new Error(`Unexpected private key length: ${privateKeyArray.length}`);
      }
    }
    
    keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
  } catch (error) {
    log(`Error creating keypair: ${error}`, colors.red);
    process.exit(1);
  }
  
  // Get the wallet address
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  log(`Using wallet address: ${walletAddress}`, colors.blue);
  
  // Load package ID from deployment info
  const deploymentPath = path.join(__dirname, '../../deployment-phase1-testnet.json');
  if (!fs.existsSync(deploymentPath)) {
    log(`Deployment file not found: ${deploymentPath}`, colors.red);
    process.exit(1);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  log(`Using package ID: ${packageId}`, colors.blue);
  
  // Find TreasuryCap
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;
  
  log("Finding TreasuryCap...", colors.blue);
  const treasuryObjects = await client.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `0x2::coin::TreasuryCap<${coinType}>` },
    options: { showContent: true }
  });
  
  if (!treasuryObjects.data || treasuryObjects.data.length === 0) {
    log("TreasuryCap not found in wallet", colors.red);
    process.exit(1);
  }
  
  const treasuryCapId = treasuryObjects.data[0].data?.objectId;
  if (!treasuryCapId) {
    log("Could not extract TreasuryCap ID", colors.red);
    process.exit(1);
  }
  
  log(`Using TreasuryCap: ${treasuryCapId}`, colors.blue);
  
  // Create transaction for minting with shared objects
  const tx = new TransactionBlock();
  
  // Call the HetraCoin::mint function with the required objects and proper type information
  const coinObject = tx.moveCall({
    target: `${packageId}::HetraCoin::mint`,
    typeArguments: [], // No type arguments needed as it's using the fixed HETRACOIN type internally
    arguments: [
      tx.object(treasuryCapId), // &mut TreasuryCap<HETRACOIN>
      tx.pure(amount),         // amount: u64
      tx.object(adminRegistryId), // &AdminRegistry
      tx.object(pauseStateId)   // &EmergencyPauseState
    ],
  });
  
  // Transfer the minted coins to the wallet
  tx.transferObjects([coinObject], tx.pure(walletAddress));
  
  // Execute the transaction
  log("Executing mint transaction...", colors.blue);
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    if (result.effects?.status?.status === 'success') {
      log(`✅ Successfully minted ${Number(amount) / 1e9} HETRA tokens!`, colors.green);
      log(`Transaction digest: ${result.digest}`, colors.blue);
      
      // Look for relevant events
      if (result.events && result.events.length > 0) {
        const mintEvents = result.events.filter(event => 
          event.type.includes('::MintEvent')
        );
        
        if (mintEvents.length > 0) {
          log("Mint event details:", colors.blue);
          console.log(mintEvents[0]);
        }
      }
    } else {
      log(`❌ Transaction failed: ${result.effects?.status?.error}`, colors.red);
    }
  } catch (error) {
    log(`Error executing transaction: ${error}`, colors.red);
  }
}

// Run if called directly
if (require.main === module) {
  mintWithSharedObjects().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { mintWithSharedObjects }; 