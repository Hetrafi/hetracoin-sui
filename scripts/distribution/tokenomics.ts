import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants for distribution
const INITIAL_SUPPLY = 10_000_000_000; // 10 Billion tokens
const MAX_MINT_PER_TX = 1_000_000_000; // 1 Billion (from Governance.move)

// Define allocation type
interface TokenAllocation {
  percentage: number;
  amount: number;
  address: string;
  description: string;
}

// Define distribution log types
interface DistributionLogEntry {
  type: string;
  percentage: number;
  amount: number;
  recipient: string;
  transactionCount: number;
}

interface DistributionLog {
  timestamp: string;
  network: string;
  totalSupply: number;
  distributions: DistributionLogEntry[];
  transactions: string[];
}

// Token distribution according to ratios
const DISTRIBUTION: Record<string, TokenAllocation> = {
  // Public Sale (ICO/IDO): 20%
  PUBLIC_SALE: {
    percentage: 20,
    amount: INITIAL_SUPPLY * 0.2,
    address: process.env.PUBLIC_SALE_ADDRESS || '',
    description: 'Public Sale (ICO/IDO)'
  },
  // Ecosystem & Rewards: 17.5%
  ECOSYSTEM_REWARDS: {
    percentage: 17.5,
    amount: INITIAL_SUPPLY * 0.175,
    address: process.env.ECOSYSTEM_ADDRESS || '',
    description: 'Ecosystem & Rewards'
  },
  // Liquidity & Exchange Reserves: 20%
  LIQUIDITY_RESERVES: {
    percentage: 20,
    amount: INITIAL_SUPPLY * 0.2,
    address: process.env.LIQUIDITY_ADDRESS || '',
    description: 'Liquidity & Exchange Reserves'
  },
  // Team & Previous Investors (Vested): 12.5%
  TEAM_INVESTORS: {
    percentage: 10,
    amount: INITIAL_SUPPLY * 0.10,
    address: process.env.TEAM_ADDRESS || '',
    description: 'Team & Previous Investors (Vested)'
  },
  // Treasury & Development: 30%
  TREASURY_DEV: {
    percentage: 32.5,
    amount: INITIAL_SUPPLY * 0.325,
    address: process.env.TREASURY_ADDRESS || '',
    description: 'Treasury & Development'
  }
};

// Configuration
const config = {
  // From deployment
  packageId: process.env.PACKAGE_ID || '',
  treasuryCapId: process.env.TREASURY_CAP_ID || '',
  adminAddress: process.env.ADMIN_ADDRESS || '',
  adminSeedPhrase: process.env.ADMIN_SEED_PHRASE || '',
  network: process.env.NETWORK || 'testnet',
};

// Validate configuration
function validateConfig() {
  const requiredEnvVars = [
    'PACKAGE_ID', 
    'TREASURY_CAP_ID', 
    'ADMIN_ADDRESS', 
    'ADMIN_SEED_PHRASE',
    'PUBLIC_SALE_ADDRESS',
    'ECOSYSTEM_ADDRESS',
    'LIQUIDITY_ADDRESS',
    'TEAM_ADDRESS', 
    'TREASURY_ADDRESS'
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    console.error('Please create a .env file with the required variables');
    process.exit(1);
  }
}

// Initialize client and keypair
async function initClient() {
  const networks: Record<string, string> = {
    mainnet: 'https://fullnode.mainnet.sui.io:443',
    testnet: 'https://fullnode.testnet.sui.io:443',
    devnet: 'https://fullnode.devnet.sui.io:443',
    localnet: 'http://127.0.0.1:9000',
  };

  const rpcUrl = networks[config.network] || networks.testnet;
  const client = new SuiClient({ url: rpcUrl });
  
  // Create admin keypair from seed phrase
  const adminKeypair = Ed25519Keypair.deriveKeypair(config.adminSeedPhrase);
  
  return { client, adminKeypair };
}

// Function to mint tokens in multiple transactions if needed
async function mintTokens(client: SuiClient, adminKeypair: Ed25519Keypair, allocation: TokenAllocation): Promise<SuiTransactionBlockResponse[]> {
  console.log(`\nProcessing ${allocation.description} (${allocation.percentage}%)`);
  console.log(`Total allocation: ${allocation.amount.toLocaleString()} tokens`);
  
  let remainingAmount = allocation.amount;
  const transactions: SuiTransactionBlockResponse[] = [];
  
  while (remainingAmount > 0) {
    const currentMintAmount = Math.min(remainingAmount, MAX_MINT_PER_TX);
    
    console.log(`Minting ${currentMintAmount.toLocaleString()} tokens...`);
    
    const txb = new TransactionBlock();
    
    // Call the governance mint function
    const mintedCoin = txb.moveCall({
      target: `${config.packageId}::Governance::mint`,
      arguments: [
        txb.object(config.treasuryCapId),
        txb.pure(currentMintAmount),
      ],
    });
    
    // Transfer the minted coins to target address
    txb.transferObjects([mintedCoin], txb.pure(allocation.address));
    
    // Sign and execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: adminKeypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    transactions.push(result);
    console.log(`Transaction success: ${result.digest}`);
    
    // Deduct from remaining amount
    remainingAmount -= currentMintAmount;
    
    // If still have remaining, wait a bit before next transaction to avoid rate limits
    if (remainingAmount > 0) {
      console.log(`Remaining: ${remainingAmount.toLocaleString()} tokens`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return transactions;
}

// Main execution function
async function executeDistribution() {
  try {
    // Validate environment variables
    validateConfig();
    
    // Initialize client
    const { client, adminKeypair } = await initClient();
    
    console.log('======================================');
    console.log('HETRACOIN TOKEN DISTRIBUTION');
    console.log('======================================');
    console.log(`Network: ${config.network}`);
    console.log(`Total Supply: ${INITIAL_SUPPLY.toLocaleString()} tokens`);
    console.log(`Admin Address: ${config.adminAddress}`);
    
    // Distribution log for verification
    const distributionLog: DistributionLog = {
      timestamp: new Date().toISOString(),
      network: config.network,
      totalSupply: INITIAL_SUPPLY,
      distributions: [],
      transactions: []
    };
    
    // Process each allocation
    for (const key of Object.keys(DISTRIBUTION)) {
      const allocation = DISTRIBUTION[key];
      
      const txResults = await mintTokens(client, adminKeypair, allocation);
      
      distributionLog.distributions.push({
        type: allocation.description,
        percentage: allocation.percentage,
        amount: allocation.amount,
        recipient: allocation.address,
        transactionCount: txResults.length
      });
      
      distributionLog.transactions.push(...txResults.map(tx => tx.digest));
      
      console.log(`Completed ${allocation.description} distribution`);
    }
    
    // Save distribution log to file
    const logFile = path.join(__dirname, 'distribution-log.json');
    fs.writeFileSync(logFile, JSON.stringify(distributionLog, null, 2));
    console.log(`\nDistribution log saved to ${logFile}`);
    
    console.log('\n======================================');
    console.log('DISTRIBUTION COMPLETE');
    console.log('======================================');
    
  } catch (error) {
    console.error('Error executing distribution:', error);
  }
}

// Run the distribution
executeDistribution().catch(console.error); 