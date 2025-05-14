import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Configuration - hardcoded from our deployment
  const packageId = '0x8667452485be796d6cb4ad2fce0d8e19734c1eb2a673b483186c7dc1b4062369';
  const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY || '5n7DJoMI7j/h4+0KB6ApWG6qe6b2EyzcabAxOmskagE=';
  const treasuryCapId = '0x11af992dc6fc1cdfde2443496d544a926327fd6d33ad5504abbb0d4e807d66c4';
  const adminCapId = '0xe083089ce2434809064d488b90cc4f81911d6e327416f0fcf9dfba7d7a3aaa0c';
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;

  // Setup provider and keypair
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  const senderAddress = keypair.getPublicKey().toSuiAddress();
  
  console.log("Testing HetraCoin operations");
  console.log("Package ID:", packageId);
  console.log("Sender Address:", senderAddress);
  console.log("TreasuryCap ID:", treasuryCapId);
  console.log("AdminCap ID:", adminCapId);
  console.log("Coin Type:", coinType);
  
  // Define test recipient address (same as sender for testing)
  const recipientAddress = senderAddress;
  
  // Test 1: Mint tokens
  async function testMint() {
    console.log("\n=== Test 1: Minting Tokens ===");
    
    // Create a mint transaction
    const mintTx = new TransactionBlock();
    const amount = 1000000000; // 1000 tokens with 9 decimals
    
    // Call the mint function from the coin module with proper type arguments
    const coinObject = mintTx.moveCall({
      target: `0x2::coin::mint`,
      typeArguments: [coinType],
      arguments: [
        mintTx.object(treasuryCapId),
        mintTx.pure(amount)
      ],
    });
    
    // Transfer minted coins to the recipient (ourselves for testing)
    mintTx.transferObjects(
      [coinObject],
      mintTx.pure(recipientAddress)
    );
    
    console.log(`Minting ${amount / 1e9} HETRA tokens to ${recipientAddress}...`);
    
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
      
      // Check for events
      if (result.events && result.events.length > 0) {
        console.log("\nEvents:", result.events.map(e => e.type).join(', '));
      }
      
      return result.digest;
    } catch (error) {
      console.error("Failed to execute mint transaction:", error);
      return null;
    }
  }
  
  // Test 2: Check balance
  async function checkBalance() {
    console.log("\n=== Test 2: Checking Balance ===");
    
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
  
  // Test 3: Transfer tokens
  async function testTransfer(coinId: string, amount: number) {
    console.log("\n=== Test 3: Transferring Tokens ===");
    
    // Use the same address as recipient for testing
    const testRecipient = recipientAddress;
    const amountToTransfer = Math.floor(amount * 1e9); // Convert to the smallest unit and ensure integer
    
    console.log(`Transferring ${amount} HETRA from coin ${coinId} to ${testRecipient}...`);
    
    try {
      // Create a transaction for transfer
      const transferTx = new TransactionBlock();
      
      // Split the coin and transfer a portion
      const [coin] = transferTx.splitCoins(
        transferTx.object(coinId),
        [transferTx.pure(amountToTransfer)]
      );
      
      // Transfer the split coin
      transferTx.transferObjects([coin], transferTx.pure(testRecipient));
      
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
  
  // Test 4: Burn tokens
  async function testBurn(coinId: string, amount: number) {
    console.log("\n=== Test 4: Burning Tokens ===");
    
    const amountToBurn = Math.floor(amount * 1e9); // Convert to the smallest unit and ensure integer
    
    console.log(`Burning ${amount} HETRA from coin ${coinId}...`);
    
    try {
      // Create a transaction for burning
      const burnTx = new TransactionBlock();
      
      // Split the coin to get the amount to burn
      const [coinToBurn] = burnTx.splitCoins(
        burnTx.object(coinId),
        [burnTx.pure(amountToBurn)]
      );
      
      // Burn the split coin
      burnTx.moveCall({
        target: `0x2::coin::burn`,
        typeArguments: [coinType],
        arguments: [
          burnTx.object(treasuryCapId),
          coinToBurn
        ],
      });
      
      // Execute the transaction
      const result = await provider.signAndExecuteTransactionBlock({
        transactionBlock: burnTx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });
      
      console.log("Burn transaction executed successfully!");
      console.log("Transaction digest:", result.digest);
      console.log("Status:", result.effects?.status?.status);
      
      return result.digest;
    } catch (error) {
      console.error("Failed to execute burn transaction:", error);
      return null;
    }
  }
  
  // Test 5: Check token metadata
  async function checkMetadata() {
    console.log("\n=== Test 5: Checking Token Metadata ===");
    
    try {
      // Direct approach - get the metadata using its type
      const metadataObjects = await provider.getCoinMetadata({
        coinType: coinType
      });
      
      if (metadataObjects) {
        console.log("Found CoinMetadata for HetraCoin:");
        console.log(JSON.stringify(metadataObjects, null, 2));
        return metadataObjects.id;
      } else {
        console.log("CoinMetadata for HetraCoin not found via getCoinMetadata");
        
        // Fallback to searching owned objects
        const objects = await provider.getOwnedObjects({
          owner: senderAddress,
          filter: { StructType: `0x2::coin::CoinMetadata` },
          options: { showContent: true, showType: true },
        });
        
        // Find the CoinMetadata for HetraCoin
        const metadata = objects.data.find(obj => 
          obj.data?.type?.includes(coinType)
        );
        
        if (metadata && metadata.data?.content) {
          console.log("Found CoinMetadata through owned objects:");
          console.log(JSON.stringify(metadata.data.content, null, 2));
          return metadata.data.objectId;
        } else {
          console.log("CoinMetadata for HetraCoin not found in owned objects");
          return null;
        }
      }
    } catch (error) {
      console.error("Failed to check metadata:", error);
      return null;
    }
  }
  
  // Run all tests in sequence
  async function runAllTests() {
    console.log("\n=========== STARTING HETRA TOKEN TESTS ===========\n");
    
    // Check initial balance
    console.log("Initial state:");
    const initialCoins = await checkBalance();
    
    // Check metadata
    await checkMetadata();
    
    // Mint tokens if we don't have any
    if (initialCoins.length === 0 || initialCoins.every(coin => Number(coin.balance) === 0)) {
      await testMint();
      const postMintCoins = await checkBalance();
      
      // If we have coins now, test transfer and burn
      if (postMintCoins.length > 0) {
        const coinToUse = postMintCoins[0].coinObjectId;
        const balance = Number(postMintCoins[0].balance) / 1e9;
        
        // Test transfer with 10% of balance or at least 1 token
        const transferAmount = Math.max(1, balance * 0.1);
        await testTransfer(coinToUse, transferAmount);
        await checkBalance();
        
        // Test burn with 5% of balance or at least 0.5 token
        const burnAmount = Math.max(0.5, balance * 0.05);
        await testBurn(coinToUse, burnAmount);
        await checkBalance();
      }
    } else {
      // We already have coins, use the first one for tests
      const coinToUse = initialCoins[0].coinObjectId;
      const balance = Number(initialCoins[0].balance) / 1e9;
      
      // Mint more tokens
      await testMint();
      await checkBalance();
      
      // Test transfer with 10% of initial balance or at least 1 token
      const transferAmount = Math.max(1, balance * 0.1);
      await testTransfer(coinToUse, transferAmount);
      await checkBalance();
      
      // Test burn with 5% of initial balance or at least 0.5 token
      const burnAmount = Math.max(0.5, balance * 0.05);
      await testBurn(coinToUse, burnAmount);
      await checkBalance();
    }
    
    console.log("\n=========== HETRA TOKEN TESTS COMPLETED ===========\n");
  }
  
  // Run all tests
  await runAllTests();
}

main().catch(console.error); 