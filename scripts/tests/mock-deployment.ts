/**
 * HetraCoin Mock Deployment
 * 
 * This script simulates a complete real-world deployment of the HetraCoin token.
 * It performs the entire deployment pipeline from contract publishing to testing.
 * 
 * Usage:
 *   npx ts-node scripts/tests/mock-deployment.ts
 */
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { fromB64, normalizeSuiAddress } from '@mysten/sui.js/utils';

// Configuration
dotenv.config();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Logger functions
function logSuccess(msg: string) { console.log(`${colors.green}✓ ${msg}${colors.reset}`); }
function logError(msg: string) { console.log(`${colors.red}✗ ${msg}${colors.reset}`); }
function logWarning(msg: string) { console.log(`${colors.yellow}! ${msg}${colors.reset}`); }
function logInfo(msg: string) { console.log(`${colors.blue}ℹ ${msg}${colors.reset}`); }
function logHeader(msg: string) { console.log(`\n${colors.cyan}=== ${msg} ===${colors.reset}\n`); }

// Define the deployment pipeline
async function mockDeployment() {
  logHeader("HETRACOIN MOCK DEPLOYMENT PROCESS");
  
  // Step 1: Setup environment
  logHeader("1. ENVIRONMENT SETUP");
  
  logInfo("Setting up deployment environment...");
  
  // Check for DEPLOYER_PRIVATE_KEY
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    logError("DEPLOYER_PRIVATE_KEY not set in environment variables");
    process.exit(1);
  }
  
  // Initialize keypair from private key
  const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
  const privateKeyArray = fromB64(privateKeyString);
  
  let keyData = privateKeyArray;
  if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
    keyData = privateKeyArray.slice(1);
  }
  
  if (keyData.length !== 32) {
    logError(`Invalid private key length: ${keyData.length}. Expected 32 bytes.`);
    process.exit(1);
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(keyData);
  const deployerAddress = keypair.getPublicKey().toSuiAddress();
  
  logInfo(`Deployer address: ${deployerAddress}`);
  
  // Step 2: Compile contracts
  logHeader("2. COMPILING CONTRACTS");
  
  logInfo("Compiling Move contracts...");
  try {
    execSync('sui move build', { stdio: 'inherit' });
    logSuccess("Contracts compiled successfully");
  } catch (error) {
    logError(`Compilation failed: ${error}`);
    process.exit(1);
  }
  
  // Step 3: Deploy contracts to testnet
  logHeader("3. DEPLOYING CONTRACTS");
  
  // Initialize Sui client
  const client = new SuiClient({
    url: 'https://fullnode.testnet.sui.io:443'
  });
  logInfo("Connected to Sui testnet");
  
  // Helper to get bytecode from compiled modules
  async function getBytecodeFromPath(modulePath: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(fs.readFileSync(modulePath));
    } catch (error) {
      logError(`Error reading bytecode from ${modulePath}: ${error}`);
      throw error;
    }
  }
  
  // Deploy the package
  logInfo("Creating deployment transaction...");
  const tx = new TransactionBlock();
  
  // Get all module bytecode
  const modulesDir = path.join(__dirname, '../../build/hetracoin-sui/bytecode_modules');
  const moduleFiles = fs.readdirSync(modulesDir).filter(file => 
    file.endsWith('.mv') && (
      file.startsWith('HetraCoin') || 
      file.startsWith('Treasury') || 
      file.startsWith('Governance')
    )
  );
  logInfo(`Found ${moduleFiles.length} modules to deploy: ${moduleFiles.join(', ')}`);
  
  const modules = await Promise.all(
    moduleFiles.map(file => getBytecodeFromPath(path.join(modulesDir, file)))
  );
  
  // Publish the package
  const [upgradeCap] = tx.publish({
    modules: modules.map(m => Array.from(m)),
    dependencies: [
      '0x2', // Sui framework
      '0x1', // Move stdlib
    ],
  });
  
  // Store upgrade cap with the deployer
  tx.transferObjects([upgradeCap], tx.pure(deployerAddress));
  
  // Execute deployment transaction
  logInfo("Executing deployment transaction...");
  let packageId: string;
  let treasuryCapId: string;
  let adminCapId: string;
  let coinMetadataId: string;
  
  try {
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    logInfo(`Transaction digest: ${result.digest}`);
    
    if (result.effects?.status?.status !== 'success') {
      logError(`Deployment failed: ${result.effects?.status?.error}`);
      process.exit(1);
    }
    
    // Extract package ID
    const created = result.objectChanges?.filter((change: any) => change.type === 'published');
    if (created && created.length > 0) {
      packageId = created[0].packageId;
      logSuccess(`Package deployed with ID: ${packageId}`);
    } else {
      logError("Could not extract package ID from transaction result");
      process.exit(1);
    }
    
    // Save deployment info
    const deploymentInfo = {
      packageId,
      transactionDigest: result.digest,
      timestamp: new Date().toISOString(),
    };
    
    fs.writeFileSync(
      path.join(__dirname, '../../mock-deployment-testnet.json'),
      JSON.stringify(deploymentInfo, null, 2)
    );
    logSuccess("Deployment info saved to mock-deployment-testnet.json");
    
  } catch (error) {
    logError(`Deployment transaction failed: ${error}`);
    process.exit(1);
  }
  
  // Step 4: Wait for objects to be available on the network
  logHeader("4. WAITING FOR OBJECTS");
  
  logInfo("Waiting for package to be available on the network...");
  await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
  
  // Step 5: Find created objects (TreasuryCap, AdminCap, etc.)
  logHeader("5. LOCATING CREATED OBJECTS");
  
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;
  
  // Find TreasuryCap
  try {
    logInfo("Finding TreasuryCap...");
    const treasuryObjects = await client.getOwnedObjects({
      owner: deployerAddress,
      filter: { StructType: `0x2::coin::TreasuryCap<${coinType}>` },
      options: { showContent: true }
    });
    
    if (treasuryObjects.data && treasuryObjects.data.length > 0) {
      treasuryCapId = treasuryObjects.data[0].data?.objectId || '';
      logSuccess(`Found TreasuryCap: ${treasuryCapId}`);
    } else {
      logError("TreasuryCap not found");
      process.exit(1);
    }
  } catch (error) {
    logError(`Error finding TreasuryCap: ${error}`);
    process.exit(1);
  }
  
  // Find AdminCap
  try {
    logInfo("Finding AdminCap...");
    const adminCapObjects = await client.getOwnedObjects({
      owner: deployerAddress,
      filter: { StructType: `${packageId}::HetraCoin::AdminCap` },
      options: { showContent: true }
    });
    
    if (adminCapObjects.data && adminCapObjects.data.length > 0) {
      adminCapId = adminCapObjects.data[0].data?.objectId || '';
      logSuccess(`Found AdminCap: ${adminCapId}`);
    } else {
      logError("AdminCap not found");
      process.exit(1);
    }
  } catch (error) {
    logError(`Error finding AdminCap: ${error}`);
    process.exit(1);
  }
  
  // Find CoinMetadata
  try {
    logInfo("Finding CoinMetadata...");
    const metadataObjects = await client.getOwnedObjects({
      owner: deployerAddress,
      filter: { StructType: `0x2::coin::CoinMetadata<${coinType}>` },
      options: { showContent: true }
    });
    
    if (metadataObjects.data && metadataObjects.data.length > 0) {
      coinMetadataId = metadataObjects.data[0].data?.objectId || '';
      logSuccess(`Found CoinMetadata: ${coinMetadataId}`);
    } else {
      logError("CoinMetadata not found");
      process.exit(1);
    }
  } catch (error) {
    logError(`Error finding CoinMetadata: ${error}`);
    process.exit(1);
  }
  
  // Step 6: Perform post-deployment operations
  logHeader("6. POST-DEPLOYMENT OPERATIONS");
  
  // 6.1: Create Treasury
  logInfo("Creating Treasury...");
  try {
    const treasuryTx = new TransactionBlock();
    const treasury = treasuryTx.moveCall({
      target: `${packageId}::Treasury::create_treasury`,
      arguments: [treasuryTx.pure(deployerAddress)],
    });
    treasuryTx.transferObjects([treasury], treasuryTx.pure(deployerAddress));
    
    const treasuryResult = await client.signAndExecuteTransactionBlock({
      transactionBlock: treasuryTx,
      signer: keypair,
      options: { showEffects: true }
    });
    
    if (treasuryResult.effects?.status?.status !== 'success') {
      logError(`Treasury creation failed: ${treasuryResult.effects?.status?.error}`);
    } else {
      logSuccess("Treasury created successfully");
    }
  } catch (error) {
    logError(`Error creating Treasury: ${error}`);
  }
  
  // 6.2: Initial token minting (100 million initial supply)
  logInfo("Minting initial token supply (100 million HETRA)...");
  
  try {
    const mintTx = new TransactionBlock();
    const mintAmount = 100_000_000_000_000_000n; // 100 million tokens with 9 decimals
    
    const coinObject = mintTx.moveCall({
      target: `0x2::coin::mint`,
      typeArguments: [coinType],
      arguments: [
        mintTx.object(treasuryCapId),
        mintTx.pure(mintAmount)
      ],
    });
    
    mintTx.transferObjects([coinObject], mintTx.pure(deployerAddress));
    
    const mintResult = await client.signAndExecuteTransactionBlock({
      transactionBlock: mintTx,
      signer: keypair,
      options: { showEffects: true }
    });
    
    if (mintResult.effects?.status?.status !== 'success') {
      logError(`Initial minting failed: ${mintResult.effects?.status?.error}`);
    } else {
      logSuccess("Initial supply minted successfully");
    }
  } catch (error) {
    logError(`Error minting initial supply: ${error}`);
  }
  
  // Step 7: Verify token balance
  logHeader("7. VERIFYING TOKEN BALANCE");
  
  try {
    const coins = await client.getCoins({
      owner: deployerAddress,
      coinType: coinType,
    });
    
    if (coins.data && coins.data.length > 0) {
      let totalBalance = 0n;
      for (const coin of coins.data) {
        totalBalance += BigInt(coin.balance);
      }
      
      logInfo(`Found ${coins.data.length} coin objects`);
      logSuccess(`Total balance: ${Number(totalBalance) / 1e9} HETRA`);
    } else {
      logError("No HETRA tokens found in wallet");
    }
  } catch (error) {
    logError(`Error checking token balance: ${error}`);
  }
  
  // Step 8: Simulate token distribution to presale wallets
  logHeader("8. SIMULATING TOKEN DISTRIBUTION");
  
  // Dummy presale wallets (in a real scenario, these would be actual presale participants)
  const presaleWallets = [
    { address: "0x" + "1".repeat(64), amount: 5_000_000 }, // 5 million tokens
    { address: "0x" + "2".repeat(64), amount: 3_000_000 }, // 3 million tokens
    { address: "0x" + "3".repeat(64), amount: 2_000_000 }, // 2 million tokens
  ];
  
  logInfo(`Simulating distribution to ${presaleWallets.length} presale wallets`);
  
  // Note: In a real environment, we would actually send these tokens,
  // but for simulation purposes, we're just logging the process.
  for (const wallet of presaleWallets) {
    logInfo(`Would transfer ${wallet.amount} HETRA to ${wallet.address}`);
  }
  
  // Step 9: Final verification
  logHeader("9. DEPLOYMENT SUMMARY");
  
  logSuccess("Mock deployment completed successfully!");
  logInfo("Deployment artifacts:");
  logInfo(`- Package ID: ${packageId}`);
  logInfo(`- TreasuryCap ID: ${treasuryCapId}`);
  logInfo(`- AdminCap ID: ${adminCapId}`);
  logInfo(`- CoinMetadata ID: ${coinMetadataId}`);
  
  logInfo("\nNext steps for real deployment:");
  logInfo("1. Setup multi-sig wallets for treasury operations");
  logInfo("2. Configure governance parameters");
  logInfo("3. Deploy to mainnet following the same procedure");
  logInfo("4. Distribute tokens according to tokenomics plan");
  logInfo("5. List token on decentralized exchanges");
}

// Run the mock deployment if this script is executed directly
if (require.main === module) {
  mockDeployment().catch(error => {
    logError(`Uncaught error in mock deployment: ${error}`);
    process.exit(1);
  });
}

export { mockDeployment }; 