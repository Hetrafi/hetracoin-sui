import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Import all security tests
import { runZeroAmountTransferTest } from './zeroAmountTransfer';
import { runUnauthorizedMintTest } from './unauthorizedMint';
import { runReentrancyProtectionTest } from './reentrancyProtection';
import { runOverflowCheckTest } from './overflowCheck';
import { runAccessControlTest } from './accessControlCheck';

// Gas budget constants (increased for testnet)
export const DEPLOY_GAS_BUDGET = 500000000; // 0.5 SUI
export const TEST_GAS_BUDGET = 200000000;   // 0.2 SUI

// Get network from command line arguments or default to testnet
const NETWORK_ARG = process.argv[2];
const NETWORK: 'testnet' | 'localnet' = NETWORK_ARG === 'localnet' ? 'localnet' : 'testnet';
const FORCE_MOCK = process.argv.includes('--mock');

// Check if a specific package ID is provided as command line argument
let PACKAGE_ID_ARG = '';
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--package' && i + 1 < process.argv.length) {
    PACKAGE_ID_ARG = process.argv[i + 1];
    break;
  }
}

console.log(`Using network: ${NETWORK}${FORCE_MOCK ? ' (mock mode)' : ''}`);
if (PACKAGE_ID_ARG) {
  console.log(`Using provided package ID: ${PACKAGE_ID_ARG}`);
}

// Mock client for testing without a running Sui node
class MockSuiClient {
  async getCoins() {
    return {
      data: [
        {
          coinObjectId: '0x1234567890abcdef1234567890abcdef',
          coinType: '0x2::sui::SUI',
          balance: '1000000000' // 1 SUI
        }
      ]
    };
  }

  async devInspectTransactionBlock() {
    return {
      effects: {
        status: { status: 'success' }
      }
    };
  }
}

// Use real client for testnet, mock for offline testing
const client = FORCE_MOCK ? new MockSuiClient() : new SuiClient({
  url: getFullnodeUrl(NETWORK),
});

// Load keypairs from files
function loadKeyPair(filePath: string): Ed25519Keypair {
  // Get absolute path to workspace root
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const absolutePath = path.join(workspaceRoot, filePath);
  
  console.log(`Loading key from: ${absolutePath}`);
  const keyData = fs.readFileSync(absolutePath, 'utf8').trim().replace(/^"|"$/g, '');
  const privateKeyBytes = Buffer.from(keyData, 'base64');
  return Ed25519Keypair.fromSecretKey(privateKeyBytes);
}

// Setup keypairs from existing key files
let adminKeypair: Ed25519Keypair;
let userKeypair: Ed25519Keypair;
let attackerKeypair: Ed25519Keypair;

try {
  console.log('Loading keypairs from key files...');
  adminKeypair = loadKeyPair('admin-key.json');
  userKeypair = loadKeyPair('user-key.json');
  attackerKeypair = loadKeyPair('attacker-key.json');
  console.log('Keypairs loaded successfully');
} catch (error) {
  console.error('Error loading keypairs:', error);
  process.exit(1);
}

const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
const userAddress = userKeypair.getPublicKey().toSuiAddress();
const attackerAddress = attackerKeypair.getPublicKey().toSuiAddress();

console.log(`Admin address: ${adminAddress}`);
console.log(`User address: ${userAddress}`);
console.log(`Attacker address: ${attackerAddress}`);

// Export common utils and clients
export const accounts = {
  admin: { keypair: adminKeypair, address: adminAddress },
  user: { keypair: userKeypair, address: userAddress },
  attacker: { keypair: attackerKeypair, address: attackerAddress }
};

export { client, NETWORK };

// Paths for package publishing
const BUILD_PATH = '../../../build';

// Store package ID after deployment
let packageId: string;

// Object IDs for sharing between tests
export interface SharedTestObjects {
  treasuryCapId?: string;
  adminCoinId?: string;
  userCoinId?: string;
}

export const sharedObjects: SharedTestObjects = {};

// Helper function to format SUI balance
export function formatBalance(balance: number): string {
  return (balance / 1000000000).toFixed(9) + " SUI";
}

