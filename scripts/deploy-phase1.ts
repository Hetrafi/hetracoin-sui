import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64, normalizeSuiAddress } from '@mysten/sui.js/utils';

dotenv.config();

// Configuration
const CONFIG = {
  testnet: {
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    treasuryAddress: process.env.TESTNET_TREASURY_ADDRESS,
    adminAddress: process.env.TESTNET_ADMIN_ADDRESS,
    governanceMinVotingPower: 1000,
    governanceVotingPeriodDays: 7,
    governanceExecutionDelayDays: 2,
  },
  mainnet: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    treasuryAddress: process.env.MAINNET_TREASURY_ADDRESS,
    adminAddress: process.env.MAINNET_ADMIN_ADDRESS,
    governanceMinVotingPower: 10000,
    governanceVotingPeriodDays: 7,
    governanceExecutionDelayDays: 2,
  }
};

// Helper to get bytecode from compiled modules
async function getBytecodeFromPath(modulePath: string): Promise<Uint8Array> {
  return new Uint8Array(fs.readFileSync(modulePath));
}

// Compile the Move package
function compileMovePackage() {
  console.log('Compiling Move package...');
  execSync('sui move build', { stdio: 'inherit' });
  console.log('Compilation successful!');
}

// Deploy Phase 1 - HetraCoin, Treasury and Governance
async function deployPhase1(network: 'testnet' | 'mainnet') {
  const config = CONFIG[network];
  console.log(`Deploying HetraCoin Phase 1 to ${network}...`);
  
  // Compile the package
  compileMovePackage();
  
  // Initialize client and signer
  const client = new SuiClient({ url: config.rpcUrl });
  
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set in environment variables');
  }
  
  // Create keypair from the private key
  let keypair;
  try {
    const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY;
    
    // If we get a 44-byte key instead of 32 bytes, extract just the key portion
    let keyData = fromB64(privateKeyBase64);
    
    // Ensure we have exactly 32 bytes
    if (keyData.length === 44) {
      // Take the first 32 bytes which should be the actual key
      keyData = keyData.slice(0, 32);
    } else if (keyData.length !== 32) {
      throw new Error(`Invalid private key length: ${keyData.length}. Expected 32 bytes.`);
    }
    
    keypair = Ed25519Keypair.fromSecretKey(keyData);
  } catch (error) {
    throw new Error(`Failed to parse private key: ${error}`);
  }
  
  // After creating the keypair
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  console.log('Deploying from wallet address:', walletAddress);
  
  // Create transaction block
  const tx = new TransactionBlock();
  
  // Get all module bytecode
  const modulesDir = path.join(__dirname, '../build/hetracoin-sui/bytecode_modules');
  const moduleFiles = fs.readdirSync(modulesDir).filter(file => {
    // Only include HetraCoin, Treasury, and Governance modules
    return file.endsWith('.mv') && (
      file.startsWith('HetraCoin') || 
      file.startsWith('Treasury') || 
      file.startsWith('Governance')
    );
  });
  
  const modules = await Promise.all(
    moduleFiles.map(file => getBytecodeFromPath(path.join(modulesDir, file)))
  );
  
  // Publish the package
  const [upgradeCap] = tx.publish({
    modules: modules.map(m => Array.from(m)),
    dependencies: [
      '0x2', // Sui framework
      '0x1', // Move stdlib
    ],
  });
  
  // Store upgrade cap with the deployer
  tx.transferObjects([upgradeCap], tx.pure(keypair.getPublicKey().toSuiAddress()));
  
  // Execute deployment transaction
  console.log('Executing deployment transaction...');
  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });
  
  console.log('Deployment transaction executed!');
  console.log('Transaction digest:', result.digest);
  
  // Extract the package ID from the result
  const packageId = extractPackageId(result);
  console.log('Package ID:', packageId);
  
  // Save deployment information
  const deploymentInfo = {
    packageId,
    transactionDigest: result.digest,
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    path.join(__dirname, `../deployment-phase1-${network}.json`),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  // Add a delay before initialization to ensure the package is available
  console.log('Waiting for package to be available on the network...');
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
  
  console.log(`Initializing HetraCoin Phase 1 on ${network}...`);
  
  // Initialize phase 1 components
  await initializePhase1(network, packageId, keypair);
  
  console.log(`HetraCoin Phase 1 deployment to ${network} completed successfully!`);
  return deploymentInfo;
}

