import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function testLiquidityPoolFixed() {
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
  
  // Find HETRACOIN and SUI coins
  console.log('Finding HETRACOIN and SUI coins...');
  
  // Get all objects owned by the wallet
  const allCoins = await client.getOwnedObjects({
    owner: walletAddress,
    options: { showContent: true, showType: true }
  });
  
  // Find HETRACOIN
  let hetraCoinId = '';
  const hetraCoins = allCoins.data.filter(obj => 
    obj.data?.type && obj.data.type.includes('HETRACOIN')
  );
  
  if (hetraCoins.length > 0 && hetraCoins[0].data) {
    hetraCoinId = hetraCoins[0].data.objectId;
    console.log(`Found HETRACOIN: ${hetraCoinId}`);
  } else {
    console.error('No HETRACOIN found');
    return;
  }
  
  // Find SUI
  let suiCoinId = '';
  const suiCoins = allCoins.data.filter(obj => 
    obj.data?.type && obj.data.type.includes('0x2::coin::Coin<0x2::sui::SUI>')
  );
  
  if (suiCoins.length > 0 && suiCoins[0].data) {
    suiCoinId = suiCoins[0].data.objectId;
    console.log(`Found SUI: ${suiCoinId}`);
  } else {
    console.error('No SUI found');
    return;
  }
  
  // Create a liquidity pool
  console.log('Creating liquidity pool...');
  const tx = new TransactionBlock();
  
  // Split coins to use small amounts
  const [splitHetraCoin] = tx.splitCoins(tx.object(hetraCoinId), [tx.pure(1000000)]);
  const [splitSuiCoin] = tx.splitCoins(tx.object(suiCoinId), [tx.pure(1000000)]);
  
  // Call create_pool with the correct arguments
  tx.moveCall({
    target: `${packageId}::LiquidityPool::create_pool`,
    arguments: [
      splitHetraCoin,  // initial_token: Coin<HETRACOIN>
      splitSuiCoin,    // initial_sui: Coin<SUI>
      tx.pure(300),    // lp_fee: u64 (3% fee)
    ],
  });
  
  try {
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    console.log('Transaction result:', result.effects?.status);
    console.log('Transaction digest:', result.digest);
    
    if (result.effects?.status?.status === 'success') {
      console.log('Liquidity pool created successfully!');
      
      // Extract the created pool ID
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          if (change.type === 'created' && change.objectType.includes('LiquidityPool')) {
            console.log(`Created liquidity pool: ${change.objectId}`);
            break;
          }
        }
      }
    } else {
      console.error('Failed to create liquidity pool:', result.effects?.status?.error);
    }
  } catch (error) {
    console.error('Error creating liquidity pool:', error);
  }
}

testLiquidityPoolFixed().catch(console.error); 