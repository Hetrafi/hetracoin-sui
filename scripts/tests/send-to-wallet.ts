import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify the question function
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

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
  
  console.log("Send HETRA tokens to a Suiet testnet wallet");
  console.log("Sender Address:", senderAddress);
  
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
  async function transferTokens(recipientAddress: string, amount: number, coinId: string) {
    console.log(`\n=== Transferring ${amount.toLocaleString()} HETRA Tokens ===`);
    console.log(`Using coin: ${coinId}`);
    console.log(`Recipient: ${recipientAddress}`);
    
    try {
      // Create a transaction for transfer
      const transferTx = new TransactionBlock();
      const amountToTransfer = BigInt(Math.floor(amount * 1e9));
      
      // Split the coin and transfer a portion
      const [coin] = transferTx.splitCoins(
        transferTx.object(coinId),
        [transferTx.pure(amountToTransfer)]
      );
      
      // Transfer the split coin
      transferTx.transferObjects([coin], transferTx.pure(recipientAddress));
      
      console.log(`Transferring ${amount.toLocaleString()} HETRA from coin ${coinId} to ${recipientAddress}...`);
      
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
      
      // Provide explorer link
      console.log(`\nView transaction: https://suiexplorer.com/txblock/${result.digest}?network=testnet`);
      
      return result.digest;
    } catch (error) {
      console.error("Failed to execute transfer transaction:", error);
      return null;
    }
  }
  
  // Run the transfer
  async function run() {
    try {
      // Check initial balance
      console.log("Initial state:");
      const coins = await checkBalance();
      
      if (coins.length === 0) {
        console.error("No HETRA coins found in wallet. Cannot proceed with transfer.");
        return;
      }
      
      // Get recipient address from user input
      const recipientAddress = await askQuestion("\nEnter recipient Sui address (should start with 0x): ");
      if (!recipientAddress.startsWith('0x')) {
        console.error("Invalid address format. Address should start with 0x.");
        return;
      }
      
      // Get amount to transfer
      const amountStr = await askQuestion("Enter amount of HETRA to transfer: ");
      const amount = parseFloat(amountStr);
      
      if (isNaN(amount) || amount <= 0) {
        console.error("Invalid amount. Please enter a positive number.");
        return;
      }
      
      // Find a coin with sufficient balance
      let coinToUse = null;
      let coinIndex = 0;
      
      for (let i = 0; i < coins.length; i++) {
        const coin = coins[i];
        if (BigInt(coin.balance) >= BigInt(Math.floor(amount * 1e9))) {
          coinToUse = coin.coinObjectId;
          coinIndex = i + 1;
          break;
        }
      }
      
      if (!coinToUse) {
        console.error("No single coin with sufficient balance found.");
        return;
      }
      
      console.log(`\nUsing coin #${coinIndex} for transfer.`);
      
      // Confirm transfer
      const confirmation = await askQuestion(`\nConfirm transfer of ${amount} HETRA to ${recipientAddress}? (yes/no): `);
      
      if (confirmation.toLowerCase() !== 'yes') {
        console.log("Transfer cancelled.");
        return;
      }
      
      // Execute transfer
      await transferTokens(recipientAddress, amount, coinToUse);
      
      // Check balance after transfer
      console.log("\nBalance after transfer:");
      await checkBalance();
      
      console.log("\nTransfer operation completed!");
    } finally {
      // Close readline interface
      rl.close();
    }
  }
  
  // Run everything
  await run();
}

main().catch(console.error); 