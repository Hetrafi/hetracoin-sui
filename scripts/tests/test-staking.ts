import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function testStaking() {
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
  
  console.log('Testing Staking module...');
  console.log('Package ID:', packageId);
  console.log('Wallet address:', walletAddress);
  
  // Find a HetraCoin object to stake
  let hetraCoinId = '';
  const allCoins = await client.getOwnedObjects({
    owner: walletAddress,
    options: { showContent: true, showType: true }
  });

  const coins = {
    data: allCoins.data.filter(obj => 
      obj.data?.type && obj.data.type.includes('HETRACOIN')
    )
  };

  if (coins.data && coins.data.length > 0 && coins.data[0].data) {
    hetraCoinId = coins.data[0].data.objectId;
    console.log(`Found HetraCoin to stake: ${hetraCoinId}`);
  } else {
    throw new Error('No HetraCoin found to stake');
  }
  
  // Create a staking pool
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${packageId}::Staking::create_staking_pool`,
    arguments: [
      tx.pure(10), // reward_rate
      tx.pure(86400), // lock_period (1 day)
    ],
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

    // After creating the staking pool and getting the result
    let stakingPoolId = '';
    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (change.type === 'created' && change.objectType.includes('StakingPool')) {
          stakingPoolId = change.objectId;
          console.log(`Created staking pool: ${stakingPoolId}`);
          break;
        }
      }
    }

    if (!stakingPoolId) {
      throw new Error('Failed to create staking pool');
    }

    // Then use stakingPoolId in your stake function call
    // Update the stake function call
    const stakeTx = new TransactionBlock();

    // Split the coin to stake a small amount
    const [splitCoin] = stakeTx.splitCoins(stakeTx.object(hetraCoinId), [stakeTx.pure(100)]);

    // Call the stake function with the correct arguments
    stakeTx.moveCall({
      target: `${packageId}::Staking::stake`,
      arguments: [
        stakeTx.object(stakingPoolId), // The staking pool
        splitCoin,                     // The coin to stake
      ],
    });
  } catch (error) {
    console.error('Transaction failed:', error);
  }
}

testStaking().catch(console.error); 