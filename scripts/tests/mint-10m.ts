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
  const senderAddress = keypair.getPublicKey().toSuiAddress();
  
  console.log("Minting 10 million HETRA tokens");
  console.log("Sender Address:", senderAddress);
  
  // Find TreasuryCap object
  async function findTreasuryCap() {
    console.log("\n=== Finding TreasuryCap ===");
    
    try {
      const objects = await provider.getOwnedObjects({
        owner: senderAddress,
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
      return treasuryCapId;
    } catch (error) {
      console.error("Failed to find TreasuryCap:", error);
      throw error;
    }
  }
  
  // Define recipient address - same as sender for now
  // You can change this to any valid Sui address if needed
  const recipientAddress = senderAddress;
  
  // Mint 10 million tokens
  async function mintTokens() {
    console.log("\n=== Minting 10,000,000 HETRA Tokens ===");
    
    // Find the TreasuryCap
    const treasuryCapId = await findTreasuryCap();
    
    // Create a mint transaction
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
    
    // Transfer minted coins to the recipient
    mintTx.transferObjects(
      [coinObject],
      mintTx.pure(recipientAddress)
    );
    
    console.log(`Minting 10,000,000 HETRA tokens to ${recipientAddress}...`);
    
    try {
      // Execute the transaction
      const result = await provider.signAndExecuteTransactionBlock({
        transactionBlock: mintTx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      console.log("Mint transaction executed successfully!");
      console.log("Transaction digest:", result.digest);
      console.log("Status:", result.effects?.status?.status);
      
      return result.digest;
    } catch (error) {
      console.error("Failed to execute mint transaction:", error);
      return null;
    }
  }
  
  // Check balance
  async function checkBalance() {
    console.log("\n=== Checking Balance ===");
    console.log("Checking for coins of type:", coinType);
    
    try {
      // Get all coins of the HetraCoin type
      const coins = await provider.getCoins({
        owner: senderAddress,
        coinType: coinType,
      });
      
      // Calculate total balance
      let totalBalance = 0n;
      for (const coin of coins.data) {
        totalBalance += BigInt(coin.balance);
      }
      
      console.log(`Found ${coins.data.length} coin objects`);
      console.log(`Total balance: ${Number(totalBalance) / 1e9} HETRA`);
      
      // Display individual coins
      console.log("\nCoin objects:");
      coins.data.forEach((coin, i) => {
        console.log(`${i+1}. Coin ID: ${coin.coinObjectId}, Balance: ${Number(coin.balance) / 1e9} HETRA`);
      });
      
      return coins.data;
    } catch (error) {
      console.error("Failed to check balance:", error);
      return [];
    }
  }
  
  // Transfer tokens to a recipient
  async function transferTokens(recipientAddress: string, amount: number) {
    console.log(`\n=== Transferring ${amount} HETRA Tokens ===`);
    
    try {
      // Get all coins
      const coins = await provider.getCoins({
        owner: senderAddress,
        coinType: coinType,
      });
      
      if (coins.data.length === 0) {
        console.error("No coins available for transfer");
        return null;
      }
      
      // Find a coin with sufficient balance
      let coinToUse = null;
      for (const coin of coins.data) {
        if (BigInt(coin.balance) >= BigInt(amount * 1e9)) {
          coinToUse = coin.coinObjectId;
          break;
        }
      }
      
      if (!coinToUse) {
        console.error("No single coin with sufficient balance found");
        return null;
      }
      
      console.log(`Using coin: ${coinToUse} for transfer`);
      
      // Create a transaction for transfer
      const transferTx = new TransactionBlock();
      const amountToTransfer = BigInt(Math.floor(amount * 1e9));
      
      // Split the coin and transfer a portion
      const [coin] = transferTx.splitCoins(
        transferTx.object(coinToUse),
        [transferTx.pure(amountToTransfer)]
      );
      
      // Transfer the split coin
      transferTx.transferObjects([coin], transferTx.pure(recipientAddress));
      
      // Execute the transaction
      const result = await provider.signAndExecuteTransactionBlock({
        transactionBlock: transferTx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      console.log("Transfer transaction executed successfully!");
      console.log("Transaction digest:", result.digest);
      console.log("Status:", result.effects?.status?.status);
      
      return result.digest;
    } catch (error) {
      console.error("Failed to execute transfer transaction:", error);
      return null;
    }
  }
  
  // Run the mint and transfer operations
  async function run() {
    // Check initial balance
    console.log("Initial state:");
    await checkBalance();
    
    // Mint 10 million tokens
    await mintTokens();
    
    // Check balance after minting
    console.log("\nBalance after minting:");
    const coins = await checkBalance();
    
    // Ask for transfer recipient and amount
    console.log("\nPlease enter the recipient address when ready to transfer tokens.");
    console.log("For now, we will transfer 1 million tokens back to ourselves as a test.");
    
    // Example transfer - 1 million tokens to the same address
    // In a real application, you would get this from user input
    const transferAmount = 1_000_000; // 1 million tokens
    
    if (coins.length > 0) {
      // Transfer to self as a test
      await transferTokens(recipientAddress, transferAmount);
      
      // Check balance after transfer
      console.log("\nBalance after transfer:");
      await checkBalance();
    }
    
    console.log("\nOperation completed!");
  }
  
  // Run everything
  await run();
}

main().catch(console.error); 