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
 * Change the admin of HetraCoin
 * 
 * @param newAdminAddress - Address of the new admin
 * @returns Transaction digest
 */
export async function changeAdmin(newAdminAddress: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const treasuryCapId = process.env.TREASURY_CAP_ID;
    const adminCapId = process.env.ADMIN_CAP_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;

    if (!packageId || !treasuryCapId || !adminCapId || !adminRegistryId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID, TREASURY_CAP_ID, ADMIN_CAP_ID, and ADMIN_REGISTRY_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nChanging admin from ${sender} to ${newAdminAddress}`);
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
export async function getCurrentAdmin(): Promise<string> {
  try {
    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;

    if (!packageId || !adminRegistryId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and ADMIN_REGISTRY_ID are set in .env file');
    }
    
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
export async function transferAdminCap(newAdminAddress: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get admin cap ID from environment variables
    const adminCapId = process.env.ADMIN_CAP_ID;

    if (!adminCapId) {
      throw new Error('Missing required environment variable. Make sure ADMIN_CAP_ID is set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nTransferring admin cap from ${sender} to ${newAdminAddress}`);
    console.log(`Using AdminCap ID: ${adminCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the admin cap
    txb.transferObjects([txb.object(adminCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
      },
    });
    
    console.log('\nAdmin cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
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
export async function transferTreasuryCap(newAdminAddress: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get treasury cap ID from environment variables
    const treasuryCapId = process.env.TREASURY_CAP_ID;

    if (!treasuryCapId) {
      throw new Error('Missing required environment variable. Make sure TREASURY_CAP_ID is set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nTransferring treasury cap from ${sender} to ${newAdminAddress}`);
    console.log(`Using TreasuryCap ID: ${treasuryCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the treasury cap
    txb.transferObjects([txb.object(treasuryCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
      },
    });
    
    console.log('\nTreasury cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
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
export async function transferUpgradeCap(newAdminAddress: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get upgrade cap ID from environment variables
    const upgradeCapId = process.env.UPGRADE_CAP_ID;

    if (!upgradeCapId) {
      throw new Error('Missing required environment variable. Make sure UPGRADE_CAP_ID is set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nTransferring upgrade cap from ${sender} to ${newAdminAddress}`);
    console.log(`Using UpgradeCap ID: ${upgradeCapId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Transfer the upgrade cap
    txb.transferObjects([txb.object(upgradeCapId)], txb.pure(newAdminAddress));
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
      },
    });
    
    console.log('\nUpgrade cap transfer transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    return result.digest;
  } catch (error) {
    console.error('Error transferring upgrade cap:', error);
    throw error;
  }
}

// Interactive CLI for changing admin
async function interactiveChangeAdmin(rl: readline.Interface) {
  console.log('=== HetraCoin Change Admin ===');
  
  try {
    // Get current admin first
    const currentAdmin = await getCurrentAdmin();
    
    console.log(`\nCurrent admin address: ${currentAdmin}`);
    
    // Get wallet address
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`Current wallet address: ${address}`);
    
    // NOTE: We've removed the check that forces wallet address to match current admin
    // Let the contract decide if the operation is allowed
    
    // Ask for new admin address
    const newAdminAddress = await promptUser(rl, '\nEnter the new admin address (0x...): ');
    
    if (!newAdminAddress.startsWith('0x') || newAdminAddress.length < 20) {
      console.error('Error: Invalid address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nAdmin Change Details:');
    console.log(`  Current admin: ${currentAdmin}`);
    console.log(`  New admin: ${newAdminAddress}`);
    
    const confirm = await promptUser(rl, '\nWARNING: This will change the admin. The current admin will lose control. Confirm? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Admin change cancelled.');
      rl.close();
      return;
    }
    
    // Execute admin change
    await changeAdmin(newAdminAddress);
    
    console.log('\nAdmin change completed successfully!');
  } catch (error) {
    console.error(`\nError during admin change: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for transferring admin cap
async function interactiveTransferAdminCap(rl: readline.Interface) {
  console.log('=== HetraCoin Transfer Admin Cap ===');
  
  try {
    // Get wallet address
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nCurrent wallet address: ${address}`);
    
    // Get the admin cap ID from environment
    const adminCapId = process.env.ADMIN_CAP_ID;
    if (!adminCapId) {
      throw new Error('ADMIN_CAP_ID not found in .env file');
    }
    
    console.log(`Admin Cap ID: ${adminCapId}`);
    
    // Ask for new admin address
    const newAdminAddress = await promptUser(rl, '\nEnter the address to transfer the admin cap to (0x...): ');
    
    if (!newAdminAddress.startsWith('0x') || newAdminAddress.length < 20) {
      console.error('Error: Invalid address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nAdmin Cap Transfer Details:');
    console.log(`  From: ${address}`);
    console.log(`  To: ${newAdminAddress}`);
    
    const confirm = await promptUser(rl, '\nWARNING: This will transfer the admin cap to another address. The current holder will lose control. Confirm? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Admin cap transfer cancelled.');
      rl.close();
      return;
    }
    
    // Execute admin cap transfer
    await transferAdminCap(newAdminAddress);
    
    console.log('\nAdmin cap transfer completed successfully!');
  } catch (error) {
    console.error(`\nError during admin cap transfer: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for transferring treasury cap
async function interactiveTransferTreasuryCap(rl: readline.Interface) {
  console.log('=== HetraCoin Transfer Treasury Cap ===');
  
  try {
    // Get wallet address
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nCurrent wallet address: ${address}`);
    
    // Get the treasury cap ID from environment
    const treasuryCapId = process.env.TREASURY_CAP_ID;
    if (!treasuryCapId) {
      throw new Error('TREASURY_CAP_ID not found in .env file');
    }
    
    console.log(`Treasury Cap ID: ${treasuryCapId}`);
    
    // Ask for new admin address
    const newAdminAddress = await promptUser(rl, '\nEnter the address to transfer the treasury cap to (0x...): ');
    
    if (!newAdminAddress.startsWith('0x') || newAdminAddress.length < 20) {
      console.error('Error: Invalid address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nTreasury Cap Transfer Details:');
    console.log(`  From: ${address}`);
    console.log(`  To: ${newAdminAddress}`);
    
    const confirm = await promptUser(rl, '\nWARNING: This will transfer the treasury cap to another address. The current holder will lose control over minting and burning tokens. Confirm? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Treasury cap transfer cancelled.');
      rl.close();
      return;
    }
    
    // Execute treasury cap transfer
    await transferTreasuryCap(newAdminAddress);
    
    console.log('\nTreasury cap transfer completed successfully!');
  } catch (error) {
    console.error(`\nError during treasury cap transfer: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for transferring upgrade cap
async function interactiveTransferUpgradeCap(rl: readline.Interface) {
  console.log('=== HetraCoin Transfer Upgrade Cap ===');
  
  try {
    // Get wallet address
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nCurrent wallet address: ${address}`);
    
    // Get the upgrade cap ID from environment
    const upgradeCapId = process.env.UPGRADE_CAP_ID;
    if (!upgradeCapId) {
      throw new Error('UPGRADE_CAP_ID not found in .env file');
    }
    
    console.log(`Upgrade Cap ID: ${upgradeCapId}`);
    
    // Ask for new admin address
    const newAdminAddress = await promptUser(rl, '\nEnter the address to transfer the upgrade cap to (0x...): ');
    
    if (!newAdminAddress.startsWith('0x') || newAdminAddress.length < 20) {
      console.error('Error: Invalid address. Must start with 0x and be a valid Sui address.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nUpgrade Cap Transfer Details:');
    console.log(`  From: ${address}`);
    console.log(`  To: ${newAdminAddress}`);
    
    const confirm = await promptUser(rl, '\nWARNING: This will transfer the upgrade cap to another address. The current holder will lose control over package upgrades. Confirm? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Upgrade cap transfer cancelled.');
      rl.close();
      return;
    }
    
    // Execute upgrade cap transfer
    await transferUpgradeCap(newAdminAddress);
    
    console.log('\nUpgrade cap transfer completed successfully!');
  } catch (error) {
    console.error(`\nError during upgrade cap transfer: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for checking admin
async function interactiveGetAdmin(rl: readline.Interface) {
  console.log('=== HetraCoin Admin Check ===');
  
  try {
    const adminAddress = await getCurrentAdmin();
    console.log(`\nCurrent admin address: ${adminAddress}`);
    
    // Get wallet address to check if it matches
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (privateKey) {
      const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
      const walletAddress = keypair.getPublicKey().toSuiAddress();
      
      console.log(`Current wallet address: ${walletAddress}`);
      console.log(`Is wallet the admin?: ${walletAddress === adminAddress ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    console.error(`\nError checking admin: ${error}`);
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
      
      console.log('=== HetraCoin Admin Controls ===');
      console.log('1. Check current admin');
      console.log('2. Change admin');
      console.log('3. Transfer admin cap');
      console.log('4. Transfer treasury cap');
      console.log('5. Transfer upgrade cap');
      
      const choice = await promptUser(menuRL, '\nSelect an operation (1-5): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for admin check
          const checkRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveGetAdmin(checkRL);
          break;
          
        case '2':
          // Create a new readline for admin change
          const changeRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveChangeAdmin(changeRL);
          break;
          
        case '3':
          // Create a new readline for admin cap transfer
          const transferRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveTransferAdminCap(transferRL);
          break;
          
        case '4':
          // Create a new readline for treasury cap transfer
          const transferTreasuryRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveTransferTreasuryCap(transferTreasuryRL);
          break;
          
        case '5':
          // Create a new readline for upgrade cap transfer
          const transferUpgradeRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveTransferUpgradeCap(transferUpgradeRL);
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    const command = args[0];

    switch (command) {
      case 'change-admin':
        if (args.length < 2) {
          console.log('Please provide the new admin address');
          process.exit(1);
        }
        changeAdmin(args[1])
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'transfer-cap':
        if (args.length < 2) {
          console.log('Please provide the new admin address to transfer the admin cap to');
          process.exit(1);
        }
        transferAdminCap(args[1])
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'transfer-treasury-cap':
        if (args.length < 2) {
          console.log('Please provide the new admin address to transfer the treasury cap to');
          process.exit(1);
        }
        transferTreasuryCap(args[1])
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'transfer-upgrade-cap':
        if (args.length < 2) {
          console.log('Please provide the new admin address to transfer the upgrade cap to');
          process.exit(1);
        }
        transferUpgradeCap(args[1])
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'get-admin':
        getCurrentAdmin()
          .then(admin => {
            console.log(`Current admin address: ${admin}`);
            process.exit(0);
          })
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      default:
        console.log('Usage:');
        console.log('  Interactive mode: npx ts-node admin.ts');
        console.log('  Command-line mode:');
        console.log('    npx ts-node admin.ts change-admin <new_admin_address>');
        console.log('    npx ts-node admin.ts transfer-cap <new_admin_address>');
        console.log('    npx ts-node admin.ts transfer-treasury-cap <new_admin_address>');
        console.log('    npx ts-node admin.ts transfer-upgrade-cap <new_admin_address>');
        console.log('    npx ts-node admin.ts get-admin');
        process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node admin.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node admin.ts change-admin <new_admin_address>');
    console.log('    npx ts-node admin.ts transfer-cap <new_admin_address>');
    console.log('    npx ts-node admin.ts transfer-treasury-cap <new_admin_address>');
    console.log('    npx ts-node admin.ts transfer-upgrade-cap <new_admin_address>');
    console.log('    npx ts-node admin.ts get-admin');
    process.exit(1);
  }
} 