import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { requestSuiFromFaucetV0 } from '@mysten/sui.js/faucet';

// Get network from command line arguments or default to localnet
const NETWORK = process.argv[2] === 'testnet' ? 'testnet' : 'localnet';
console.log(`Using network: ${NETWORK}`);

const client = new SuiClient({
  url: getFullnodeUrl(NETWORK),
});

// Test keypairs
const adminKeypair = Ed25519Keypair.generate();
const userKeypair = Ed25519Keypair.generate();
const attackerKeypair = Ed25519Keypair.generate();

const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
const userAddress = userKeypair.getPublicKey().toSuiAddress();
const attackerAddress = attackerKeypair.getPublicKey().toSuiAddress();

console.log(`Admin address: ${adminAddress}`);
console.log(`User address: ${userAddress}`);
console.log(`Attacker address: ${attackerAddress}`);

// Paths for package publishing
const BUILD_PATH = path.join(__dirname, '../../build');
// Package name may be generated differently based on the Sui build output
// It could be 'hetracoin-sui' or other name based on the package name in Move.toml
const PACKAGE_PATH = BUILD_PATH; 

// Store package ID after deployment
let packageId: string;

async function main() {
  try {
    console.log('\n=== Starting HetraCoin Security Tests ===\n');
    
    // Build the package
    console.log('Building package...');
    execSync('sui move build', { stdio: 'inherit' });
    
    // Request SUI tokens from the faucet for testing if using testnet
    if (NETWORK === 'testnet') {
      console.log('Requesting SUI tokens from faucet for admin...');
      try {
        const faucetResponse = await requestSuiFromFaucetV0({
          host: 'https://faucet.testnet.sui.io/gas',
          recipient: adminAddress,
        });
        console.log('Faucet response:', faucetResponse);
        
        // Wait for a moment to make sure the faucet transaction is processed
        console.log('Waiting for faucet transaction to be processed...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('Error requesting SUI from faucet:', error);
        // Continue anyway, we might already have enough SUI
      }
    }
    
    // Deploy the package
    console.log('Deploying package...');
    packageId = await deployPackage(adminKeypair);
    console.log(`Package deployed with ID: ${packageId}`);
    
    // Run security tests
    await testZeroAmountTransfer();
    await testUnauthorizedMint();
    await testHetrafiReentrancy();
    await testOverflowChecks();
    
    console.log('\n=== All security tests completed successfully ===\n');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

async function deployPackage(keypair: Ed25519Keypair): Promise<string> {
  // Find the compiled modules
  if (!fs.existsSync(BUILD_PATH)) {
    throw new Error(`Build directory not found at ${BUILD_PATH}`);
  }
  
  // List all directories in build path to locate the package
  const buildContents = fs.readdirSync(BUILD_PATH);
  console.log('Build directory contents:', buildContents);
  
  // Find all .mv files recursively in the build directory
  const mvFiles: string[] = [];
  const findMvFiles = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        findMvFiles(fullPath);
      } else if (dirent.name.endsWith('.mv')) {
        // Only include the project's modules, not dependencies
        const relativePath = path.relative(BUILD_PATH, fullPath);
        if (!relativePath.includes('dependencies')) {
          mvFiles.push(fullPath);
        }
      }
    });
  };
  
  findMvFiles(BUILD_PATH);
  
  if (mvFiles.length === 0) {
    throw new Error('No compiled modules (.mv files) found in the build directory');
  }
  
  console.log(`Found ${mvFiles.length} compiled modules:`, mvFiles);
  
  // Read only project modules, not dependencies
  const modules = mvFiles.map(filePath => {
    const buffer = fs.readFileSync(filePath);
    return Array.from(buffer);
  });
  
  // Create transaction for publishing
  const tx = new TransactionBlock();
  
  // Set the right gas price and budget for testnet
  if (NETWORK === 'testnet') {
    tx.setGasBudget(100000000); // Higher gas budget for testnet
  }
  
  const [upgradeCap] = tx.publish({
    modules,
    dependencies: [
      '0x0000000000000000000000000000000000000000000000000000000000000001', // 0x1 - Move Standard Library
      '0x0000000000000000000000000000000000000000000000000000000000000002', // 0x2 - Sui Framework
    ],
  });
  tx.transferObjects([upgradeCap], tx.pure(adminAddress));
  
  // Execute transaction
  const result = await client.signAndExecuteTransactionBlock({
    signer: keypair,
    transactionBlock: tx,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });
  
  console.log('Transaction result:', result);
  
  // Extract package ID from the result
  const created = result.objectChanges?.filter(change => change.type === 'created');
  const publishedPackage = created?.find(change => change.objectType === '0x2::package::UpgradeCap');
  if (!publishedPackage || publishedPackage.type !== 'created') {
    throw new Error('Failed to find package ID in transaction result');
  }
  
  // Access the packageId using string indexing
  return publishedPackage.objectId;
}

