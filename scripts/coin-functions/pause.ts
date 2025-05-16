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
 * Pause HetraCoin operations with a reason
 * 
 * @param reason - Reason for pausing operations
 * @returns Transaction digest
 */
export async function pauseOperations(reason: string): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !adminRegistryId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID, ADMIN_REGISTRY_ID, and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nPausing HetraCoin operations with reason: "${reason}"`);
    console.log(`Admin address: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Admin Registry ID: ${adminRegistryId}`);
    console.log(`Using Pause State ID: ${pauseStateId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the pause_operations function on the HetraCoin module
    txb.moveCall({
      target: `${packageId}::HetraCoin::pause_operations`,
      arguments: [
        txb.object(adminRegistryId),
        txb.object(pauseStateId),
        txb.pure(Buffer.from(reason).toString('hex')),
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
    
    console.log('\nPause transaction successful!');
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
    console.error('Error pausing HetraCoin operations:', error);
    throw error;
  }
}

/**
 * Unpause HetraCoin operations
 * 
 * @returns Transaction digest
 */
export async function unpauseOperations(): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !adminRegistryId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID, ADMIN_REGISTRY_ID, and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nUnpausing HetraCoin operations`);
    console.log(`Admin address: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Admin Registry ID: ${adminRegistryId}`);
    console.log(`Using Pause State ID: ${pauseStateId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the unpause_operations function on the HetraCoin module
    txb.moveCall({
      target: `${packageId}::HetraCoin::unpause_operations`,
      arguments: [
        txb.object(adminRegistryId),
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
    
    console.log('\nUnpause transaction successful!');
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
    console.error('Error unpausing HetraCoin operations:', error);
    throw error;
  }
}

/**
 * Check if HetraCoin operations are paused
 * 
 * @returns Object with pause status and reason
 */
export async function checkPauseStatus() {
  try {
    // Get package ID and pause state ID from environment variables
    const packageId = process.env.PACKAGE_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Pause State ID: ${pauseStateId}`);
    
    // Get pause state object
    const pauseState = await client.getObject({
      id: pauseStateId,
      options: {
        showContent: true,
      },
    });
    
    if (!pauseState.data || !pauseState.data.content) {
      throw new Error('Could not fetch pause state data');
    }
    
    const content = pauseState.data.content;
    
    if (content.dataType !== 'moveObject') {
      throw new Error('Unexpected data type for pause state');
    }
    
    const fields = content.fields as any;
    const isPaused = fields.paused;
    const pauseReason = fields.pause_reason ? 
      new TextDecoder().decode(new Uint8Array(fields.pause_reason)) : '';
    const pausedAt = fields.paused_at;
    const pausedBy = fields.paused_by;
    
    return {
      isPaused,
      pauseReason,
      pausedAt,
      pausedBy,
      lastUpdated: fields.last_updated,
    };
  } catch (error) {
    console.error('Error checking pause status:', error);
    throw error;
  }
}

// Interactive CLI for pausing operations
async function interactivePause(rl: readline.Interface) {
  console.log('=== HetraCoin Pause Operations ===');
  
  try {
    // Check current status first
    const status = await checkPauseStatus();
    
    console.log('\nCurrent status:');
    console.log(`  Paused: ${status.isPaused ? 'YES' : 'NO'}`);
    
    if (status.isPaused) {
      console.log(`  Reason: ${status.pauseReason}`);
      console.log(`  Paused at epoch: ${status.pausedAt}`);
      console.log(`  Paused by: ${status.pausedBy}`);
      
      console.log('\nThe system is already paused.');
      const proceed = await promptUser(rl, 'Would you like to provide a new pause reason? (yes/no): ');
      
      if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
    }
    
    // Ask for reason
    const reason = await promptUser(rl, '\nEnter reason for pausing operations: ');
    
    if (!reason || reason.trim().length === 0) {
      console.error('Error: A reason must be provided for pausing operations.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nPause Details:');
    console.log(`  Reason: ${reason}`);
    
    const confirm = await promptUser(rl, '\nWARNING: This will halt all transfers and minting. Confirm pause? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Pause operation cancelled.');
      rl.close();
      return;
    }
    
    // Execute pause
    await pauseOperations(reason);
    
    console.log('\nPause operation completed successfully!');
  } catch (error) {
    console.error(`\nError during pause operation: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for unpausing operations
async function interactiveUnpause(rl: readline.Interface) {
  console.log('=== HetraCoin Unpause Operations ===');
  
  try {
    // Check current status first
    const status = await checkPauseStatus();
    
    console.log('\nCurrent status:');
    console.log(`  Paused: ${status.isPaused ? 'YES' : 'NO'}`);
    
    if (status.isPaused) {
      console.log(`  Reason: ${status.pauseReason}`);
      console.log(`  Paused at epoch: ${status.pausedAt}`);
      console.log(`  Paused by: ${status.pausedBy}`);
    } else {
      console.log('\nThe system is not currently paused.');
      console.log('Nothing to do.');
      rl.close();
      return;
    }
    
    // Confirmation
    const confirm = await promptUser(rl, '\nConfirm unpause operation? This will resume all transfers and minting. (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Unpause operation cancelled.');
      rl.close();
      return;
    }
    
    // Execute unpause
    await unpauseOperations();
    
    console.log('\nUnpause operation completed successfully!');
  } catch (error) {
    console.error(`\nError during unpause operation: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for checking pause status
async function interactiveCheckStatus(rl: readline.Interface) {
  console.log('=== HetraCoin Pause Status Check ===');
  
  try {
    const status = await checkPauseStatus();
    
    console.log('\nCurrent HetraCoin status:');
    console.log(`  Paused: ${status.isPaused ? 'YES' : 'NO'}`);
    
    if (status.isPaused) {
      console.log(`  Reason: ${status.pauseReason}`);
      console.log(`  Paused at epoch: ${status.pausedAt}`);
      console.log(`  Paused by: ${status.pausedBy}`);
    }
    
    console.log(`  Last updated at epoch: ${status.lastUpdated}`);
  } catch (error) {
    console.error(`\nError checking status: ${error}`);
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
      
      console.log('=== HetraCoin Pause Controls ===');
      console.log('1. Check current pause status');
      console.log('2. Pause operations');
      console.log('3. Unpause operations');
      
      const choice = await promptUser(menuRL, '\nSelect an operation (1-3): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for status check
          const statusRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveCheckStatus(statusRL);
          break;
          
        case '2':
          // Create a new readline for pause operation
          const pauseRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactivePause(pauseRL);
          break;
          
        case '3':
          // Create a new readline for unpause operation
          const unpauseRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveUnpause(unpauseRL);
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    const command = args[0];

    switch (command) {
      case 'pause':
        if (args.length < 2) {
          console.log('Please provide a reason for pausing operations');
          process.exit(1);
        }
        pauseOperations(args[1])
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'unpause':
        unpauseOperations()
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'status':
        checkPauseStatus()
          .then(status => {
            console.log('HetraCoin pause status:');
            console.log(`Paused: ${status.isPaused}`);
            if (status.isPaused) {
              console.log(`Reason: ${status.pauseReason}`);
              console.log(`Paused at epoch: ${status.pausedAt}`);
              console.log(`Paused by: ${status.pausedBy}`);
            }
            console.log(`Last updated at epoch: ${status.lastUpdated}`);
            process.exit(0);
          })
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      default:
        console.log('Usage:');
        console.log('  Interactive mode: npx ts-node pause.ts');
        console.log('  Command-line mode:');
        console.log('    npx ts-node pause.ts pause "reason for pausing"');
        console.log('    npx ts-node pause.ts unpause');
        console.log('    npx ts-node pause.ts status');
        process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node pause.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node pause.ts pause "reason for pausing"');
    console.log('    npx ts-node pause.ts unpause');
    console.log('    npx ts-node pause.ts status');
    process.exit(1);
  }
} 