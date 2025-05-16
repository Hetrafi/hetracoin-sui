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
 * Burn HetraCoin tokens
 * 
 * @param coinObjectId - ID of the coin object to burn
 * @param amount - Optional amount to burn (in base units). If not provided, burns the entire coin.
 * @returns Transaction digest
 */
export async function burnHetraCoin(coinObjectId: string, amount?: bigint): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
    }

    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const treasuryCapId = process.env.TREASURY_CAP_ID;
    const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

    if (!packageId || !treasuryCapId || !pauseStateId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID, TREASURY_CAP_ID, and EMERGENCY_PAUSE_STATE_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    // Get coin info to log amount being burned
    const coinInfo = await client.getObject({
      id: coinObjectId,
      options: { showContent: true },
    });
    
    if (!coinInfo.data || !coinInfo.data.content) {
      throw new Error('Could not fetch coin data');
    }
    
    const content = coinInfo.data.content;
    if (content.dataType !== 'moveObject') {
      throw new Error('Unexpected data type for coin');
    }
    
    const fields = content.fields as any;
    const coinBalance = BigInt(fields.balance);
    const displayBalance = Number(coinBalance) / 1e9;
    
    // Determine if we're burning the whole coin or just a portion
    const isBurningWholeCoin = !amount || amount >= coinBalance;
    const amountToBurn = isBurningWholeCoin ? coinBalance : amount;
    const displayAmountToBurn = Number(amountToBurn) / 1e9;
    
    if (amountToBurn <= 0) {
      throw new Error('Amount to burn must be greater than 0');
    }
    
    if (amountToBurn > coinBalance) {
      throw new Error(`Insufficient balance. The coin only has ${coinBalance} base units (${displayBalance} HETRA tokens)`);
    }
    
    console.log(`\nBurning ${formatNumber(displayAmountToBurn)} HETRA tokens (${formatNumber(amountToBurn)} base units)`);
    console.log(`From coin object: ${coinObjectId}`);
    console.log(`Sender: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Treasury Cap ID: ${treasuryCapId}`);
    console.log(`Using Pause State ID: ${pauseStateId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    if (isBurningWholeCoin) {
      // Burn the entire coin
      console.log('Burning entire coin object');
      txb.moveCall({
        target: `${packageId}::HetraCoin::burn`,
        arguments: [
          txb.object(treasuryCapId),
          txb.object(pauseStateId),
          txb.object(coinObjectId),
        ],
      });
    } else {
      // Split the coin and burn only the specified amount
      console.log(`Splitting coin and burning ${amountToBurn} base units`);
      
      // Split the coin into the amount to burn and the remainder
      const [coinToBurn] = txb.splitCoins(txb.object(coinObjectId), [txb.pure(amountToBurn)]);
      
      // Burn the split portion
      txb.moveCall({
        target: `${packageId}::HetraCoin::burn`,
        arguments: [
          txb.object(treasuryCapId),
          txb.object(pauseStateId),
          coinToBurn,
        ],
      });
    }
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nBurn transaction successful!');
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
    console.error('Error burning HetraCoin:', error);
    throw error;
  }
}

/**
 * Gets the total supply of HetraCoin
 * 
 * @returns Total supply as BigInt
 */
export async function getTotalSupply(): Promise<bigint> {
  try {
    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const treasuryCapId = process.env.TREASURY_CAP_ID;

    if (!packageId || !treasuryCapId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and TREASURY_CAP_ID are set in .env file');
    }
    
    // Create transaction block for readonly transaction
    const txb = new TransactionBlock();
    
    // Call the total_supply function
    txb.moveCall({
      target: `${packageId}::HetraCoin::total_supply`,
      arguments: [txb.object(treasuryCapId)],
    });
    
    // Set transaction as readonly (pure)
    const result = await client.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    // Parse the result to extract the total supply
    if (result.results && result.results[0] && result.results[0].returnValues) {
      // From the logs, we can see that the structure is:
      // [[0, 0, 193, 111, 242, 134, 35, 0], "u64"]
      
      const returnValue = result.results[0].returnValues[0];
      
      if (Array.isArray(returnValue) && returnValue.length >= 1 && Array.isArray(returnValue[0])) {
        // Extract the byte array (first element)
        const byteArray = returnValue[0];
        
        // For debugging
        console.log('Extracted byte array:', byteArray);
        
        // Convert the array to a single number (little-endian)
        let value = BigInt(0);
        for (let i = 0; i < byteArray.length; i++) {
          value = value + (BigInt(byteArray[i]) << BigInt(8 * i));
        }
        
        console.log('Calculated total supply:', value.toString());
        return value;
      } else {
        throw new Error('Unexpected result format: ' + JSON.stringify(returnValue));
      }
    }
    
    throw new Error('Failed to get total supply');
  } catch (error) {
    console.error('Error getting total supply:', error);
    throw error;
  }
}

/**
 * List all HetraCoin objects owned by the specified address
 * 
 * @param address - The address to check for coin objects
 * @returns Array of coin objects with their IDs and balances
 */
export async function listHetraCoinObjects(address: string) {
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
    console.error('Error listing HetraCoin objects:', error);
    throw error;
  }
}

// Interactive CLI for burning tokens
async function interactiveBurn(rl: readline.Interface) {
  console.log('=== HetraCoin Burn Tool ===');
  
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
    const coins = await listHetraCoinObjects(address);
    
    if (coins.length === 0) {
      console.log('No HetraCoin objects found for this address.');
      rl.close();
      return;
    }
    
    console.log('\nAvailable HetraCoin objects:');
    coins.forEach((coin, index) => {
      const rawBalance = coin.balance;
      const displayBalance = Number(coin.balance) / 1e9;
      console.log(`[${index + 1}] Coin ID: ${coin.id}`);
      console.log(`    Raw Balance: ${formatNumber(rawBalance)} base units`);
      console.log(`    Token Balance: ${formatNumber(displayBalance)} HETRA tokens`);
    });
    
    // Ask user to select a coin
    const selection = await promptUser(rl, '\nEnter the number of the coin to burn from (or coin ID directly): ');
    
    let selectedCoin: string;
    
    // Check if input is a number (index) or a coin ID
    if (/^\d+$/.test(selection) && Number(selection) <= coins.length && Number(selection) > 0) {
      // User entered an index
      const index = Number(selection) - 1;
      selectedCoin = coins[index].id;
    } else if (selection.startsWith('0x')) {
      // User entered a coin ID
      const coinExists = coins.some(coin => coin.id === selection);
      if (!coinExists) {
        console.error('Error: The specified coin ID was not found in your wallet.');
        rl.close();
        return;
      }
      selectedCoin = selection;
    } else {
      console.error('Error: Invalid selection. Please enter a valid number or coin ID.');
      rl.close();
      return;
    }
    
    // Get the coin's balance
    const coinToUse = coins.find(coin => coin.id === selectedCoin);
    if (!coinToUse) {
      console.error('Error: Could not find the selected coin.');
      rl.close();
      return;
    }
    
    const rawBalance = coinToUse.balance;
    const displayBalance = Number(coinToUse.balance) / 1e9;
    
    // Ask if the user wants to burn the entire coin or just a portion
    const burnChoice = await promptUser(rl, '\nDo you want to burn (1) the entire coin or (2) a specific amount? (1/2): ');
    
    let amountToBurn: bigint | undefined;
    
    if (burnChoice === '1') {
      // Burn entire coin
      console.log(`\nYou've chosen to burn the entire coin (${formatNumber(displayBalance)} HETRA tokens)`);
      amountToBurn = undefined; // Undefined means burn the whole coin
    } else if (burnChoice === '2') {
      // Burn partial amount
      const amountInput = await promptUser(rl, `\nEnter the amount of HETRA tokens to burn (max ${formatNumber(displayBalance)}): `);
      
      // Convert token amount to base units
      try {
        // Parse to handle decimal inputs
        if (amountInput.includes('.')) {
          // Handle decimal input
          const [whole, fraction] = amountInput.split('.');
          // Pad the fraction to 9 decimal places
          const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
          // Convert to base units
          amountToBurn = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
        } else {
          // Convert whole number to base units
          amountToBurn = BigInt(amountInput) * BigInt(1_000_000_000);
        }
        
        // Validate amount
        if (amountToBurn <= 0) {
          console.error('Error: Amount must be greater than 0');
          rl.close();
          return;
        }
        
        if (amountToBurn > rawBalance) {
          console.error(`Error: Insufficient balance. The selected coin only has ${formatNumber(displayBalance)} HETRA tokens`);
          rl.close();
          return;
        }
        
        const displayAmountToBurn = Number(amountToBurn) / 1e9;
        console.log(`\nYou've chosen to burn ${formatNumber(displayAmountToBurn)} HETRA tokens (${formatNumber(amountToBurn)} base units)`);
      } catch (e) {
        console.error('Invalid amount. Please enter a valid number.');
        rl.close();
        return;
      }
    } else {
      console.error('Invalid selection. Please enter 1 or 2.');
      rl.close();
      return;
    }
    
    // Confirmation
    console.log('\nBurn Details:');
    console.log(`  Coin ID: ${selectedCoin}`);
    
    if (!amountToBurn) {
      // Burning whole coin
      console.log(`  Raw Balance to burn: ${formatNumber(rawBalance)} base units`);
      console.log(`  Token Balance to burn: ${formatNumber(displayBalance)} HETRA tokens`);
    } else {
      // Burning partial amount
      const displayAmountToBurn = Number(amountToBurn) / 1e9;
      console.log(`  Amount to burn: ${formatNumber(displayAmountToBurn)} HETRA tokens (${formatNumber(amountToBurn)} base units)`);
      const remainingRaw = rawBalance - amountToBurn;
      const remainingDisplay = Number(remainingRaw) / 1e9;
      console.log(`  Remaining balance: ${formatNumber(remainingDisplay)} HETRA tokens (${formatNumber(remainingRaw)} base units)`);
    }
    
    console.log('\nNote: Burning will permanently remove these tokens from circulation');
    
    const confirm = await promptUser(rl, '\nWARNING: This operation is irreversible. Confirm burn? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Burn operation cancelled.');
      rl.close();
      return;
    }
    
    // Execute burn
    await burnHetraCoin(selectedCoin, amountToBurn);
    
    console.log('\nBurn operation completed successfully!');
  } catch (error) {
    console.error(`\nError during burn operation: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for checking total supply
async function interactiveCheckSupply(rl: readline.Interface) {
  console.log('=== HetraCoin Supply Check ===');
  
  try {
    const totalSupply = await getTotalSupply();
    const formattedTokenSupply = formatNumber(Number(totalSupply) / 1e9);
    
    console.log('\n----- TOTAL SUPPLY -----');
    console.log(`Raw supply: ${formatNumber(totalSupply)} base units`);
    console.log(`Token supply: ${formattedTokenSupply} HETRA tokens`);
    console.log('------------------------');
    console.log('\nNote: 1 HETRA token = 1,000,000,000 base units (9 decimals)');
  } catch (error) {
    console.error(`\nError checking total supply: ${error}`);
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
      
      console.log('=== HetraCoin Burn Operations ===');
      console.log('1. Burn tokens');
      console.log('2. Check total supply');
      
      const choice = await promptUser(menuRL, '\nSelect an operation (1-2): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for burn function
          const burnRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveBurn(burnRL);
          break;
          
        case '2':
          // Create a new readline for supply check
          const supplyRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveCheckSupply(supplyRL);
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    const command = args[0];

    switch (command) {
      case 'burn':
        if (args.length < 2) {
          console.log('Please provide a coin object ID to burn');
          process.exit(1);
        }

        const coinId = args[1];
        let amountToBurn: bigint | undefined;
        
        // Check if an amount is specified
        if (args.length >= 3) {
          const amountStr = args[2];
          try {
            // Convert to base units (multiply by 10^9)
            if (amountStr.includes('.')) {
              // Handle decimal input
              const [whole, fraction] = amountStr.split('.');
              // Pad the fraction to 9 decimal places
              const paddedFraction = fraction.padEnd(9, '0').substring(0, 9);
              // Convert to base units
              amountToBurn = BigInt(whole) * BigInt(1_000_000_000) + BigInt(paddedFraction);
            } else {
              // Convert whole number to base units
              amountToBurn = BigInt(amountStr) * BigInt(1_000_000_000);
            }
            console.log(`Converting ${amountStr} HETRA tokens to ${amountToBurn} base units to burn`);
          } catch (e) {
            console.error('Invalid amount. Please enter a valid number.');
            process.exit(1);
          }
        }
        
        burnHetraCoin(coinId, amountToBurn)
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'total-supply':
        getTotalSupply()
          .then(supply => {
            const displaySupply = Number(supply) / 1e9;
            console.log('HetraCoin Total Supply:');
            console.log(`Raw supply: ${formatNumber(supply)} base units`);
            console.log(`Token supply: ${formatNumber(displaySupply)} HETRA tokens`);
            console.log('\nNote: 1 HETRA token = 1,000,000,000 base units (9 decimals)');
            process.exit(0);
          })
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      default:
        console.log('Usage:');
        console.log('  Interactive mode: npx ts-node burn.ts');
        console.log('  Command-line mode:');
        console.log('    npx ts-node burn.ts burn <coin_object_id> [amount_in_tokens]');
        console.log('    npx ts-node burn.ts total-supply');
        process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node burn.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node burn.ts burn <coin_object_id> [amount_in_tokens]');
    console.log('    npx ts-node burn.ts total-supply');
    process.exit(1);
  }
} 