import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

// Configuration
const CONFIG = {
  testnet: {
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
  },
  mainnet: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
  }
};

// Ensure environment variables are defined
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY not set in environment variables');
}

async function testDeployment(network: 'testnet' | 'mainnet') {
  console.log(`Testing HetraCoin deployment on ${network}...`);
  
  // Initialize client
  const rpcUrl = network === 'testnet' 
    ? 'https://fullnode.testnet.sui.io:443' 
    : 'https://fullnode.mainnet.sui.io:443';
  
  const client = new SuiClient({ url: rpcUrl });
  
  // Create keypair from the private key
  let keypair;
  try {
    // Ensure DEPLOYER_PRIVATE_KEY is defined (we already checked above)
    const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
    
    // Decode from Base64
    let privateKeyArray = fromB64(privateKeyString);
    
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
  
  // Get the wallet address
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  console.log('Wallet address:', walletAddress);
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, `../../deployment-${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log('Package ID:', deploymentInfo.packageId);
  
  // Get objects owned by the wallet
  const objects = await client.getOwnedObjects({
    owner: walletAddress,
    options: { showContent: true, showType: true }
  });
  
  // Find the TreasuryCap
  let treasuryCapId = '';
  let treasuryCapType = '';
  for (const objRef of objects.data || []) {
    const obj = objRef.data;
    if (obj && obj.type && obj.type.includes('TreasuryCap')) {
      treasuryCapId = obj.objectId;
      treasuryCapType = obj.type;
      console.log('Found TreasuryCap:', treasuryCapId);
      console.log('TreasuryCap Type:', treasuryCapType);
      break;
    }
  }
  
  if (!treasuryCapId) {
    console.log('TreasuryCap not found in wallet');
  }
  
  // Extract module name from TreasuryCap type
  let coinModule = '';
  if (treasuryCapType) {
    // Format is usually like "0x2::coin::TreasuryCap<0xPACKAGE::MODULE::COIN>"
    const match = treasuryCapType.match(/<(.+?)>/);
    if (match && match[1]) {
      const parts = match[1].split('::');
      if (parts.length >= 2) {
        coinModule = parts[1];
        console.log('Extracted coin module name:', coinModule);
      }
    }
  }
  
  // Try to get package info
  console.log('Getting package info...');
  try {
    const packageObj = await client.getObject({
      id: deploymentInfo.packageId,
      options: { showContent: true }
    });
    
    console.log('Package object:', packageObj);
  } catch (error: any) {
    console.log('Error getting package:', error && error.message ? error.message : error);
  }
  
  // Extract the correct package ID from the TreasuryCap type
  let correctPackageId = '';
  if (treasuryCapType) {
    const match = treasuryCapType.match(/<(.+?)>/);
    if (match && match[1]) {
      const parts = match[1].split('::');
      if (parts.length >= 1) {
        correctPackageId = parts[0];
        console.log('Extracted package ID from TreasuryCap:', correctPackageId);
      }
    }
  }
  
  // Use the correct package ID for minting
  if (correctPackageId) {
    console.log(`Trying to mint with correct package ID: ${correctPackageId}`);
    try {
      const tx = new TransactionBlock();
      
      const [coin] = tx.moveCall({
        target: `${correctPackageId}::HetraCoin::mint`,
        arguments: [
          tx.object(treasuryCapId),
          tx.pure(1000),
          // No need for ctx parameter
        ],
      });
      
      tx.transferObjects([coin], tx.pure(walletAddress));
      
      const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });
      
      console.log('Minting successful with correct package ID!');
      console.log('Transaction digest:', result.digest);
    } catch (error: any) {
      console.error('Minting with correct package ID failed:', error && error.message ? error.message : error);
    }
  }
  
  console.log('Deployment test completed!');
}

// Run the test
const network = process.argv[2] as 'testnet' | 'mainnet';
if (!network || (network !== 'testnet' && network !== 'mainnet')) {
  console.error('Please specify network: testnet or mainnet');
  process.exit(1);
}

testDeployment(network).catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 