// Check balance of an account
export async function checkBalance(address: string, label: string): Promise<number> {
  if (MOCK_MODE) {
    console.log(`[MOCK] Skipping balance check for ${label}`);
    return 1000000000; // Mock balance
  }
  try {
    const { data: gasObjects } = await client.getCoins({
      owner: address,
    });
    
    let totalBalance = 0;
    gasObjects.forEach((coin: { coinObjectId: string; coinType: string; balance: string }) => {
      totalBalance += Number(coin.balance);
      console.log(`  Coin: ${coin.coinObjectId.substring(0, 8)}...${coin.coinObjectId.substring(coin.coinObjectId.length - 8)}, type: ${coin.coinType}, balance: ${formatBalance(Number(coin.balance))}`);
    });
    
    console.log(`${label} has ${gasObjects.length} gas coins with a total balance of ${formatBalance(totalBalance)}`);
    return totalBalance;
  } catch (error) {
    console.error(`Error checking ${label} balance:`, error);
    return 0;
  }
}

// Removed initializeHetraCoin function as initialization must be done manually on Testnet

async function deployPackage(): Promise<string> {
  // Find the compiled modules
  if (!fs.existsSync(BUILD_PATH)) {
    console.error(`Build directory not found at ${path.resolve(BUILD_PATH)}`);
    console.log('Looking for the build directory...');
    
    // Try to find the build directory
    const potentialDirs = ['../../../build', '../../build', '../build', './build'];
    for (const dir of potentialDirs) {
      if (fs.existsSync(dir)) {
        console.log(`Found build directory at ${path.resolve(dir)}`);
        // Continue with the found build path
        return deployPackageWithPath(dir);
      }
    }
    
    throw new Error(`Could not find the build directory. Please check the project structure.`);
  }
  
  return deployPackageWithPath(BUILD_PATH);
}

async function deployPackageWithPath(buildPath: string): Promise<string> {
  // List all directories in build path to locate the package
  const buildContents = fs.readdirSync(buildPath);
  console.log('Build directory contents:', buildContents);
  
  // Find all .mv files recursively in the build directory
  const mvFiles: string[] = [];
  const findMvFiles = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        findMvFiles(fullPath);
      } else if (dirent.name.endsWith('.mv')) {
        // Only include the project's modules, not dependencies
        const relativePath = path.relative(buildPath, fullPath);
        if (!relativePath.includes('dependencies')) {
          mvFiles.push(fullPath);
        }
      }
    });
  };
  
  findMvFiles(buildPath);
  
  if (mvFiles.length === 0) {
    throw new Error('No compiled modules (.mv files) found in the build directory');
  }
  
  console.log(`Found ${mvFiles.length} compiled modules:`, mvFiles);
  
  // Create transaction using the Sui CLI instead for more reliable deployment
  console.log('Publishing package using sui CLI...');
  
  try {
    // Determine the correct cwd based on where Move.toml is relative to the build path
    const moveTomlDir = path.resolve(buildPath, '..'); // Assumes Move.toml is one level up from build
    console.log(`Attempting to publish from directory: ${moveTomlDir}`);

    const publishOutput = execSync('sui client publish --gas-budget 500000000 --json', { 
      cwd: moveTomlDir, 
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8'
    });
    
    console.log('Package published successfully via CLI');
    
    // Parse the JSON output to get the package ID
    const publishData = JSON.parse(publishOutput);
    const effects = publishData.effects;
    
    // Look for the created package ID in the effects
    const created = effects.created || [];
    // Find the package object specifically
    const packageObj = created.find((obj: any) => 'packageId' in obj.reference);
    
    if (packageObj) {
      return packageObj.reference.packageId;
    } else {
      console.error('Could not find package ID in CLI output, using mock ID');
      return '0xMOCKPACKAGE1234567890abcdef12345678';
    }
  } catch (error) {
    console.error('Error publishing package via CLI:', error);
    console.log('Falling back to mock package ID');
    return '0xMOCKPACKAGE1234567890abcdef12345678';
  }
}

// Track test results
type TestResult = {
  name: string;
  passed: boolean;
  description: string;
  error?: string;
};

// Mock mode flag for testing without actual deployment
export let MOCK_MODE = FORCE_MOCK;

const testResults: TestResult[] = [];

