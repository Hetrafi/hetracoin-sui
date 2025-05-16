import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

// DO NOT create readline interface globally - create it inside each function that needs it

/**
 * Prompt user for input with a question
 * @param rl Readline interface 
 * @param question Question to ask the user
 * @returns Promise with the user's answer
 */
function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Format a number with commas for readability
 * @param num Number to format
 * @returns Formatted number string
 */
function formatNumber(num: bigint | number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Transfer HetraCoin tokens from one address to another
 * 
 * @param amount - Amount of tokens to transfer (in tokens, not base units)
 * @param coinObjectId - ID of the coin object to use for transfer
 * @param recipientAddress - Address to receive the tokens
 * @returns Transaction digest
 */
export async function transferHetraCoin(
  amount: bigint, 
  coinObjectId: string, 
  recipientAddress: string
): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nTransferring ${amount} HETRA tokens`);
    console.log(`From: ${sender}`);
    console.log(`To: ${recipientAddress}`);
    console.log(`Using coin object: ${coinObjectId}`);
    console.log(`Using Package ID: ${packageId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the secure_transfer function on the HetraCoin module
    txb.moveCall({
      target: `${packageId}::HetraCoin::secure_transfer`,
      arguments: [
        txb.object(coinObjectId),
        txb.pure(recipientAddress),
        txb.pure(amount),
        txb.object(pauseStateId),
      ],
    });
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nTransfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    if (result.events && result.events.length > 0) {
      console.log('Events:');
      result.events.forEach((event, index) => {
        console.log(`  Event #${index + 1}: ${event.type}`);
        if (event.parsedJson) {
          console.log(`    Data: ${JSON.stringify(event.parsedJson, null, 2)}`);
        }
      });
    }
    
    return result.digest;
  } catch (error) {
    console.error('Error transferring HetraCoin:', error);
    throw error;
  }
}

/**
 * Find HETRA coin objects owned by an address
 * 
 * @param address - Address to check for coin objects
 * @returns Array of coin objects with their IDs and balances
 */
export async function findHetraCoinObjects(address: string) {
  try {
    // Get package ID from environment variables
    const packageId = process.env.PACKAGE_ID;
    if (!packageId) {
      throw new Error('PACKAGE_ID not found in .env file');
    }
    
    // Get owned objects
    const coinType = `${packageId}::HetraCoin::HETRACOIN`;
    const coins = await client.getCoins({
      owner: address,
      coinType
    });
    
    return coins.data.map(coin => ({
      id: coin.coinObjectId,
      balance: BigInt(coin.balance)
    }));
  } catch (error) {
    console.error('Error finding HetraCoin objects:', error);
    throw error;
  }
}

