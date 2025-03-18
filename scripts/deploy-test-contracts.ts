/**
 * HetraCoin Test Contract Deployer
 * 
 * This script deploys all necessary contracts for testing:
 * - Staking Pool
 * - Governance System
 * - Marketplace
 */
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

// Get the network from command line arguments
const network = process.argv[2] as 'testnet' | 'mainnet';
if (!network || (network !== 'testnet' && network !== 'mainnet')) {
  console.error('Please specify network: testnet or mainnet');
  process.exit(1);
}

async function deployTestContracts() {
  console.log(`🚀 Deploying test contracts on ${network}...`);
  
  // Initialize client
  const rpcUrl = network === 'testnet' 
    ? 'https://fullnode.testnet.sui.io:443' 
    : 'https://fullnode.mainnet.sui.io:443';
  
  const client = new SuiClient({ url: rpcUrl });
  
  // Create keypair from the private key
  const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
  let privateKeyArray = fromB64(privateKeyString);
  
  if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
    privateKeyArray = privateKeyArray.slice(1);
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  console.log('Wallet address:', walletAddress);
  
  // Load deployment info
  console.log('Loading deployment info...');
  const deploymentPath = path.join(__dirname, `../deployment-${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log('Package ID:', packageId);
  
  // Try to get the actual package ID from the initialization file
  let initPackageId = packageId;
  try {
    const initPath = path.join(__dirname, `../initialization-${network}.json`);
    if (fs.existsSync(initPath)) {
      const initInfo = JSON.parse(fs.readFileSync(initPath, 'utf8'));
      if (initInfo.packageId) {
        console.log(`Found package ID in initialization file: ${initInfo.packageId}`);
        initPackageId = initInfo.packageId;
      }
    }
  } catch (error) {
    console.log('Error reading initialization file');
  }
  
  // Use the correct package ID for all operations
  const activePackageId = initPackageId || packageId;
  console.log(`Using package ID for tests: ${activePackageId}`);
  
  // Find TreasuryCap to get coin package ID
  const treasuryCapResult = await client.getOwnedObjects({
    owner: walletAddress,
    filter: {
      StructType: '0x2::coin::TreasuryCap'
    },
    options: { showContent: true, showType: true }
  });
  
  const treasuryCapObjects = treasuryCapResult.data.filter(obj => 
    obj.data?.type && obj.data.type.includes('HetraCoin::HETRACOIN')
  );
  
  if (treasuryCapObjects.length === 0) {
    console.error('No HetraCoin TreasuryCap found. Cannot proceed with tests.');
    process.exit(1);
  }
  
  const treasuryCap = treasuryCapObjects[0].data;
  console.log(`Found TreasuryCap: ${treasuryCap?.objectId}`);
  
  // Extract coin package ID from TreasuryCap type
  let coinPackageId = '';
  if (treasuryCap?.type) {
    const match = treasuryCap.type.match(/<(0x[a-fA-F0-9]+)::HetraCoin::HETRACOIN>/);
    if (match && match[1]) {
      coinPackageId = match[1];
      console.log(`Extracted coin package ID: ${coinPackageId}`);
    }
  }
  
  // Deploy Staking Pool
  console.log('\n📦 Deploying Staking Pool...');
  try {
    // Get HetraCoin for staking pool creation
    const hetraCoins = await client.getCoins({
      owner: walletAddress,
      coinType: `${coinPackageId}::HetraCoin::HETRACOIN`
    });
    
    if (hetraCoins.data.length === 0) {
      console.error('No HETRACOIN found for staking pool creation.');
      process.exit(1);
    }
    
    // Create a staking pool
    const tx = new TransactionBlock();
    
    // Create staking pool with 100 tokens as initial reward
    const [coin] = tx.splitCoins(tx.object(hetraCoins.data[0].coinObjectId), [tx.pure(100)]);
    
    // Create the staking pool
    tx.moveCall({
      target: `${activePackageId}::Staking::create_pool`,
      arguments: [coin],
    });
    
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true }
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Staking Pool created successfully!');
      
      // Extract the staking pool ID from events
      const events = result.events || [];
      for (const event of events) {
        if (event.type.includes('::Staking::')) {
          console.log(`Event: ${event.type}`);
          console.log(`Data: ${JSON.stringify(event.parsedJson)}`);
        }
      }
    } else {
      console.error('❌ Failed to create Staking Pool');
      console.error(`Error: ${result.effects?.status?.error}`);
    }
  } catch (error: any) {
    console.error(`Error creating Staking Pool: ${error.message}`);
  }
  
  // Deploy Governance System
  console.log('\n📦 Deploying Governance System...');
  try {
    const tx = new TransactionBlock();
    
    // Create the governance system
    tx.moveCall({
      target: `${activePackageId}::Governance::create_system`,
      arguments: [
        tx.pure(coinPackageId),
        tx.pure(10000),
        tx.pure(51),
        tx.pure(30),
      ],
    });
    
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true }
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Governance System created successfully!');
      
      // Extract the governance system ID from events
      const events = result.events || [];
      for (const event of events) {
        if (event.type.includes('::Governance::')) {
          console.log(`Event: ${event.type}`);
          console.log(`Data: ${JSON.stringify(event.parsedJson)}`);
        }
      }
    } else {
      console.error('❌ Failed to create Governance System');
      console.error(`Error: ${result.effects?.status?.error}`);
    }
  } catch (error: any) {
    console.error(`Error creating Governance System: ${error.message}`);
  }
  
  // Deploy Marketplace
  console.log('\n📦 Deploying Marketplace...');
  try {
    const tx = new TransactionBlock();
    
    // Create the marketplace
    tx.moveCall({
      target: `${activePackageId}::Hetrafi::create`,
      arguments: [
        tx.pure(coinPackageId),
        tx.pure(2),
      ],
    });
    
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: { showEffects: true, showEvents: true }
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Marketplace created successfully!');
      
      // Extract the marketplace ID from events
      const events = result.events || [];
      for (const event of events) {
        if (event.type.includes('::Hetrafi::')) {
          console.log(`Event: ${event.type}`);
          console.log(`Data: ${JSON.stringify(event.parsedJson)}`);
        }
      }
    } else {
      console.error('❌ Failed to create Marketplace');
      console.error(`Error: ${result.effects?.status?.error}`);
    }
  } catch (error: any) {
    console.error(`Error creating Marketplace: ${error.message}`);
  }
  
  console.log('\n✅ All test contracts deployed successfully!');
}

deployTestContracts().catch(error => {
  console.error('Error deploying test contracts:', error);
  process.exit(1);
}); 