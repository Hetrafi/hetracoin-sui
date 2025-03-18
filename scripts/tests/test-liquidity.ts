import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function testLiquidity() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Create keypair
  const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
  let privateKeyArray = fromB64(privateKeyString);
  
  if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
    privateKeyArray = privateKeyArray.slice(1);
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  
  // Load deployment info
  const deploymentInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '../../deployment-testnet.json'), 'utf8'));
  const packageId = deploymentInfo.packageId;
  
  console.log('Testing LiquidityPool module...');
  console.log('Package ID:', packageId);
  console.log('Wallet address:', walletAddress);
  
  // Create a liquidity pool
  const tx = new TransactionBlock();
  
  // Try with a coin type parameter
  tx.moveCall({
    target: `${packageId}::LiquidityPool::create_pool`,
    typeArguments: [`${packageId}::HetraCoin::HETRACOIN`],
    arguments: [],
  });
  
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    console.log('Transaction successful!');
    console.log('Digest:', result.digest);
    console.log('Effects:', JSON.stringify(result.effects, null, 2));
    
    if (result.objectChanges) {
      console.log('Created objects:');
      for (const change of result.objectChanges) {
        if (change.type === 'created') {
          console.log(`- ${change.objectId} (${change.objectType})`);
        }
      }
    }
  } catch (error) {
    console.error('Transaction failed:', error);
  }
}

testLiquidity().catch(console.error); 