import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function testLiquidityPool() {
  // Initialize client
  console.log('Initializing SUI client...');
  const rpcUrl = 'https://fullnode.testnet.sui.io:443';
  const client = new SuiClient({ url: rpcUrl });
  
  // Create keypair from the private key
  console.log('Creating keypair from private key...');
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
  const deploymentPath = path.join(__dirname, '../../deployment-testnet.json');
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log('Package ID:', packageId);
  
  // Extract the package ID from TreasuryCap
  let coinPackageId = '';
  try {
    // Get all objects owned by the wallet
    const objects = await client.getOwnedObjects({
      owner: walletAddress,
      options: { showType: true }
    });
    
    // Look for TreasuryCap
    for (const objRef of objects.data || []) {
      const obj = objRef.data;
      if (obj && obj.type && obj.type.includes('TreasuryCap')) {
        const match = obj.type.match(/<(0x[a-fA-F0-9]+)::HetraCoin::HETRACOIN>/);
        if (match && match[1]) {
          coinPackageId = match[1];
          console.log(`Using package ID from TreasuryCap: ${coinPackageId}`);
          break;
        }
      }
    }
  } catch (error) {
    console.log('Error extracting package ID from TreasuryCap, using original package ID');
  }
  
  // Use the extracted package ID if available, otherwise use the original
  const actualPackageId = coinPackageId || packageId;
  
  console.log('\n🧪 Testing LiquidityPool with different approaches:');
  
  // Approach 1: No type arguments
  try {
    console.log('\nApproach 1: No type arguments');
    const tx1 = new TransactionBlock();
    tx1.moveCall({
      target: `${actualPackageId}::LiquidityPool::create_pool`,
      arguments: [],
    });
    
    const result1 = await client.dryRunTransactionBlock({
      transactionBlock: tx1.serialize(),
    });
    
    // Then check effects separately
    console.log('Dry run result:', result1.effects?.status);
  } catch (error: any) {
    console.log('Error with Approach 1:', error.message);
  }
  
  // Approach 2: With SUI as type argument
  try {
    console.log('\nApproach 2: With SUI as type argument');
    const tx2 = new TransactionBlock();
    tx2.moveCall({
      target: `${actualPackageId}::LiquidityPool::create_pool`,
      typeArguments: ["0x2::sui::SUI"],
      arguments: [],
    });
    
    const result2 = await client.dryRunTransactionBlock({
      transactionBlock: tx2.serialize(),
    });
    
    // Then check effects separately
    console.log('Dry run result:', result2.effects?.status);
  } catch (error: any) {
    console.log('Error with Approach 2:', error.message);
  }
  
  // Approach 3: With HetraCoin as type argument
  try {
    console.log('\nApproach 3: With HetraCoin as type argument');
    const tx3 = new TransactionBlock();
    tx3.moveCall({
      target: `${actualPackageId}::LiquidityPool::create_pool`,
      typeArguments: [`${coinPackageId}::HetraCoin::HETRACOIN`],
      arguments: [],
    });
    
    const result3 = await client.dryRunTransactionBlock({
      transactionBlock: tx3.serialize(),
    });
    
    // Then check effects separately
    console.log('Dry run result:', result3.effects?.status);
  } catch (error: any) {
    console.log('Error with Approach 3:', error.message);
  }
  
  // Approach 4: With both SUI and HetraCoin as type arguments
  try {
    console.log('\nApproach 4: With both SUI and HetraCoin as type arguments');
    const tx4 = new TransactionBlock();
    tx4.moveCall({
      target: `${actualPackageId}::LiquidityPool::create_pool`,
      typeArguments: [
        "0x2::sui::SUI",
        `${coinPackageId}::HetraCoin::HETRACOIN`
      ],
      arguments: [],
    });
    
    const result4 = await client.dryRunTransactionBlock({
      transactionBlock: tx4.serialize(),
    });
    
    // Then check effects separately
    console.log('Dry run result:', result4.effects?.status);
  } catch (error: any) {
    console.log('Error with Approach 4:', error.message);
  }
  
  console.log('\n🔍 If all approaches failed, the issue might be with the LiquidityPool module implementation.');
  console.log('Check the module code for any issues with the create_pool function.');
}

testLiquidityPool().catch(error => {
  console.error('Error:', error);
}); 