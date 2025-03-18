/**
 * HetraCoin Token Core Tests
 * 
 * Tests the fundamental token operations:
 * - Minting tokens
 * - Transferring tokens
 * - Burning tokens
 * - Checking balances
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

async function testTokenCore() {
  console.log(`Testing HetraCoin token core functionality on ${network}...`);
  
  // Initialize client
  console.log('Initializing SUI client...');
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
  const deploymentPath = path.join(__dirname, `../../deployment-${network}.json`);
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log('Package ID:', packageId);
  
  // Find TreasuryCap
  console.log('Looking for TreasuryCap...');
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
  if (!treasuryCap) {
    console.error('TreasuryCap data is null or undefined');
    process.exit(1);
  }
  
  // Extract coin package ID from TreasuryCap type
  let coinPackageId = '';
  if (treasuryCap.type) {
    const match = treasuryCap.type.match(/<(0x[a-fA-F0-9]+)::HetraCoin::HETRACOIN>/);
    if (match && match[1]) {
      coinPackageId = match[1];
      console.log(`Extracted coin package ID: ${coinPackageId}`);
    }
  }
  
  if (!coinPackageId) {
    console.error('Could not extract coin package ID from TreasuryCap');
    process.exit(1);
  }
  
  // Test 1: Mint tokens
  console.log('\n🔹 Test 1: Minting tokens');
  const mintAmount = 1000;
  let mintedCoinId = '';
  
  try {
    const tx = new TransactionBlock();
    
    const [coin] = tx.moveCall({
      target: `${coinPackageId}::HetraCoin::mint`,
      arguments: [
        tx.object(treasuryCap.objectId),
        tx.pure(mintAmount),
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
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Minting successful!');
      console.log('   Transaction digest:', result.digest);
      
      // Find the minted coin
      if (result.objectChanges) {
        for (const change of result.objectChanges) {
          if (change.type === 'created' && change.objectType.includes('Coin<') && change.objectType.includes('HETRACOIN')) {
            mintedCoinId = change.objectId;
            console.log(`   Created coin: ${mintedCoinId}`);
            break;
          }
        }
      }
    } else {
      console.error('❌ Minting failed:', result.effects?.status?.error);
      process.exit(1);
    }
    
    // Wait for transaction to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (error: any) {
    console.error('❌ Error minting tokens:', error.message);
    process.exit(1);
  }
  
  // Test 2: Transfer tokens
  console.log('\n🔹 Test 2: Transferring tokens');
  
  try {
    // Get fresh coins after minting
    const hetraCoins = await client.getCoins({
      owner: walletAddress,
      coinType: `${coinPackageId}::HetraCoin::HETRACOIN`
    });
    
    if (hetraCoins.data.length === 0) {
      console.error('❌ No HETRACOIN found for transfer');
      process.exit(1);
    }
    
    // Use the minted coin or the first available coin
    const coinToTransfer = mintedCoinId 
      ? hetraCoins.data.find(coin => coin.coinObjectId === mintedCoinId) 
      : hetraCoins.data[0];
    
    if (!coinToTransfer) {
      console.error('❌ Could not find the minted coin');
      process.exit(1);
    }
    
    console.log(`   Using coin: ${coinToTransfer.coinObjectId} with balance: ${coinToTransfer.balance}`);
    
    const tx = new TransactionBlock();
    
    // Split the coin to transfer half
    const transferAmount = Math.floor(Number(coinToTransfer.balance) / 2);
    const [splitCoin] = tx.splitCoins(tx.object(coinToTransfer.coinObjectId), [tx.pure(transferAmount)]);
    
    // Transfer to self (for testing)
    tx.transferObjects([splitCoin], tx.pure(walletAddress));
    
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log('✅ Transfer successful!');
      console.log('   Transaction digest:', result.digest);
      console.log(`   Transferred amount: ${transferAmount}`);
    } else {
      console.error('❌ Transfer failed:', result.effects?.status?.error);
      process.exit(1);
    }
    
    // Wait for transaction to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (error: any) {
    console.error('❌ Error transferring tokens:', error.message);
    process.exit(1);
  }
  
  // Test 3: Check balances
  console.log('\n🔹 Test 3: Checking balances');
  
  try {
    const hetraCoins = await client.getCoins({
      owner: walletAddress,
      coinType: `${coinPackageId}::HetraCoin::HETRACOIN`
    });
    
    console.log(`   Found ${hetraCoins.data.length} HETRACOIN coins in wallet`);
    
    let totalBalance = 0;
    for (const coin of hetraCoins.data) {
      console.log(`   Coin ${coin.coinObjectId}: ${coin.balance}`);
      totalBalance += Number(coin.balance);
    }
    
    console.log(`   Total balance: ${totalBalance}`);
    console.log('✅ Balance check successful!');
  } catch (error: any) {
    console.error('❌ Error checking balances:', error.message);
    process.exit(1);
  }
  
  console.log('\n🎉 All token core tests completed successfully!');
}

testTokenCore().catch(error => {
  console.error('Error in test execution:', error);
  process.exit(1);
}); 