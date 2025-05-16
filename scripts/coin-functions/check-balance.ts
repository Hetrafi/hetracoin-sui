import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

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
 * Find HetraCoin tokens owned by an address
 * 
 * @param address - Address to check for coin objects
 * @returns Array of coin objects with their IDs and balances
 */
async function findHetraCoinObjects(address: string) {
  try {
    // Get package ID from environment variables
    const packageId = process.env.PACKAGE_ID;
    if (!packageId) {
      throw new Error('PACKAGE_ID not found in .env file');
    }
    
    // Get the coin type
    const coinType = `${packageId}::HetraCoin::HETRACOIN`;
    
    // Get coins for the address
    const coins = await client.getCoins({
      owner: address,
      coinType: coinType,
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

/**
 * Check and display balances for an address
 * 
 * @param address - Address to check for HETRA balances
 */
async function checkBalance(address: string) {
  try {
    console.log(`Checking HetraCoin balance for address: ${address}`);
    
    // Get package ID from environment variables
    const packageId = process.env.PACKAGE_ID;
    if (!packageId) {
      throw new Error('PACKAGE_ID not found in .env file');
    }
    
    const coins = await findHetraCoinObjects(address);
    
    if (coins.length === 0) {
      console.log('No HetraCoin objects found for this address.');
      return;
    }
    
    console.log('\nHetraCoin objects:');
    
    let totalBalance = BigInt(0);
    
    coins.forEach((coin, index) => {
      // Raw balance (base units)
      const rawBalance = coin.balance;
      
      // Display balance (tokens with 9 decimals)
      const displayBalance = Number(coin.balance) / 1e9;
      
      console.log(`\n[${index + 1}] Coin ID: ${coin.id}`);
      console.log(`    Raw Balance: ${formatNumber(rawBalance)} base units`);
      console.log(`    Token Balance: ${formatNumber(displayBalance)} HETRA tokens`);
      
      // Add to total
      totalBalance += coin.balance;
    });
    
    // Calculate totals
    const totalTokenBalance = Number(totalBalance) / 1e9;
    
    console.log('\n----- BALANCE SUMMARY -----');
    console.log(`Total HETRA coins: ${coins.length} objects`);
    console.log(`Total raw balance: ${formatNumber(totalBalance)} base units`);
    console.log(`Total token balance: ${formatNumber(totalTokenBalance)} HETRA tokens`);
    console.log('---------------------------');
    
    console.log('\nNote: 1 HETRA token = 1,000,000,000 base units (9 decimals)');
    
  } catch (error) {
    console.error(`Error checking balance: ${error}`);
    throw error;
  }
}

/**
 * Interactive CLI for checking balances
 */
async function interactiveCheckBalance(rl: readline.Interface) {
  console.log('=== HetraCoin Balance Checker ===');
  
  try {
    const address = await promptUser(rl, '\nEnter the address to check (0x...): ');
    
    if (!address.startsWith('0x')) {
      console.error('Error: Invalid address format. Must start with 0x');
      rl.close();
      return;
    }
    
    await checkBalance(address);
  } catch (error) {
    console.error(`\nError checking balance: ${error}`);
  } finally {
    rl.close();
  }
}

/**
 * Interactive CLI for checking your own balance
 */
async function checkOwnBalance(rl: readline.Interface) {
  console.log('=== Check Your HetraCoin Balance ===');
  
  try {
    // Get wallet address from private key
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const address = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nYour address: ${address}`);
    await checkBalance(address);
  } catch (error) {
    console.error(`\nError checking balance: ${error}`);
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
      
      console.log('=== HetraCoin Balance Operations ===');
      console.log('1. Check your balance (using DEPLOYER_PRIVATE_KEY)');
      console.log('2. Check balance for another address');
      
      const choice = await promptUser(menuRL, '\nSelect an operation (1-2): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for own balance check
          const ownBalanceRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          checkOwnBalance(ownBalanceRL);
          break;
          
        case '2':
          // Create a new readline for other address check
          const otherBalanceRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveCheckBalance(otherBalanceRL);
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    // Command-line mode
    const address = args[0];
    
    if (!address.startsWith('0x')) {
      console.error('Error: Invalid address format. Must start with 0x');
      process.exit(1);
    }
    
    checkBalance(address)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(`Error: ${error}`);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node check-balance.ts');
    console.log('  Command-line mode: npx ts-node check-balance.ts <address>');
    process.exit(1);
  }
}

export { checkBalance }; 