// Helper to extract package ID from transaction result
function extractPackageId(result: any): string {
  const created = result.objectChanges?.filter((change: any) => change.type === 'published');
  if (created && created.length > 0) {
    return created[0].packageId;
  }
  throw new Error('Could not extract package ID from transaction result');
}

// Initialize only the Phase 1 components
async function initializePhase1(
  network: 'testnet' | 'mainnet',
  packageId: string,
  keypair: Ed25519Keypair
) {
  const config = CONFIG[network];
  console.log(`Initializing HetraCoin Phase 1 components on ${network}...`);
  
  const client = new SuiClient({ url: config.rpcUrl });
  
  // Create transaction block for initialization
  const tx = new TransactionBlock();
  
  // Create Treasury only
  const treasury = tx.moveCall({
    target: `${packageId}::Treasury::create_treasury`,
    arguments: [tx.pure(config.adminAddress)],
  });
  tx.transferObjects([treasury], tx.pure(config.treasuryAddress));
  
  // Execute initialization transaction
  console.log('Executing phase 1 initialization transaction...');
  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });
  
  console.log('Phase 1 initialization completed!');
  console.log('Transaction digest:', result.digest);
  
  // Save initialization info
  const initInfo = {
    network,
    packageId,
    initializationTimestamp: new Date().toISOString(),
    transactionDigest: result.digest,
  };
  
  fs.writeFileSync(
    path.join(__dirname, `../initialization-phase1-${network}.json`),
    JSON.stringify(initInfo, null, 2)
  );
  
  return initInfo;
}

// Verification script to check deployment
async function verifyPhase1Deployment(network: 'testnet' | 'mainnet') {
  const deploymentFile = path.join(__dirname, `../deployment-phase1-${network}.json`);
  const initFile = path.join(__dirname, `../initialization-phase1-${network}.json`);
  
  if (!fs.existsSync(deploymentFile) || !fs.existsSync(initFile)) {
    console.error(`Phase 1 deployment files for ${network} not found`);
    return false;
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  const init = JSON.parse(fs.readFileSync(initFile, 'utf8'));
  
  const client = new SuiClient({ url: CONFIG[network].rpcUrl });
  
  // Verify package exists
  try {
    const packageObj = await client.getObject({
      id: deployment.packageId,
      options: { showContent: true }
    });
    console.log(`Package verified on ${network}`);
    
    console.log(`Verifying phase 1 components on ${network}...`);
    
    // Verify HetraCoin modules
    const hetraCoinObjects = await client.getOwnedObjects({
      owner: CONFIG[network].adminAddress as string,
      filter: { StructType: `${deployment.packageId}::HetraCoin::AdminCap` },
    });
    
    if (hetraCoinObjects.data && hetraCoinObjects.data.length > 0) {
      console.log('HetraCoin modules verified');
    } else {
      console.error('HetraCoin AdminCap not found');
      return false;
    }
    
    // Verify Treasury
    const treasuryObjects = await client.getOwnedObjects({
      owner: CONFIG[network].treasuryAddress as string,
      filter: { StructType: `${deployment.packageId}::Treasury::Treasury` },
    });
    
    if (treasuryObjects.data && treasuryObjects.data.length > 0) {
      console.log('Treasury verified');
    } else {
      console.error('Treasury not found');
      return false;
    }
    
    // Verify Governance
    const governanceObjects = await client.getOwnedObjects({
      owner: CONFIG[network].adminAddress as string,
      filter: { StructType: `${deployment.packageId}::Governance::GovernanceCap` },
    });
    
    if (governanceObjects.data && governanceObjects.data.length > 0) {
      console.log('Governance system verified');
    } else {
      console.error('Governance cap not found');
      return false;
    }
    
    console.log(`Phase 1 verification on ${network} completed successfully!`);
    return true;
  } catch (error) {
    console.error(`Verification failed: ${error}`);
    return false;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const network = (args[1] || 'testnet') as 'testnet' | 'mainnet';
  
  if (!['testnet', 'mainnet'].includes(network)) {
    console.error('Invalid network. Use "testnet" or "mainnet"');
    process.exit(1);
  }
  
  switch (command) {
    case 'deploy':
      await deployPhase1(network);
      break;
    case 'verify':
      await verifyPhase1Deployment(network);
      break;
    default:
      console.error('Invalid command. Use "deploy" or "verify"');
      process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { deployPhase1, verifyPhase1Deployment };