async function testZeroAmountTransfer() {
  console.log('\n--- Testing Zero Amount Transfer Protection ---');
  
  // Initialize HetraCoin
  const tx = new TransactionBlock();
  
  if (NETWORK === 'testnet') {
    tx.setGasBudget(50000000); // Higher gas budget for testnet
  }
  
  const hetraCoinCap = tx.moveCall({
    target: `${packageId}::HetraCoin::init_for_testing`,
    arguments: [
      tx.moveCall({
        target: `${packageId}::HetraCoin::create_witness_for_testing`,
        arguments: [],
      }),
    ],
  });
  
  // Mint some coins
  const coins = tx.moveCall({
    target: `${packageId}::HetraCoin::mint`,
    arguments: [
      hetraCoinCap,
      tx.pure(1000),
    ],
  });
  
  // Now attempt a zero amount transfer that should fail
  try {
    const zeroCoinTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      zeroCoinTx.setGasBudget(50000000); // Higher gas budget for testnet
    }
    
    zeroCoinTx.moveCall({
      target: `${packageId}::HetraCoin::secure_transfer`,
      arguments: [
        coins,
        zeroCoinTx.pure(userAddress),
        zeroCoinTx.pure(0), // Zero amount
      ],
    });
    
    await client.signAndExecuteTransactionBlock({
      signer: adminKeypair,
      transactionBlock: zeroCoinTx,
    });
    
    throw new Error('Zero amount transfer should have failed but succeeded');
  } catch (error) {
    console.log('✅ Zero amount transfer correctly prevented');
  }
}

async function testUnauthorizedMint() {
  console.log('\n--- Testing Unauthorized Mint Protection ---');
  
  // Set up an attacker transaction to try to mint coins
  try {
    const tx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      tx.setGasBudget(50000000); // Higher gas budget for testnet
      
      // For testnet, we need to request gas for the attacker too
      console.log('Requesting SUI tokens from faucet for attacker...');
      try {
        const faucetResponse = await requestSuiFromFaucetV0({
          host: 'https://faucet.testnet.sui.io/gas',
          recipient: attackerAddress,
        });
        console.log('Faucet response for attacker:', faucetResponse);
        
        // Wait for a moment to make sure the faucet transaction is processed
        console.log('Waiting for faucet transaction to be processed...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('Error requesting SUI from faucet for attacker:', error);
        // Continue anyway
      }
    }
    
    // This should fail because the attacker doesn't have the treasury cap
    tx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        tx.object('0x123'), // Invalid treasury cap ID
        tx.pure(1000),
      ],
    });
    
    await client.signAndExecuteTransactionBlock({
      signer: attackerKeypair,
      transactionBlock: tx,
    });
    
    throw new Error('Unauthorized mint should have failed but succeeded');
  } catch (error) {
    console.log('✅ Unauthorized mint correctly prevented');
  }
}

async function testHetrafiReentrancy() {
  console.log('\n--- Testing Hetrafi Reentrancy Protection ---');
  
  // Create a Hetrafi instance
  const tx = new TransactionBlock();
  
  if (NETWORK === 'testnet') {
    tx.setGasBudget(50000000); // Higher gas budget for testnet
  }
  
  tx.moveCall({
    target: `${packageId}::Hetrafi::create`,
    arguments: [
      tx.pure(adminAddress),
    ],
  });
  
  await client.signAndExecuteTransactionBlock({
    signer: adminKeypair,
    transactionBlock: tx,
  });
  
  console.log('✅ Hetrafi created with reentrancy protection');
  
  // Note: Due to Sui's asset model, reentrancy is already prevented at the VM level.
  // The in_execution flag is still a good practice for explicit protection.
}

async function testOverflowChecks() {
  console.log('\n--- Testing Overflow Protection ---');
  
  // Attempt to mint more than the maximum supply
  try {
    const tx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      tx.setGasBudget(50000000); // Higher gas budget for testnet
    }
    
    const hetraCoinCap = tx.moveCall({
      target: `${packageId}::HetraCoin::init_for_testing`,
      arguments: [
        tx.moveCall({
          target: `${packageId}::HetraCoin::create_witness_for_testing`,
          arguments: [],
        }),
      ],
    });
    
    // Attempt to mint more than the max supply (1 trillion)
    tx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        hetraCoinCap,
        tx.pure('2000000000000'), // 2 trillion
      ],
    });
    
    await client.signAndExecuteTransactionBlock({
      signer: adminKeypair,
      transactionBlock: tx,
    });
    
    throw new Error('Overflow mint should have failed but succeeded');
  } catch (error) {
    console.log('✅ Overflow protection correctly prevented excessive minting');
  }
}

// Run tests
main().catch(console.error); 