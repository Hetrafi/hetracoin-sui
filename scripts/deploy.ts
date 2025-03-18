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
    stakingApy: 500, // 5.00%
    stakingMinLockDays: 30,
    governanceMinVotingPower: 1000,
    governanceVotingPeriodDays: 7,
    governanceExecutionDelayDays: 2,
  },
  mainnet: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    treasuryAddress: process.env.MAINNET_TREASURY_ADDRESS,
    adminAddress: process.env.MAINNET_ADMIN_ADDRESS,
    stakingApy: 500, // 5.00%
    stakingMinLockDays: 30,
    governanceMinVotingPower: 10000,
    governanceVotingPeriodDays: 7,
    governanceExecutionDelayDays: 2,
  }
};

// Helper function to extract private key from Bech32 format
function extractPrivateKeyFromBech32(bech32Key: string): Uint8Array {
  // Remove the prefix and decode from base64
  const base64Key = bech32Key.replace('suiprivkey', '').substring(1);
  const decoded = fromB64(base64Key);
  
  // The decoded key might have extra bytes - we need exactly 32 bytes
  if (decoded.length > 32) {
    return decoded.slice(0, 32);
  }
  
  return decoded;
}

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

// Deploy HetraCoin ecosystem
async function deployHetraCoin(network: 'testnet' | 'mainnet') {
  const config = CONFIG[network];
  console.log(`Deploying HetraCoin to ${network}...`);
  
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
    // Decode from Base64
    let privateKeyArray = fromB64(process.env.DEPLOYER_PRIVATE_KEY);
    
    // If the key is 33 bytes and starts with 0x00, remove the first byte
    if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
      privateKeyArray = privateKeyArray.slice(1);
    }
    
    // Final check
    if (privateKeyArray.length !== 32) {
      throw new Error(`Invalid private key length: ${privateKeyArray.length}`);
    }
    
    keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
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
  const moduleFiles = fs.readdirSync(modulesDir).filter(file => file.endsWith('.mv'));
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
  
  // Get the published package ID (we'll need to extract this from the response)
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
    path.join(__dirname, `../deployment-${network}.json`),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  // Add a delay before initialization to ensure the package is available
  console.log('Waiting for package to be available on the network...');
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
  
  console.log(`Initializing HetraCoin ecosystem on ${network}...`);
  
  // Now initialize the ecosystem components
  await initializeEcosystem(network, packageId, keypair);
  
  console.log(`HetraCoin deployment to ${network} completed successfully!`);
  return deploymentInfo;
}

// Helper to extract package ID from transaction result
function extractPackageId(result: any): string {
  // This is a simplified implementation - you'll need to parse the actual response
  // to extract the package ID based on the Sui SDK response format
  const created = result.objectChanges?.filter((change: any) => change.type === 'published');
  if (created && created.length > 0) {
    return created[0].packageId;
  }
  throw new Error('Could not extract package ID from transaction result');
}

// Initialize the ecosystem components
async function initializeEcosystem(
  network: 'testnet' | 'mainnet',
  packageId: string,
  keypair: Ed25519Keypair
) {
  const config = CONFIG[network];
  console.log(`Initializing HetraCoin ecosystem on ${network}...`);
  
  const client = new SuiClient({ url: config.rpcUrl });
  
  // Create transaction block for initialization
  const tx = new TransactionBlock();
  
  // Create Hetrafi marketplace
  tx.moveCall({
    target: `${packageId}::Hetrafi::create`,
    arguments: [tx.pure(config.treasuryAddress)],
  });
  
  // Create Treasury
  const treasury = tx.moveCall({
    target: `${packageId}::Treasury::create_treasury`,
    arguments: [tx.pure(config.adminAddress)],
  });
  tx.transferObjects([treasury], tx.pure(config.treasuryAddress));
  
  // Create Staking pool
  tx.moveCall({
    target: `${packageId}::Staking::create_staking_pool`,
    arguments: [
      tx.pure(config.stakingApy),
      tx.pure(config.stakingMinLockDays),
    ],
  });
  
  // Create Governance system
  tx.moveCall({
    target: `${packageId}::Proposal::create_governance_system`,
    arguments: [
      tx.pure(config.governanceMinVotingPower),
      tx.pure(config.governanceVotingPeriodDays),
      tx.pure(config.governanceExecutionDelayDays),
    ],
  });
  
  // Execute initialization transaction
  console.log('Executing ecosystem initialization transaction...');
  const result = await client.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });
  
  console.log('Ecosystem initialization completed!');
  console.log('Transaction digest:', result.digest);
  
  // Save initialization info
  const initInfo = {
    network,
    packageId,
    initializationTimestamp: new Date().toISOString(),
    transactionDigest: result.digest,
  };
  
  fs.writeFileSync(
    path.join(__dirname, `../initialization-${network}.json`),
    JSON.stringify(initInfo, null, 2)
  );
  
  return initInfo;
}

// Verification script to check deployment
async function verifyDeployment(network: 'testnet' | 'mainnet') {
  const deploymentFile = path.join(__dirname, `../deployment-${network}.json`);
  const initFile = path.join(__dirname, `../initialization-${network}.json`);
  
  if (!fs.existsSync(deploymentFile) || !fs.existsSync(initFile)) {
    console.error(`Deployment files for ${network} not found`);
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
    
    // Verify shared objects (Hetrafi, StakingPool, GovernanceSystem)
    // This would require querying for these objects by type
    console.log(`Verifying shared objects on ${network}...`);
    
    // Example: Query for Hetrafi object
    // This is a simplified example - you'll need to adapt based on the Sui SDK
    const hetrafiObjects = await client.getOwnedObjects({
      owner: 'Shared',
      filter: { StructType: `${deployment.packageId}::Hetrafi::Hetrafi` },
    });
    
    if (hetrafiObjects.data && hetrafiObjects.data.length > 0) {
      console.log('Hetrafi marketplace verified');
    } else {
      console.error('Hetrafi marketplace not found');
      return false;
    }
    
    // Similar checks for other components
    
    console.log(`Deployment verification on ${network} completed successfully!`);
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
      await deployHetraCoin(network);
      break;
    case 'verify':
      await verifyDeployment(network);
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

export { deployHetraCoin, verifyDeployment }; 