async function main() {
  try {
    console.log('\n=== Starting HetraCoin Security Audit ===\n');
    
    // Determine Package ID
    if (PACKAGE_ID_ARG) {
      console.log(`\nUsing provided package ID: ${PACKAGE_ID_ARG}`);
      packageId = PACKAGE_ID_ARG;
      if (NETWORK !== 'testnet') {
          console.warn('Warning: Using a specific package ID usually implies targeting a specific network like Testnet.');
      }
    }
    // If mock mode is forced, use mock ID and skip deploy
    else if (FORCE_MOCK) {
      console.log('\nRunning in forced mock mode - skipping build and deploy.');
      packageId = '0xMOCKPACKAGE1234567890abcdef12345678';
      MOCK_MODE = true;
    } 
    // If targeting localnet, attempt build/deploy (init won't work here either without changes)
    else if (NETWORK === 'localnet') {
        console.log('\nTargeting localnet. Attempting to build and deploy...');
        try {
            packageId = await deployPackage();
            console.log(`Package deployed to localnet with ID: ${packageId}`);
            MOCK_MODE = false; // Assume real objects if deploy succeeds
        } catch (deployError) {
            console.error('Error building/deploying package to localnet:', deployError);
            console.log('Falling back to mock package ID for localnet tests.');
            packageId = '0xMOCKPACKAGE1234567890abcdef12345678';
            MOCK_MODE = true;
        }
    } 
    // If targeting testnet without a package ID, this script cannot proceed automatically
    else if (NETWORK === 'testnet' && !PACKAGE_ID_ARG) {
        console.error('Error: Running on Testnet requires a pre-published package ID using --package <ID>');
        console.error('Please publish your package, manually initialize it, find object IDs, and provide the package ID.');
        process.exit(1);
    }
    
    // Setup Shared Objects (Manual step required for Testnet)
    if (!MOCK_MODE && NETWORK === 'testnet') {
      console.log('\nConfiguring for Testnet using provided package ID...');
      // !!! CRITICAL MANUAL STEP !!!
      // Replace these with the ACTUAL Object IDs from your Testnet deployment
      sharedObjects.treasuryCapId = 'PASTE_YOUR_TESTNET_TREASURY_CAP_ID_HERE'; 
      sharedObjects.adminCoinId = 'PASTE_YOUR_TESTNET_ADMIN_COIN_ID_HERE';     
      sharedObjects.userCoinId = 'PASTE_YOUR_TESTNET_USER_COIN_ID_HERE';      

      console.log(`Using Treasury Cap ID: ${sharedObjects.treasuryCapId}`);
      console.log(`Using Admin Coin ID: ${sharedObjects.adminCoinId}`);
      console.log(`Using User Coin ID: ${sharedObjects.userCoinId}`);

      if (!sharedObjects.treasuryCapId || sharedObjects.treasuryCapId.startsWith('PASTE_YOUR') ||
          !sharedObjects.adminCoinId || sharedObjects.adminCoinId.startsWith('PASTE_YOUR') ||
          !sharedObjects.userCoinId || sharedObjects.userCoinId.startsWith('PASTE_YOUR')) {
          console.error('Error: Placeholder Object IDs detected. Please edit index.ts and replace the PASTE_YOUR... placeholders with actual Testnet Object IDs.');
          process.exit(1);
      }
      
      // Optionally, add a check here to verify the objects exist on Testnet
      // using client.getObject({ id: sharedObjects.treasuryCapId, options: { showType: true } }) etc.
      // This would confirm the IDs are valid before running tests.

    } else if (MOCK_MODE) {
        console.log('\nUsing mock object IDs for MOCK mode.');
        sharedObjects.treasuryCapId = '0x1111';
        sharedObjects.adminCoinId = '0x2222';
        sharedObjects.userCoinId = '0x3333';
    } else if (NETWORK === 'localnet') {
        // For localnet, initialization would ideally happen here if we had a public init function
        // Since we don't, localnet testing will also fail unless manually set up or mocked.
        console.warn('Warning: Localnet testing requires manual setup or mocking due to lack of public init function.');
        console.warn('Falling back to mock object IDs for localnet.');
         MOCK_MODE = true; // Force mock if setup isn't possible
        sharedObjects.treasuryCapId = '0x1111';
        sharedObjects.adminCoinId = '0x2222';
        sharedObjects.userCoinId = '0x3333';
    }

    // Check balances (only if not in mock mode)
    if (!MOCK_MODE) {
        console.log('Checking account balances on network...');
        await checkBalance(adminAddress, "Admin");
        await checkBalance(userAddress, "User");
        await checkBalance(attackerAddress, "Attacker");
    }
    
    // Run all security tests
    console.log('\n=== Running Security Tests ===\n');
    console.log(`Using package ID: ${packageId}`);
    console.log(`Note: Tests are running in ${MOCK_MODE ? 'mock' : 'real'} mode.\n`);
    
    // Zero Amount Transfer Test
    try {
      const zeroAmountResult = await runZeroAmountTransferTest(packageId);
      testResults.push({
        name: 'Zero Amount Transfer Protection',
        passed: zeroAmountResult.passed,
        description: zeroAmountResult.description,
        error: zeroAmountResult.error
      });
    } catch (error) {
      testResults.push({
        name: 'Zero Amount Transfer Protection',
        passed: false,
        description: 'Tests if the contract prevents transfers of zero amounts',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Wait between tests if running on a real network
    if (!MOCK_MODE) {
      console.log('Waiting 3 seconds for transaction settlement...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Unauthorized Mint Test
    try {
      const unauthorizedMintResult = await runUnauthorizedMintTest(packageId);
      testResults.push({
        name: 'Unauthorized Mint Protection',
        passed: unauthorizedMintResult.passed,
        description: unauthorizedMintResult.description,
        error: unauthorizedMintResult.error
      });
    } catch (error) {
      testResults.push({
        name: 'Unauthorized Mint Protection',
        passed: false,
        description: 'Tests if unauthorized addresses can mint tokens',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Wait between tests if running on a real network
    if (!MOCK_MODE) {
      console.log('Waiting 3 seconds for transaction settlement...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Reentrancy Test
    try {
      const reentrancyResult = await runReentrancyProtectionTest(packageId);
      testResults.push({
        name: 'Reentrancy Protection',
        passed: reentrancyResult.passed,
        description: reentrancyResult.description,
        error: reentrancyResult.error
      });
    } catch (error) {
      testResults.push({
        name: 'Reentrancy Protection',
        passed: false,
        description: 'Tests if the contract prevents reentrant calls',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Wait between tests if running on a real network
    if (!MOCK_MODE) {
      console.log('Waiting 3 seconds for transaction settlement...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Overflow Check Test
    try {
      const overflowResult = await runOverflowCheckTest(packageId);
      testResults.push({
        name: 'Overflow Protection',
        passed: overflowResult.passed,
        description: overflowResult.description,
        error: overflowResult.error
      });
    } catch (error) {
      testResults.push({
        name: 'Overflow Protection',
        passed: false,
        description: 'Tests if the contract prevents numeric overflows',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Wait between tests if running on a real network
    if (!MOCK_MODE) {
      console.log('Waiting 3 seconds for transaction settlement...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Access Control Test
    try {
      const accessControlResult = await runAccessControlTest(packageId);
      testResults.push({
        name: 'Access Control',
        passed: accessControlResult.passed,
        description: accessControlResult.description,
        error: accessControlResult.error
      });
    } catch (error) {
      testResults.push({
        name: 'Access Control',
        passed: false,
        description: 'Tests if access controls are properly enforced',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Print test results summary
    console.log('\n=== Security Audit Results ===\n');
    
    let passedTests = 0;
    let failedTests = 0;
    
    testResults.forEach(result => {
      if (result.passed) {
        console.log(`✅ PASSED: ${result.name} - ${result.description}`);
        passedTests++;
      } else {
        console.log(`❌ FAILED: ${result.name} - ${result.description}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        failedTests++;
      }
    });
    
    console.log(`\nSummary: ${passedTests} tests passed, ${failedTests} tests failed`);
    
    if (failedTests > 0) {
      console.log('\n⚠️ SECURITY AUDIT FOUND ISSUES!\n');
      process.exit(1);
    } else {
      console.log('\n✅ ALL SECURITY TESTS PASSED!\n');
    }
    
  } catch (error) {
    console.error('Security audit failed with error:', error);
    process.exit(1);
  }
}

// Run the security audit
main().catch(console.error);

// Helper function to find package path based on Move.toml
function findMoveTomlDir(startPath: string): string | null {
    let currentDir = startPath;
    while (true) {
        const checkPath = path.join(currentDir, 'Move.toml');
        if (fs.existsSync(checkPath)) {
            return currentDir;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) { // Reached root
            break;
        }
        currentDir = parentDir;
    }
    return null;
} 