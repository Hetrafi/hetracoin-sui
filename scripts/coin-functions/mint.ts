import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromB64 } from '@mysten/sui.js/utils';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Import our network-config utility
const networkConfig = require('../utility/network-config');

dotenv.config();

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
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    // Validate required configuration
    if (!config.deployerPrivateKey) {
      throw new Error('Deployer private key not found in environment variables');
    }

    // Get package ID and object IDs from environment
    const packageId = config.packageId;
    const treasuryCapId = config.treasuryCapAddress;
    const adminRegistryId = config.adminRegistryAddress;
    const pauseStateId = config.pauseStateAddress;

    if (!packageId || !treasuryCapId || !adminRegistryId || !pauseStateId) {
      const networkPrefix = config.network === 'testnet' ? 'TESTNET_' : 'MAINNET_';
      // Provide detailed diagnostic message
      let missingVars: string[] = [];
      if (!packageId) missingVars.push(`PACKAGE_ID or ${networkPrefix}PACKAGE_ID`);
      if (!treasuryCapId) missingVars.push(`TREASURY_CAP_ID or ${networkPrefix}TREASURY_CAP_ID`);
      if (!adminRegistryId) missingVars.push(`ADMIN_REGISTRY_ID or ${networkPrefix}ADMIN_REGISTRY_ID`);
      if (!pauseStateId) missingVars.push(`EMERGENCY_PAUSE_STATE_ID or ${networkPrefix}EMERGENCY_PAUSE_STATE_ID`);
      
      throw new Error(`Missing required configuration for ${config.network}. The following variables are missing:
      ${missingVars.join('\n      ')}
      
Check your .env file to ensure you have correct environment variables.
Run 'cat .env' to verify what values are set.

After deployment, run the verify script to check your deployment:
npx ts-node scripts/deployment/deploy-phase1.ts verify ${config.network}`);
    }
    
    // Initialize client with network-specific RPC URL
    const client = new SuiClient({ url: config.rpcUrl });
    
    // Create keypair from private key
    let keyData = fromB64(config.deployerPrivateKey);
    // Ensure we have exactly 32 bytes
    if (keyData.length !== 32) {
      keyData = keyData.slice(0, 32);
    }
    const keypair = Ed25519Keypair.fromSecretKey(keyData);
    const sender = keypair.getPublicKey().toSuiAddress();
    
    // Calculate token amount from base units
    const tokenAmount = Number(amount) / 1e9;
    
    console.log(`\nMinting tokens on ${config.network}`);
    console.log(`Recipient: ${recipientAddress}`);
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
        txb.object(pauseStateId)
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
    
    // Display explorer URL - updated to use Suiscan
    const explorer = config.network === 'mainnet'
      ? 'https://suiscan.xyz/mainnet/tx'
      : 'https://suiscan.xyz/testnet/tx';
    console.log(`Explorer URL: ${explorer}/${result.digest}`);
    
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
  
  // Display network information
  const config = networkConfig.getNetworkConfig();
  console.log(`Network: ${config.network.toUpperCase()}`);
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
      console.error('Error parsing amount:', e);
      rl.close();
      return;
    }
    
    // Ask for recipient address
    const recipientAddress = await promptUser('Enter the recipient address: ');
    
    if (!recipientAddress.startsWith('0x')) {
      console.error('Invalid Sui address. Address should start with 0x');
      rl.close();
      return;
    }
    
    // Confirm mint operation
    const confirm = await promptUser(`\nReady to mint ${formatNumber(Number(amount) / 1e9)} HETRA tokens to ${recipientAddress} on ${config.network}. Proceed? (y/n): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Mint operation cancelled.');
      rl.close();
      return;
    }
    
    // Execute mint
    const txDigest = await mintHetraCoin(amount, recipientAddress);
    console.log(`\nMint transaction completed. Transaction digest: ${txDigest}`);
  } catch (error) {
    console.error('Error during mint process:', error);
  } finally {
    rl.close();
  }
}

// Run the interactive mint tool if called directly
if (require.main === module) {
  interactiveMint();
}

export { interactiveMint };