// Interactive CLI for transferring tokens
async function interactiveTransfer(rl: readline.Interface) {
  console.log('=== HetraCoin Transfer Tool ===');
  
  try {
    // Get wallet address
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nListing HetraCoin objects for address: ${address}`);
    
    // Get coin objects
    const coins = await findHetraCoinObjects(address);
    
    if (coins.length === 0) {
      console.log('No HetraCoin objects found for this address.');
      rl.close();
      return;
    }
    
    console.log('\nAvailable HetraCoin objects:');
    coins.forEach((coin, index) => {
      console.log(`[${index + 1}] Coin ID: ${coin.id}`);
      console.log(`    Balance: ${formatNumber(Number(coin.balance) / 1e9)} HETRA tokens`);
    });
    
    // Ask user to select a coin
    const selection = await promptUser(rl, '\nEnter the number of the coin to use for transfer (or coin ID directly): ');
    
    let selectedCoin: string;
    let coinBalance: bigint = BigInt(0);
    
    // Check if input is a number (index) or a coin ID
    if (/^\d+$/.test(selection) && Number(selection) <= coins.length && Number(selection) > 0) {
      // User entered an index
      const index = Number(selection) - 1;
      selectedCoin = coins[index].id;
      coinBalance = coins[index].balance;
    } else if (selection.startsWith('0x')) {
      // User entered a coin ID
      const coin = coins.find(c => c.id === selection);
      if (!coin) {
        console.error('Error: The specified coin ID was not found in your wallet.');
        rl.close();
        return;
      }
      selectedCoin = selection;
      coinBalance = coin.balance;
    } else {
      console.error('Error: Invalid selection. Please enter a valid number or coin ID.');
      rl.close();
      return;
    }
    
    // Ask for recipient address
    const recipient = await promptUser(rl, '\nEnter the recipient address (0x...): ');
    
    if (!recipient.startsWith('0x') || recipient.length < 20) {
      console.error('Error: Invalid recipient address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Ask for amount to transfer
    const displayBalance = Number(coinBalance) / 1e9;
    const amountInput = await promptUser(rl, `\nEnter the amount of HETRA tokens to transfer (max ${formatNumber(displayBalance)}): `);
    
    // Parse amount as a float first to handle decimal inputs
    let tokenAmount: number;
    try {
      tokenAmount = parseFloat(amountInput);
      if (isNaN(tokenAmount)) {
        throw new Error("Invalid number");
      }
    } catch (e) {
      console.error('Invalid amount. Please enter a valid number.');
      rl.close();
      return;
    }

    // Convert token amount to base units (with 9 decimals)
    // We need to handle potential precision issues with floating point
    let amount: bigint;
    try {
      // Convert to base units by multiplying by 10^9
      // For example, 1.5 HETRA → 1.5 * 10^9 = 1,500,000,000 base units
      if (amountInput.includes('.')) {
        // Handle decimal input
        const [whole, fraction] = amountInput.split('.');
        // Pad the fraction to 9 decimal places
        const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
        
        // Convert to base units
        amount = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
      } else {
        // Convert whole number to base units
        amount = BigInt(amountInput) * BigInt(1_000_000_000);
      }
    } catch (e) {
      console.error('Error converting amount: ' + e);
      rl.close();
      return;
    }
    
    // Validate amount
    if (amount <= 0) {
      console.error('Error: Amount must be greater than 0');
      rl.close();
      return;
    }
    
    // Check if user has sufficient balance
    if (amount > coinBalance) {
      console.error(`Error: Insufficient balance. The selected coin only has ${formatNumber(displayBalance)} HETRA tokens`);
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nTransfer Details:');
    console.log(`  From: ${address}`);
    console.log(`  To: ${recipient}`);
    console.log(`  Amount: ${formatNumber(tokenAmount)} HETRA tokens (${formatNumber(amount)} base units)`);
    console.log(`  Coin ID: ${selectedCoin}`);
    
    const confirm = await promptUser(rl, '\nConfirm transfer? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Transfer cancelled.');
      rl.close();
      return;
    }
    
    // Execute transfer
    await transferHetraCoin(amount, selectedCoin, recipient);
    
    console.log('\nTransfer completed successfully!');
  } catch (error) {
    console.error(`\nError during transfer: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for listing coin objects
async function interactiveListCoins(rl: readline.Interface) {
  console.log('=== HetraCoin List Tool ===');
  
  try {
    const address = await promptUser(rl, '\nEnter the address to check for HETRA coins (0x...): ');
    
    if (!address.startsWith('0x') || address.length < 20) {
      console.error('Error: Invalid address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    console.log(`\nListing HetraCoin objects for address: ${address}`);
    
    const coins = await findHetraCoinObjects(address);
    
    if (coins.length === 0) {
      console.log('No HetraCoin objects found for this address.');
      rl.close();
      return;
    }
    
    console.log('\nHetraCoin objects:');
    
    let totalBalance = BigInt(0);
    
    coins.forEach((coin, index) => {
      const displayBalance = Number(coin.balance) / 1e9;
      console.log(`[${index + 1}] Coin ID: ${coin.id}`);
      console.log(`    Balance: ${formatNumber(displayBalance)} HETRA tokens`);
      totalBalance += coin.balance;
    });
    
    const totalDisplayBalance = Number(totalBalance) / 1e9;
    console.log(`\nTotal: ${coins.length} coin objects`);
    console.log(`Total balance: ${formatNumber(totalDisplayBalance)} HETRA tokens`);
    
  } catch (error) {
    console.error(`\nError listing coins: ${error}`);
  } finally {
    rl.close();
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode - show menu
    (async () => {
      // Create readline interface for the menu
      const menuRL = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('=== HetraCoin Transfer Operations ===');
      console.log('1. Transfer tokens');
      console.log('2. List coin objects for an address');
      
      const choice = await promptUser(menuRL, '\nSelect an operation (1-2): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for transfer function
          const transferRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveTransfer(transferRL);
          break;
          
        case '2':
          // Create a new readline for list function
          const listRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveListCoins(listRL);
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    if (args[0] === 'list') {
      // List coin objects for the given address
      if (args.length < 2) {
        console.log('Please provide an address to check for coin objects');
        process.exit(1);
      }
      
      findHetraCoinObjects(args[1])
        .then(coins => {
          console.log('HETRA coin objects:');
          let totalBalance = BigInt(0);
          
          coins.forEach((coin, index) => {
            const displayBalance = Number(coin.balance) / 1e9;
            console.log(`[${index + 1}] ID: ${coin.id}, Balance: ${formatNumber(displayBalance)} HETRA tokens`);
            totalBalance += coin.balance;
          });
          
          const totalDisplayBalance = Number(totalBalance) / 1e9;
          console.log(`\nTotal: ${coins.length} coin objects`);
          console.log(`Total balance: ${formatNumber(totalDisplayBalance)} HETRA tokens`);
          
          process.exit(0);
        })
        .catch(err => {
          console.error(err);
          process.exit(1);
        });
    } else if (args[0] === 'transfer') {
      // Transfer coins
      if (args.length < 4) {
        console.log('Usage: npx ts-node transfer.ts transfer <amount> <coin_object_id> <recipient_address>');
        process.exit(1);
      }
      
      let amount: bigint;
      const amountStr = args[1];
      
      try {
        // Convert to base units (multiply by 10^9)
        if (amountStr.includes('.')) {
          // Handle decimal input
          const [whole, fraction] = amountStr.split('.');
          // Pad the fraction to 9 decimal places
          const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
          // Convert to base units
          amount = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
        } else {
          // Convert whole number to base units
          amount = BigInt(amountStr) * BigInt(1_000_000_000);
        }
        console.log(`Converting ${amountStr} HETRA tokens to ${amount} base units`);
      } catch (e) {
        console.error('Invalid amount. Please enter a valid number.');
        process.exit(1);
      }
      
      const coinObjectId = args[2];
      const recipient = args[3];

      transferHetraCoin(amount, coinObjectId, recipient)
        .then(() => process.exit(0))
        .catch(err => {
          console.error(err);
          process.exit(1);
        });
    } else {
      console.log('Usage:');
      console.log('  Interactive mode: npx ts-node transfer.ts');
      console.log('  Command-line mode:');
      console.log('    npx ts-node transfer.ts list <address>');
      console.log('    npx ts-node transfer.ts transfer <amount> <coin_object_id> <recipient_address>');
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node transfer.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node transfer.ts list <address>');
    console.log('    npx ts-node transfer.ts transfer <amount> <coin_object_id> <recipient_address>');
    process.exit(1);
  }
} 