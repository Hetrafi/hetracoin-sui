import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Configuration - hardcoded from our deployment
  const packageId = '0xfcb754547b27b74a5d8ae184372dd2ed32226491c7f19cc69329e672772ba05e';
  const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY || '5n7DJoMI7j/h4+0KB6ApWG6qe6b2EyzcabAxOmskagE=';
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;

  // Setup provider and keypair
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  
  console.log("=== HETRACOIN 10M MINTING SCRIPT ===");
  console.log("Wallet Address:", walletAddress);
  console.log("Package ID:", packageId);
  
  // Find TreasuryCap object
  console.log("\nFinding TreasuryCap...");
  try {
    const objects = await provider.getOwnedObjects({
      owner: walletAddress,
      filter: {
        StructType: `0x2::coin::TreasuryCap<${coinType}>`
      },
      options: {
        showContent: true,
        showType: true,
      }
    });
    
    if (objects.data.length === 0) {
      throw new Error("TreasuryCap not found");
    }
    
    const treasuryCapId = objects.data[0].data?.objectId;
    if (!treasuryCapId) {
      throw new Error("TreasuryCap ID is undefined");
    }
    
    console.log("Found TreasuryCap ID:", treasuryCapId);
    
    // Create mint transaction
    console.log("\nCreating mint transaction...");
    const mintTx = new TransactionBlock();
    
    // 10,000,000 tokens with 9 decimals = 10,000,000,000,000,000
    const amount = 10_000_000_000_000_000n; 
    
    // Call the mint function from the Sui coin module with proper type arguments
    const coinObject = mintTx.moveCall({
      target: `0x2::coin::mint`,
      typeArguments: [coinType],
      arguments: [
        mintTx.object(treasuryCapId),
        mintTx.pure(amount)
      ],
    });
    
    // Transfer minted coins to the wallet
    mintTx.transferObjects(
      [coinObject],
      mintTx.pure(walletAddress)
    );
    
    console.log(`Minting 10,000,000 HETRA tokens to ${walletAddress}...`);
    
    // Execute the transaction
    const result = await provider.signAndExecuteTransactionBlock({
      transactionBlock: mintTx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    
    console.log("\n=== MINT TRANSACTION EXECUTED ===");
    console.log("Transaction digest:", result.digest);
    console.log("Status:", result.effects?.status?.status || "unknown");
    
    // Print the newly created coin object ID if available
    if (result.objectChanges) {
      const createdObjects = result.objectChanges.filter(
        (change: any) => change.type === 'created' && 
                change.objectType?.includes(`Coin<${coinType}>`)
      );
      
      if (createdObjects.length > 0) {
        console.log("\nNewly created coin objects:");
        createdObjects.forEach((obj: any, i) => {
          console.log(`${i+1}. Object ID: ${obj.objectId}`);
        });
      }
    }
    
    console.log("\n=== MINTING COMPLETED SUCCESSFULLY ===");
    console.log("Minted 10,000,000 HETRA tokens to your wallet");
    console.log("You can view these tokens in your Sui wallet");
    
  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error("Failed to mint tokens:", error);
  }
}

// Run the script
main().catch(console.error); 