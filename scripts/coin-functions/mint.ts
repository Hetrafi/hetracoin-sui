import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt user for input with a question
 * @param question Question to ask the user
 * @returns Promise with the user's answer
 */
function promptUser(question: string): Promise<string> {
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
 * Mint new HetraCoin tokens
 * 
 * @param amount - Amount of tokens to mint (in base units with 9 decimals)
 * @param recipientAddress - Address to receive the minted tokens
 * @returns Transaction digest
 */
export async function mintHetraCoin(amount: bigint, recipientAddress: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const treasuryCapId = process.env.TREASURY_CAP_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !treasuryCapId || !adminRegistryId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID, TREASURY_CAP_ID, ADMIN_REGISTRY_ID, and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    // Calculate token amount from base units
    const tokenAmount = Number(amount) / 1e9;
    
    console.log(`\nMinting tokens to ${recipientAddress}`);
    console.log(`Amount: ${formatNumber(tokenAmount)} HETRA tokens (${formatNumber(amount)} base units)`);
    console.log(`Sender: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Treasury Cap ID: ${treasuryCapId}`);
    console.log(`Using Admin Registry ID: ${adminRegistryId}`);
    console.log(`Using Emergency Pause State ID: ${pauseStateId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Set gas budget explicitly to avoid automatic budget calculation
    txb.setGasBudget(50000000); // 50 MIST
    
    // Call the mint function on the HetraCoin module
    console.log(`Calling mint with amount: ${amount} base units`);
    const mintedCoin = txb.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        txb.object(treasuryCapId),
        txb.pure(amount),
        txb.object(adminRegistryId),
        txb.object(pauseStateId),
      ],
    });
    
    // Transfer the minted coin to the recipient
    txb.transferObjects([mintedCoin], txb.pure(recipientAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nMint transaction successful!');
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
    console.error('Error minting HetraCoin:', error);
    throw error;
  }
}

// Interactive CLI execution
async function interactiveMint() {
  console.log('=== HetraCoin Mint Tool ===');
  console.log('Note: HetraCoin has 9 decimal places.');
  console.log('Limits: Maximum 10 million tokens per transaction, 1 billion tokens total supply.');
  
  try {
    // Ask if user wants to input tokens or base units
    const inputMode = await promptUser('Do you want to input (1) HETRA tokens or (2) base units? (1/2): ');
    
    if (inputMode !== '1' && inputMode !== '2') {
      console.error('Invalid selection. Please enter 1 or 2.');
      rl.close();
      return;
    }
    
    const isTokenMode = inputMode === '1';
    
    // Explanation based on chosen mode
    if (isTokenMode) {
      console.log('\nYou\'re entering HETRA token amounts. Examples:');
      console.log('  1     = 1 HETRA token (1,000,000,000 base units)');
      console.log('  0.5   = 0.5 HETRA tokens (500,000,000 base units)');
      console.log('  1000  = 1,000 HETRA tokens (1,000,000,000,000 base units)');
    } else {
      console.log('\nYou\'re entering base unit amounts directly. Examples:');
      console.log('  1000000000  = 1 HETRA token');
      console.log('  500000000   = 0.5 HETRA tokens');
      console.log('  10000000    = 0.01 HETRA tokens');
    }
    
    // Ask for amount based on selected mode
    const prompt = isTokenMode 
      ? 'Enter the amount of HETRA tokens to mint: ' 
      : 'Enter the amount of base units to mint: ';
    
    const amountInput = await promptUser(prompt);
    let amount: bigint;
    
    try {
      if (isTokenMode) {
        // Token mode - Convert to base units by multiplying by 10^9
        if (amountInput.includes('.')) {
          // Handle decimal input
          const [whole, fraction] = amountInput.split('.');
          // Pad the fraction to 9 decimal places
          const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
          
          console.log(`Converting decimal amount: ${whole}.${paddedFraction} tokens`);
          
          // Convert to base units (multiply by 10^9)
          amount = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
        } else {
          // Convert whole number to base units
          console.log(`Converting whole number: ${amountInput} tokens`);
          amount = BigInt(amountInput) * BigInt(1_000_000_000);
        }
      } else {
        // Base units mode - Use the amount directly
        console.log(`Using direct base units: ${amountInput}`);
        amount = BigInt(amountInput);
      }
      
      console.log(`Amount in base units: ${amount}`);
      const displayAmount = Number(amount) / 1e9;
      console.log(`This will mint ${formatNumber(displayAmount)} HETRA tokens`);
    } catch (e) {
      console.error('Invalid amount. Please enter a valid number.');
      rl.close();
      return;
    }
    
    // Validate amount (max 10M tokens per transaction)
    const MAX_PER_MINT = BigInt(10_000_000) * BigInt(1_000_000_000); // 10M tokens with 9 decimals
    if (amount > MAX_PER_MINT) {
      console.error(`Error: Cannot mint more than 10,000,000 tokens in a single transaction.`);
      console.error(`Your input would mint ${formatNumber(Number(amount) / 1e9)} tokens (${formatNumber(amount)} base units).`);
      console.error(`Please enter a smaller amount (10,000,000 or less).`);
      rl.close();
      return;
    } else if (amount <= 0) {
      console.error('Error: Amount must be greater than 0');
      rl.close();
      return;
    }
    
    // Ask for recipient address
    const recipient = await promptUser('Enter the recipient address (0x...): ');
    
    if (!recipient.startsWith('0x') || recipient.length < 20) {
      console.error('Error: Invalid recipient address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Confirmation
    const displayAmount = Number(amount) / 1e9;
    console.log('\nMint Details:');
    console.log(`  Amount: ${formatNumber(displayAmount)} HETRA tokens`);
    console.log(`  Amount in base units: ${formatNumber(amount)}`);
    console.log(`  Recipient: ${recipient}`);
    
    const confirm = await promptUser('\nConfirm mint transaction? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Transaction cancelled.');
      rl.close();
      return;
    }
    
    // Execute mint
    await mintHetraCoin(amount, recipient);
    
    console.log('\nMint operation completed successfully!');
  } catch (error) {
    console.error(`\nError during mint operation: ${error}`);
  } finally {
    rl.close();
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    interactiveMint();
  } else if (args.length >= 2) {
    // Check for mode flag (--tokens or --base-units)
    let isTokenMode = true;
    let amountIndex = 0;
    let recipientIndex = 1;
    
    if (args[0] === '--tokens') {
      isTokenMode = true;
      amountIndex = 1;
      recipientIndex = 2;
      if (args.length < 3) {
        console.error('Missing amount or recipient address');
        process.exit(1);
      }
    } else if (args[0] === '--base-units') {
      isTokenMode = false;
      amountIndex = 1;
      recipientIndex = 2;
      if (args.length < 3) {
        console.error('Missing amount or recipient address');
        process.exit(1);
      }
    }
    
    // Command-line arguments mode
    let amount: bigint;
    const amountStr = args[amountIndex];
    
    try {
      if (isTokenMode) {
        // Token mode - Convert to base units
        if (amountStr.includes('.')) {
          // Handle decimal input
          const [whole, fraction] = amountStr.split('.');
          // Pad the fraction to 9 decimal places
          const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
          // Convert to base units (multiply by 10^9)
          amount = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
        } else {
          // Convert whole number to base units
          amount = BigInt(amountStr) * BigInt(1_000_000_000);
        }
        console.log(`Minting ${amountStr} HETRA tokens (${amount} base units)`);
      } else {
        // Base units mode - Use the amount directly
        amount = BigInt(amountStr);
        const displayAmount = Number(amount) / 1e9;
        console.log(`Minting ${amountStr} base units (${displayAmount} HETRA tokens)`);
      }
    } catch (e) {
      console.error('Invalid amount. Please enter a valid number.');
      process.exit(1);
    }
    
    // Validate amount (max 10M tokens per transaction)
    const MAX_PER_MINT = BigInt(10_000_000) * BigInt(1_000_000_000); // 10M tokens with 9 decimals
    if (amount > MAX_PER_MINT) {
      console.error(`Error: Cannot mint more than 10,000,000 tokens in a single transaction.`);
      console.error(`Your input would mint ${formatNumber(Number(amount) / 1e9)} tokens (${formatNumber(amount)} base units).`);
      console.error(`Please enter a smaller amount (10,000,000 or less).`);
      process.exit(1);
    }
    
    const recipient = args[recipientIndex];
    
    if (!recipient.startsWith('0x')) {
      console.error('Invalid recipient address. Must start with 0x');
      process.exit(1);
    }
    
    mintHetraCoin(amount, recipient)
      .then(() => {
        console.log('Mint completed successfully');
        process.exit(0);
      })
      .catch((err) => {
        console.error('Mint failed with error:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node mint.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node mint.ts [--tokens | --base-units] <amount> <recipient_address>');
    console.log('\nExamples:');
    console.log('  npx ts-node mint.ts 100 0x123...                  (Mints 100 HETRA tokens)');
    console.log('  npx ts-node mint.ts --tokens 100 0x123...         (Mints 100 HETRA tokens)');
    console.log('  npx ts-node mint.ts --base-units 1000000000 0x123...  (Mints 1 HETRA token)');
    console.log('\nNote: By default, amounts are interpreted as HETRA tokens.');
    console.log('      Use --base-units flag to specify amounts in base units directly.');
    process.exit(1);
  }
}