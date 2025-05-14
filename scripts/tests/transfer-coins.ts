import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Configuration - hardcoded from our deployment
  const packageId = '0x8667452485be796d6cb4ad2fce0d8e19734c1eb2a673b483186c7dc1b4062369';
  const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY || '5n7DJoMI7j/h4+0KB6ApWG6qe6b2EyzcabAxOmskagE=';
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;
  
  // The coin with 10 million tokens (from previous output)
  const largeCoinId = '0x7363b5c50318d45ef82c20d879497f63a3baa9c64eb0649cdf8f7c7ad14bd9a4';

  // Setup provider and keypair
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  const senderAddress = keypair.getPublicKey().toSuiAddress();
  
  console.log("Transfer HETRA tokens");
  console.log("Sender Address:", senderAddress);
  
  // Define recipient address - same as sender for testing
  // You can change this to any valid Sui address
  const recipientAddress = senderAddress;
  console.log("Recipient Address:", recipientAddress);
  
  // Check balance
  async function checkBalance() {
    console.log("\n=== Checking Balance ===");
    
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
  
  // Transfer tokens
  async function transferTokens(amount: number) {
    console.log(`\n=== Transferring ${amount.toLocaleString()} HETRA Tokens ===`);
    console.log(`Using coin: ${largeCoinId}`);
    
    try {
      // Create a transaction for transfer
      const transferTx = new TransactionBlock();
      const amountToTransfer = BigInt(Math.floor(amount * 1e9));
      
      // Split the coin and transfer a portion
      const [coin] = transferTx.splitCoins(
        transferTx.object(largeCoinId),
        [transferTx.pure(amountToTransfer)]
      );
      
      // Transfer the split coin
      transferTx.transferObjects([coin], transferTx.pure(recipientAddress));
      
      console.log(`Transferring ${amount.toLocaleString()} HETRA from coin ${largeCoinId} to ${recipientAddress}...`);
      
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
  
  // Run the transfer
  async function run() {
    // Check initial balance
    console.log("Initial state:");
    await checkBalance();
    
    // Transfer 1 million tokens from the large coin to the recipient
    const transferAmount = 1_000_000; // 1 million tokens
    await transferTokens(transferAmount);
    
    // Check balance after transfer
    console.log("\nBalance after transfer:");
    await checkBalance();
    
    console.log("\nTransfer operation completed!");
  }
  
  // Run everything
  await run();
}

main().catch(console.error); 