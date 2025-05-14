/**
 * HetraCoin Presale Audit & Testing Script
 * 
 * This script performs comprehensive testing of the HetraCoin token
 * functionality to ensure it's ready for presale.
 * 
 * Usage:
 *   npx ts-node scripts/tests/token-presale-audit.ts testnet
 * 
 * Requirements:
 *   - A .env file with DEPLOYER_PRIVATE_KEY set
 *   - A deployment-phase1-testnet.json file with the package ID
 */
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

// Set up console logging with colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message: string, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) { log(`✅ ${message}`, colors.green); }
function errorLog(message: string) { log(`❌ ${message}`, colors.red); }
function warning(message: string) { log(`⚠️ ${message}`, colors.yellow); }
function info(message: string) { log(`ℹ️ ${message}`, colors.blue); }
function heading(message: string) { log(`\n🔷 ${message} 🔷\n`, colors.cyan); }

// Load environment variables
dotenv.config();

// Ensure environment variables are defined
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  errorLog('DEPLOYER_PRIVATE_KEY not set in environment variables');
  process.exit(1);
}

// Main function to run all tests
async function runPresaleAudit(network: 'testnet' | 'mainnet' = 'testnet') {
  heading(`RUNNING HETRACOIN PRESALE AUDIT ON ${network.toUpperCase()}`);
  
  try {
    // Initialize client
    info('Initializing SUI client...');
    const rpcUrl = network === 'testnet' 
      ? 'https://fullnode.testnet.sui.io:443' 
      : 'https://fullnode.mainnet.sui.io:443';
    
    const client = new SuiClient({ url: rpcUrl });
    success('SUI client initialized');
    
    // Create keypair from the private key
    info('Creating keypair from private key...');
    let keypair;
    try {
      const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
      let privateKeyArray = fromB64(privateKeyString);
      
      if (privateKeyArray.length !== 32) {
        // Handle different key formats
        if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
          privateKeyArray = privateKeyArray.slice(1);
        } else {
          throw new Error(`Unexpected private key length: ${privateKeyArray.length}`);
        }
      }
      
      keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
    } catch (error) {
      errorLog(`Error creating keypair: ${error}`);
      process.exit(1);
    }
    
    // Get the wallet address
    const walletAddress = keypair.getPublicKey().toSuiAddress();
    info(`Wallet address: ${walletAddress}`);
    
    // Load deployment info
    info('Loading deployment info...');
    const deploymentPath = path.join(__dirname, `../../deployment-phase1-${network}.json`);
    if (!fs.existsSync(deploymentPath)) {
      errorLog(`Deployment file not found: ${deploymentPath}`);
      process.exit(1);
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const packageId = deploymentInfo.packageId;
    success(`Package ID loaded: ${packageId}`);
    
    // Test variables
    const coinType = `${packageId}::HetraCoin::HETRACOIN`;
    const testResults = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
    
    // Helper function to record test results
    function recordResult(name: string, passed: boolean, skipped = false) {
      if (skipped) {
        warning(`SKIPPED: ${name}`);
        testResults.skipped++;
      } else if (passed) {
        success(`PASSED: ${name}`);
        testResults.passed++;
      } else {
        errorLog(`FAILED: ${name}`);
        testResults.failed++;
      }
    }
    
    // 1. DEPLOYMENT VERIFICATION
    heading('1. DEPLOYMENT VERIFICATION');
    
    // 1.1 Verify Package Exists
    try {
      const packageObj = await client.getObject({
        id: packageId,
        options: { showContent: true }
      });
      recordResult('Package exists', true);
    } catch (e) {
      recordResult('Package exists', false);
    }
    
    // 1.2 Verify TreasuryCap
    let treasuryCapId: string | null = null;
    try {
      const treasuryObjects = await client.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `0x2::coin::TreasuryCap<${coinType}>` },
        options: { showContent: true }
      });
      
      if (treasuryObjects.data && treasuryObjects.data.length > 0) {
        treasuryCapId = treasuryObjects.data[0].data?.objectId || null;
        recordResult('TreasuryCap exists', !!treasuryCapId);
        if (treasuryCapId) {
          info(`TreasuryCap ID: ${treasuryCapId}`);
        }
      } else {
        recordResult('TreasuryCap exists', false);
      }
    } catch (e) {
      recordResult('TreasuryCap exists', false);
    }
    
    // 1.3 Verify AdminCap
    let adminCapId: string | null = null;
    try {
      const adminCapObjects = await client.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `${packageId}::HetraCoin::AdminCap` },
        options: { showContent: true }
      });
      
      if (adminCapObjects.data && adminCapObjects.data.length > 0) {
        adminCapId = adminCapObjects.data[0].data?.objectId || null;
        recordResult('AdminCap exists', !!adminCapId);
        if (adminCapId) {
          info(`AdminCap ID: ${adminCapId}`);
        }
      } else {
        recordResult('AdminCap exists', false);
      }
    } catch (e) {
      recordResult('AdminCap exists', false);
    }
    
    // 1.4 Verify Coin Metadata
    let metadataId: string | null = null;
    try {
      // Find metadata objects
      const metadataObjects = await client.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `0x2::coin::CoinMetadata<${coinType}>` },
        options: { showContent: true, showDisplay: true }
      });
      
      if (metadataObjects.data && metadataObjects.data.length > 0) {
        metadataId = metadataObjects.data[0].data?.objectId || null;
        recordResult('Coin Metadata exists', !!metadataId);
        
        if (metadataId) {
          // Get detailed metadata
          const metadata = await client.getObject({
            id: metadataId,
            options: { showContent: true, showDisplay: true }
          });
          
          if (metadata.data?.content && typeof metadata.data.content === 'object' && 'fields' in metadata.data.content) {
            const fields = metadata.data.content.fields as any;
            // Check symbol
            const symbol = fields.symbol;
            recordResult('Symbol is HETRA', symbol === 'HETRA');
            info(`Symbol: ${symbol}`);
            
            // Check name
            const name = fields.name;
            recordResult('Name is HetraCoin', name === 'HetraCoin');
            info(`Name: ${name}`);
            
            // Check decimals
            const decimals = Number(fields.decimals);
            recordResult('Decimals is 9', decimals === 9);
            info(`Decimals: ${decimals}`);
            
            // Check icon URL
            const icon_url = fields.icon_url;
            const hasIcon = icon_url && typeof icon_url === 'object' && 'fields' in icon_url && icon_url.fields.url;
            recordResult('Has icon URL', hasIcon);
            if (hasIcon) {
              info(`Icon URL: ${icon_url.fields.url}`);
            }
          }
        }
      } else {
        recordResult('Coin Metadata exists', false);
      }
    } catch (e) {
      recordResult('Coin Metadata exists', false);
    }
    
    // 2. TOKEN FUNCTIONALITY TESTS
    heading('2. TOKEN FUNCTIONALITY TESTS');
    
    // 2.1 Minting Test
    if (treasuryCapId) {
      try {
        info('Testing token minting...');
        // Create mint transaction
        const mintTx = new TransactionBlock();
        const mintAmount = 1_000_000_000n; // 1 token with 9 decimals
        
        // Call the mint function 
        const coinObject = mintTx.moveCall({
          target: `0x2::coin::mint`,
          typeArguments: [coinType],
          arguments: [
            mintTx.object(treasuryCapId),
            mintTx.pure(mintAmount)
          ],
        });
        
        // Transfer minted coin
        mintTx.transferObjects([coinObject], mintTx.pure(walletAddress));
        
        // Execute transaction
        const mintResult = await client.signAndExecuteTransactionBlock({
          transactionBlock: mintTx,
          signer: keypair,
          options: {
            showEffects: true,
            showEvents: true,
          },
        });
        
        const mintSuccess = mintResult.effects?.status?.status === 'success';
        recordResult('Mint tokens', mintSuccess);
        
        if (mintSuccess) {
          info(`Mint transaction digest: ${mintResult.digest}`);
        }
      } catch (e) {
        recordResult('Mint tokens', false);
        errorLog(`Mint error: ${e}`);
      }
    } else {
      warning('Skipping mint test - TreasuryCap not found');
      recordResult('Mint tokens', false, true);
    }
    
    // 2.2 Check Token Balance
    try {
      info('Checking token balance...');
      const coins = await client.getCoins({
        owner: walletAddress,
        coinType: coinType,
      });
      
      const hasCoins = coins.data && coins.data.length > 0;
      recordResult('Has token balance', hasCoins);
      
      if (hasCoins) {
        let totalBalance = 0n;
        for (const coin of coins.data) {
          totalBalance += BigInt(coin.balance);
        }
        
        info(`Found ${coins.data.length} coin objects`);
        info(`Total balance: ${Number(totalBalance) / 1e9} HETRA`);
        
        // Check individual coins
        coins.data.forEach((coin, i) => {
          info(`Coin #${i+1}: ID ${coin.coinObjectId}, Balance: ${Number(coin.balance) / 1e9} HETRA`);
        });
      }
    } catch (e) {
      recordResult('Check token balance', false);
      errorLog(`Balance check error: ${e}`);
    }
    
    // 2.3 Test Transfer (to self)
    try {
      info('Testing token transfer (to self)...');
      // Get coins again
      const coins = await client.getCoins({
        owner: walletAddress,
        coinType: coinType,
      });
      
      if (coins.data && coins.data.length > 0) {
        // Find a coin with sufficient balance
        const coinToUse = coins.data[0].coinObjectId;
        const transferAmount = 1_000_000n; // 0.001 HETRA with 9 decimals
        
        // Create transfer transaction
        const transferTx = new TransactionBlock();
        const [coin] = transferTx.splitCoins(
          transferTx.object(coinToUse),
          [transferTx.pure(transferAmount)]
        );
        
        // Transfer to self
        transferTx.transferObjects([coin], transferTx.pure(walletAddress));
        
        // Execute transaction
        const transferResult = await client.signAndExecuteTransactionBlock({
          transactionBlock: transferTx,
          signer: keypair,
          options: {
            showEffects: true,
            showEvents: true,
          },
        });
        
        const transferSuccess = transferResult.effects?.status?.status === 'success';
        recordResult('Transfer tokens', transferSuccess);
        
        if (transferSuccess) {
          info(`Transfer transaction digest: ${transferResult.digest}`);
        }
      } else {
        recordResult('Transfer tokens', false, true);
        warning('Skipping transfer test - no coins found');
      }
    } catch (e) {
      recordResult('Transfer tokens', false);
      errorLog(`Transfer error: ${e}`);
    }
    
    // 2.4 Test Burn
    if (treasuryCapId) {
      try {
        info('Testing token burn...');
        // Get coins again
        const coins = await client.getCoins({
          owner: walletAddress,
          coinType: coinType,
        });
        
        if (coins.data && coins.data.length > 0) {
          // Find a small coin to burn
          let coinToBurn = null;
          let smallestBalance = BigInt(Number.MAX_SAFE_INTEGER);
          
          for (const coin of coins.data) {
            const balance = BigInt(coin.balance);
            if (balance > 0 && balance < smallestBalance) {
              smallestBalance = balance;
              coinToBurn = coin.coinObjectId;
            }
          }
          
          if (coinToBurn) {
            // Create burn transaction
            const burnTx = new TransactionBlock();
            
            // Call the burn function
            burnTx.moveCall({
              target: `0x2::coin::burn`,
              typeArguments: [coinType],
              arguments: [
                burnTx.object(treasuryCapId),
                burnTx.object(coinToBurn)
              ],
            });
            
            // Execute transaction
            const burnResult = await client.signAndExecuteTransactionBlock({
              transactionBlock: burnTx,
              signer: keypair,
              options: {
                showEffects: true,
                showEvents: true,
              },
            });
            
            const burnSuccess = burnResult.effects?.status?.status === 'success';
            recordResult('Burn tokens', burnSuccess);
            
            if (burnSuccess) {
              info(`Burn transaction digest: ${burnResult.digest}`);
            }
          } else {
            recordResult('Burn tokens', false, true);
            warning('Skipping burn test - no suitable coin found');
          }
        } else {
          recordResult('Burn tokens', false, true);
          warning('Skipping burn test - no coins found');
        }
      } catch (e) {
        recordResult('Burn tokens', false);
        errorLog(`Burn error: ${e}`);
      }
    } else {
      warning('Skipping burn test - TreasuryCap not found');
      recordResult('Burn tokens', false, true);
    }
    
    // 3. ADMIN AND SECURITY TESTS
    heading('3. ADMIN AND SECURITY TESTS');
    
    // 3.1 Test Admin Registry
    try {
      info('Checking admin registry...');
      
      // Use the correct method to get objects
      const allObjects = await client.getOwnedObjects({
        owner: walletAddress,
        options: { showType: true }
      });
      
      // Filter for AdminRegistry objects
      const adminRegistries = allObjects.data.filter((obj: any) => 
        obj.data?.type?.includes(`${packageId}::HetraCoin::AdminRegistry`)
      );
      
      const hasRegistry = adminRegistries.length > 0;
      recordResult('Admin Registry exists', hasRegistry);
      
      if (hasRegistry) {
        const registryId = adminRegistries[0].data?.objectId;
        info(`Admin Registry found: ${registryId}`);
        
        if (registryId) {
          const registry = await client.getObject({
            id: registryId,
            options: { showContent: true }
          });
          
          if (registry.data?.content && typeof registry.data.content === 'object' && 'fields' in registry.data.content) {
            const fields = registry.data.content.fields as any;
            if (fields.admin) {
              info(`Current admin address: ${fields.admin}`);
              recordResult('Admin is deployment wallet', fields.admin === walletAddress);
            }
          }
        }
      }
    } catch (e) {
      recordResult('Admin Registry check', false);
      errorLog(`Admin Registry error: ${e}`);
    }
    
    // 3.2 Test EmergencyPauseState
    try {
      info('Checking emergency pause state...');
      
      // Use the correct method to get objects
      const allObjects = await client.getOwnedObjects({
        owner: walletAddress,
        options: { showType: true }
      });
      
      // Filter for EmergencyPauseState objects
      const pauseObjects = allObjects.data.filter((obj: any) => 
        obj.data?.type?.includes(`${packageId}::HetraCoin::EmergencyPauseState`)
      );
      
      const hasPauseState = pauseObjects.length > 0;
      recordResult('EmergencyPauseState exists', hasPauseState);
      
      if (hasPauseState) {
        const pauseStateId = pauseObjects[0].data?.objectId;
        info(`EmergencyPauseState found: ${pauseStateId}`);
        
        if (pauseStateId) {
          const pauseState = await client.getObject({
            id: pauseStateId,
            options: { showContent: true }
          });
          
          if (pauseState.data?.content && typeof pauseState.data.content === 'object' && 'fields' in pauseState.data.content) {
            const fields = pauseState.data.content.fields as any;
            if ('paused' in fields) {
              const isPaused = fields.paused === true;
              info(`Current pause state: ${isPaused ? 'PAUSED' : 'ACTIVE'}`);
              recordResult('Token is not paused', !isPaused);
            }
          }
        }
      }
    } catch (e) {
      recordResult('EmergencyPauseState check', false);
      errorLog(`EmergencyPauseState error: ${e}`);
    }
    
    // 4. SUMMARY
    heading('4. AUDIT SUMMARY');
    info(`Total tests: ${testResults.passed + testResults.failed + testResults.skipped}`);
    success(`Passed: ${testResults.passed}`);
    errorLog(`Failed: ${testResults.failed}`);
    warning(`Skipped: ${testResults.skipped}`);
    
    const passRate = Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100);
    
    if (testResults.failed === 0) {
      success(`\n🎉 AUDIT PASSED! 100% Success Rate 🎉`);
    } else if (passRate >= 80) {
      warning(`\n⚠️ AUDIT MOSTLY PASSED: ${passRate}% Success Rate`);
    } else {
      errorLog(`\n❌ AUDIT FAILED: ${passRate}% Success Rate`);
    }
    
    if (testResults.skipped > 0) {
      warning(`\nNote: ${testResults.skipped} tests were skipped and should be addressed.`);
    }
    
  } catch (error) {
    errorLog(`Fatal error in presale audit: ${error}`);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const network = (args[0] || 'testnet') as 'testnet' | 'mainnet';
  
  if (!['testnet', 'mainnet'].includes(network)) {
    errorLog('Invalid network. Use "testnet" or "mainnet"');
    process.exit(1);
  }
  
  runPresaleAudit(network).catch(e => {
    errorLog(`Uncaught error: ${e}`);
    process.exit(1);
  });
}

export { runPresaleAudit }; 