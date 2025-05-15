/**
 * HetraCoin Simple Mint Test
 * 
 * This script mints HETRA tokens using the standard coin::mint function
 * (without the shared objects).
 * 
 * Usage:
 *   npx ts-node scripts/tests/simple-mint.ts <amount>
 */
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function simpleMint() {
  console.log("HETRACOIN SIMPLE MINT TEST");
  console.log("-------------------------");
  
  // Parse arguments
  const args = process.argv.slice(2);
  const amountArg = args[0] || "1000000000"; // Default to 1 HETRA (1 billion base units with 9 decimals)
  const amount = BigInt(amountArg);
  
  console.log(`Minting ${Number(amount) / 1e9} HETRA tokens...`);
  
  // Check for required environment variables
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Error: DEPLOYER_PRIVATE_KEY not set in environment variables");
    process.exit(1);
  }
  
  // Initialize SUI client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Create keypair from private key
  let keypair;
  try {
    const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKeyString) throw new Error("Private key is undefined");
    
    let privateKeyArray = fromB64(privateKeyString);
    
    if (privateKeyArray.length !== 32) {
      if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
        privateKeyArray = privateKeyArray.slice(1);
      } else if (privateKeyArray.length === 44) {
        privateKeyArray = privateKeyArray.slice(0, 32);
      } else {
        throw new Error(`Unexpected private key length: ${privateKeyArray.length}`);
      }
    }
    
    keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
  } catch (error) {
    console.error(`Error creating keypair: ${error}`);
    process.exit(1);
  }
  
  // Get the wallet address
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`Using wallet address: ${walletAddress}`);
  
  // Load package ID from deployment info
  const deploymentPath = path.join(__dirname, '../../deployment-phase1-testnet.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    process.exit(1);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log(`Using package ID: ${packageId}`);
  
  // Find TreasuryCap
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;
  
  console.log("Finding TreasuryCap...");
  const treasuryObjects = await client.getOwnedObjects({
    owner: walletAddress,
    filter: { StructType: `0x2::coin::TreasuryCap<${coinType}>` },
    options: { showContent: true }
  });
  
  if (!treasuryObjects.data || treasuryObjects.data.length === 0) {
    console.error("TreasuryCap not found in wallet");
    process.exit(1);
  }
  
  const treasuryCapId = treasuryObjects.data[0].data?.objectId;
  if (!treasuryCapId) {
    console.error("Could not extract TreasuryCap ID");
    process.exit(1);
  }
  
  console.log(`Using TreasuryCap: ${treasuryCapId}`);
  
  // Create transaction for minting
  const tx = new TransactionBlock();
  
  // Call the standard coin::mint function
  const coinObject = tx.moveCall({
    target: `0x2::coin::mint`,
    typeArguments: [coinType],
    arguments: [
      tx.object(treasuryCapId),
      tx.pure(amount)
    ],
  });
  
  // Transfer the minted coins to the wallet
  tx.transferObjects([coinObject], tx.pure(walletAddress));
  
  // Execute the transaction
  console.log("Executing mint transaction...");
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    if (result.effects?.status?.status === 'success') {
      console.log(`✅ Successfully minted ${Number(amount) / 1e9} HETRA tokens!`);
      console.log(`Transaction digest: ${result.digest}`);
      
      // Check the balance after minting
      console.log("\nChecking updated balance...");
      const coins = await client.getCoins({
        owner: walletAddress,
        coinType: coinType,
      });
      
      if (coins.data && coins.data.length > 0) {
        let totalBalance = 0n;
        for (const coin of coins.data) {
          totalBalance += BigInt(coin.balance);
        }
        
        console.log(`Total balance: ${Number(totalBalance) / 1e9} HETRA across ${coins.data.length} coin objects`);
      }
    } else {
      console.error(`Transaction failed: ${result.effects?.status?.error}`);
    }
  } catch (error) {
    console.error(`Error executing transaction: ${error}`);
  }
}

// Run if called directly
if (require.main === module) {
  simpleMint().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { simpleMint }; 