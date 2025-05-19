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
 * Change the admin of HetraCoin
 * 
 * @param newAdminAddress - Address of the new admin
 * @returns Transaction digest
 */
async function changeAdmin(newAdminAddress: string): Promise<string> {
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
    const adminCapId = config.adminCapAddress;
    const adminRegistryId = config.adminRegistryAddress;

    if (!packageId || !treasuryCapId || !adminCapId || !adminRegistryId) {
      throw new Error(`Missing required configuration. Make sure the following are set for ${config.network}:
      - PACKAGE_ID
      - TREASURY_CAP_ADDRESS
      - ADMIN_CAP_ADDRESS
      - ADMIN_REGISTRY_ADDRESS`);
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
    
    console.log(`\nChanging admin on ${config.network}`);
    console.log(`From: ${sender}`);
    console.log(`To: ${newAdminAddress}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using AdminCap ID: ${adminCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the change_admin function on the HetraCoin module
    txb.moveCall({
      target: `${packageId}::HetraCoin::change_admin`,
      arguments: [
        txb.object(treasuryCapId),
        txb.object(adminCapId),
        txb.object(adminRegistryId),
        txb.pure(newAdminAddress),
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
    
    console.log('\nAdmin change transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    // Display explorer URL
    const explorer = config.network === 'mainnet'
      ? 'https://explorer.sui.io/txblock'
      : 'https://explorer.testnet.sui.io/txblock';
    console.log(`Explorer URL: ${explorer}/${result.digest}?network=${config.network}`);
    
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
    console.error('Error changing HetraCoin admin:', error);
    throw error;
  }
}

/**
 * Get current admin information
 * 
 * @returns Current admin address
 */
async function getCurrentAdmin(): Promise<string> {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    // Get package ID and object IDs from environment
    const packageId = config.packageId;
    const adminRegistryId = config.adminRegistryAddress;

    if (!packageId || !adminRegistryId) {
      throw new Error(`Missing required configuration. Make sure the following are set for ${config.network}:
      - PACKAGE_ID
      - ADMIN_REGISTRY_ADDRESS`);
    }
    
    // Initialize client with network-specific RPC URL
    const client = new SuiClient({ url: config.rpcUrl });
    
    console.log(`Getting current admin on ${config.network}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using AdminRegistry ID: ${adminRegistryId}`);
    
    // Create transaction block for readonly transaction
    const txb = new TransactionBlock();
    
    // Call the governance_admin function (not get_admin)
    txb.moveCall({
      target: `${packageId}::HetraCoin::governance_admin`,
      arguments: [txb.object(adminRegistryId)],
    });
    
    // Set transaction as readonly (pure)
    const result = await client.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    // Parse the result to extract the admin address
    if (result.results && result.results[0] && result.results[0].returnValues) {
      // Extract address bytes and convert to proper 0x format
      const addressBytes = result.results[0].returnValues[0][0];
      if (Array.isArray(addressBytes)) {
        // Convert array of bytes to hex string
        const addressHex = Array.from(addressBytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
        return `0x${addressHex}`;
      }
      
      // Fallback if format is different than expected
      return String(addressBytes);
    }
    
    throw new Error('Failed to get admin address');
  } catch (error) {
    console.error('Error getting admin:', error);
    throw error;
  }
}

/**
 * Transfer admin cap to a new address
 * 
 * @param newAdminAddress - Address to transfer admin cap to
 * @returns Transaction digest
 */
async function transferAdminCap(newAdminAddress: string): Promise<string> {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    // Validate required configuration
    if (!config.deployerPrivateKey) {
      throw new Error('Deployer private key not found in environment variables');
    }

    // Get admin cap ID from environment variables
    const adminCapId = config.adminCapAddress;

    if (!adminCapId) {
      throw new Error(`Missing required configuration. Make sure ADMIN_CAP_ADDRESS is set for ${config.network}`);
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
    
    console.log(`\nTransferring admin cap on ${config.network}`);
    console.log(`From: ${sender}`);
    console.log(`To: ${newAdminAddress}`);
    console.log(`Using AdminCap ID: ${adminCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the admin cap directly
    txb.transferObjects([txb.object(adminCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nAdmin cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    // Display explorer URL
    const explorer = config.network === 'mainnet'
      ? 'https://explorer.sui.io/txblock'
      : 'https://explorer.testnet.sui.io/txblock';
    console.log(`Explorer URL: ${explorer}/${result.digest}?network=${config.network}`);
    
    return result.digest;
  } catch (error) {
    console.error('Error transferring admin cap:', error);
    throw error;
  }
}

/**
 * Transfer treasury cap to a new address
 * 
 * @param newAdminAddress - Address to transfer treasury cap to
 * @returns Transaction digest
 */
async function transferTreasuryCap(newAdminAddress: string): Promise<string> {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    // Validate required configuration
    if (!config.deployerPrivateKey) {
      throw new Error('Deployer private key not found in environment variables');
    }

    // Get treasury cap ID from environment
    const treasuryCapId = config.treasuryCapAddress;

    if (!treasuryCapId) {
      throw new Error(`Missing required configuration. Make sure TREASURY_CAP_ADDRESS is set for ${config.network}`);
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
    
    console.log(`\nTransferring treasury cap on ${config.network}`);
    console.log(`From: ${sender}`);
    console.log(`To: ${newAdminAddress}`);
    console.log(`Using TreasuryCap ID: ${treasuryCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the treasury cap directly
    txb.transferObjects([txb.object(treasuryCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nTreasury cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    // Display explorer URL
    const explorer = config.network === 'mainnet'
      ? 'https://explorer.sui.io/txblock'
      : 'https://explorer.testnet.sui.io/txblock';
    console.log(`Explorer URL: ${explorer}/${result.digest}?network=${config.network}`);
    
    return result.digest;
  } catch (error) {
    console.error('Error transferring treasury cap:', error);
    throw error;
  }
}

/**
 * Transfer upgrade cap to a new address
 * 
 * @param newAdminAddress - Address to transfer upgrade cap to
 * @returns Transaction digest
 */
async function transferUpgradeCap(newAdminAddress: string): Promise<string> {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    // Validate required configuration
    if (!config.deployerPrivateKey) {
      throw new Error('Deployer private key not found in environment variables');
    }

    // Get upgrade cap ID from environment
    const upgradeCapId = config.upgradeCapId;

    if (!upgradeCapId) {
      throw new Error(`Missing required configuration. Make sure UPGRADE_CAP_ID is set for ${config.network}`);
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
    
    console.log(`\nTransferring upgrade cap on ${config.network}`);
    console.log(`From: ${sender}`);
    console.log(`To: ${newAdminAddress}`);
    console.log(`Using UpgradeCap ID: ${upgradeCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the upgrade cap directly
    txb.transferObjects([txb.object(upgradeCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nUpgrade cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    // Display explorer URL
    const explorer = config.network === 'mainnet'
      ? 'https://explorer.sui.io/txblock'
      : 'https://explorer.testnet.sui.io/txblock';
    console.log(`Explorer URL: ${explorer}/${result.digest}?network=${config.network}`);
    
    return result.digest;
  } catch (error) {
    console.error('Error transferring upgrade cap:', error);
    throw error;
  }
}

/**
 * Interactive function to change admin
 */
async function interactiveChangeAdmin(rl: readline.Interface) {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    console.log('=== HetraCoin Admin Change Tool ===');
    console.log(`Network: ${config.network.toUpperCase()}`);
    
    // Get current admin
    const currentAdmin = await getCurrentAdmin();
    console.log(`Current admin: ${currentAdmin}`);
    
    // Ask for new admin address
    const newAdmin = await promptUser(rl, 'Enter the new admin address: ');
    
    if (!newAdmin.startsWith('0x')) {
      console.error('Invalid Sui address. Address should start with 0x');
      return;
    }
    
    // Confirm change
    const confirm = await promptUser(rl, `\nReady to change admin from ${currentAdmin} to ${newAdmin} on ${config.network}. Proceed? (y/n): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Admin change cancelled.');
      return;
    }
    
    // Execute admin change
    const txDigest = await changeAdmin(newAdmin);
    console.log(`\nAdmin change completed. Transaction digest: ${txDigest}`);
    
  } catch (error) {
    console.error('Error during admin change:', error);
  }
}

/**
 * Interactive function to transfer admin cap
 */
async function interactiveTransferAdminCap(rl: readline.Interface) {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    console.log('=== HetraCoin Admin Cap Transfer Tool ===');
    console.log(`Network: ${config.network.toUpperCase()}`);
    
    // Check if admin cap ID is set
    if (!config.adminCapAddress) {
      console.error(`ADMIN_CAP_ADDRESS not found in environment for ${config.network}`);
      return;
    }
    
    console.log(`Admin Cap ID: ${config.adminCapAddress}`);
    
    // Ask for new admin address
    const newAdmin = await promptUser(rl, 'Enter the recipient address for the admin cap: ');
    
    if (!newAdmin.startsWith('0x')) {
      console.error('Invalid Sui address. Address should start with 0x');
      return;
    }
    
    // Confirm transfer
    const confirm = await promptUser(rl, `\nReady to transfer admin cap to ${newAdmin} on ${config.network}. Proceed? (y/n): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Admin cap transfer cancelled.');
      return;
    }
    
    // Execute admin cap transfer
    const txDigest = await transferAdminCap(newAdmin);
    console.log(`\nAdmin cap transfer completed. Transaction digest: ${txDigest}`);
    
  } catch (error) {
    console.error('Error during admin cap transfer:', error);
  }
}

/**
 * Interactive function to transfer treasury cap
 */
async function interactiveTransferTreasuryCap(rl: readline.Interface) {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    console.log('=== HetraCoin Treasury Cap Transfer Tool ===');
    console.log(`Network: ${config.network.toUpperCase()}`);
    
    // Check if treasury cap ID is set
    if (!config.treasuryCapAddress) {
      console.error(`TREASURY_CAP_ADDRESS not found in environment for ${config.network}`);
      return;
    }
    
    console.log(`Treasury Cap ID: ${config.treasuryCapAddress}`);
    
    // Ask for new admin address
    const newAdmin = await promptUser(rl, 'Enter the recipient address for the treasury cap: ');
    
    if (!newAdmin.startsWith('0x')) {
      console.error('Invalid Sui address. Address should start with 0x');
      return;
    }
    
    // Confirm transfer
    const confirm = await promptUser(rl, `\nWARNING: Transferring the treasury cap will give the recipient full control over token minting!\nReady to transfer treasury cap to ${newAdmin} on ${config.network}. Proceed? (y/n): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Treasury cap transfer cancelled.');
      return;
    }
    
    // Execute treasury cap transfer
    const txDigest = await transferTreasuryCap(newAdmin);
    console.log(`\nTreasury cap transfer completed. Transaction digest: ${txDigest}`);
    
  } catch (error) {
    console.error('Error during treasury cap transfer:', error);
  }
}

/**
 * Interactive function to transfer upgrade cap
 */
async function interactiveTransferUpgradeCap(rl: readline.Interface) {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    console.log('=== HetraCoin Upgrade Cap Transfer Tool ===');
    console.log(`Network: ${config.network.toUpperCase()}`);
    
    // Check if upgrade cap ID is set
    if (!config.upgradeCapId) {
      console.error(`UPGRADE_CAP_ID not found in environment for ${config.network}`);
      return;
    }
    
    console.log(`Upgrade Cap ID: ${config.upgradeCapId}`);
    
    // Ask for new admin address
    const newAdmin = await promptUser(rl, 'Enter the recipient address for the upgrade cap: ');
    
    if (!newAdmin.startsWith('0x')) {
      console.error('Invalid Sui address. Address should start with 0x');
      return;
    }
    
    // Confirm transfer
    const confirm = await promptUser(rl, `\nWARNING: Transferring the upgrade cap will give the recipient full control over contract upgrades!\nReady to transfer upgrade cap to ${newAdmin} on ${config.network}. Proceed? (y/n): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Upgrade cap transfer cancelled.');
      return;
    }
    
    // Execute upgrade cap transfer
    const txDigest = await transferUpgradeCap(newAdmin);
    console.log(`\nUpgrade cap transfer completed. Transaction digest: ${txDigest}`);
    
  } catch (error) {
    console.error('Error during upgrade cap transfer:', error);
  }
}

/**
 * Interactive function to get current admin
 */
async function interactiveGetAdmin(rl: readline.Interface) {
  try {
    // Get network configuration
    const config = networkConfig.getNetworkConfig();
    
    console.log('=== HetraCoin Admin Info Tool ===');
    console.log(`Network: ${config.network.toUpperCase()}`);
    
    // Get current admin
    const adminAddress = await getCurrentAdmin();
    
    console.log(`\nCurrent admin address: ${adminAddress}`);
    
    // Display explorer URL
    const explorer = config.network === 'mainnet'
      ? 'https://explorer.sui.io/address'
      : 'https://explorer.testnet.sui.io/address';
    console.log(`Explorer URL: ${explorer}/${adminAddress}?network=${config.network}`);
    
  } catch (error) {
    console.error('Error getting admin info:', error);
  }
}

// Interactive CLI execution
if (require.main === module) {
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Get network configuration for display
  const config = networkConfig.getNetworkConfig();
  
  console.log('=== HetraCoin Admin CLI ===');
  console.log(`Network: ${config.network.toUpperCase()}`);
  console.log('1. Change admin');
  console.log('2. Transfer admin cap');
  console.log('3. Transfer treasury cap');
  console.log('4. Transfer upgrade cap');
  console.log('5. Get current admin info');
  console.log('0. Exit');
  
  promptUser(rl, '\nEnter choice (0-5): ').then(async (choice) => {
    try {
      switch (choice) {
        case '1':
          await interactiveChangeAdmin(rl);
          break;
        case '2':
          await interactiveTransferAdminCap(rl);
          break;
        case '3':
          await interactiveTransferTreasuryCap(rl);
          break;
        case '4':
          await interactiveTransferUpgradeCap(rl);
          break;
        case '5':
          await interactiveGetAdmin(rl);
          break;
        case '0':
          console.log('Exiting...');
          break;
        default:
          console.log('Invalid choice');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      rl.close();
    }
  });
}

export {
  changeAdmin,
  getCurrentAdmin,
  transferAdminCap,
  transferTreasuryCap,
  transferUpgradeCap
}; 