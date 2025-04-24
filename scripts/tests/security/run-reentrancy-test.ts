import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';

// Import specific test to run
import { runReentrancyProtectionTest } from './reentrancyProtection';

// Configuration constants
const NETWORK: 'testnet' | 'localnet' = 'testnet';
const MOCK_MODE = true; // Use true for mock testing
const TEST_GAS_BUDGET = 200000000;

// Load configuration
const configPath = path.join(__dirname, 'test-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Placeholder client (will only be used in mock mode)
const client = MOCK_MODE ? 
  { devInspectTransactionBlock: () => ({ effects: { status: { status: 'failure' }}}) } as any : 
  new SuiClient({ url: getFullnodeUrl(NETWORK) });

// Mock shared objects
const sharedObjects = {
  treasuryCapId: config.treasuryCapId,
  adminCoinId: 'mock-admin-coin-id',
  userCoinId: 'mock-user-coin-id'
};

// Mock accounts with pure mock addresses
const accounts = {
  admin: { 
    keypair: null, 
    address: "0x1000000000000000000000000000000000000000000000000000000000000001" 
  },
  user: { 
    keypair: null, 
    address: "0x2000000000000000000000000000000000000000000000000000000000000002" 
  },
  attacker: { 
    keypair: null, 
    address: "0x3000000000000000000000000000000000000000000000000000000000000003" 
  }
};

// Export common globals for test modules
export { client, NETWORK, MOCK_MODE, sharedObjects, accounts, TEST_GAS_BUDGET };

// Main function to run the test
async function main() {
  console.log(`Running reentrancy protection test in ${MOCK_MODE ? 'mock' : 'real'} mode`);
  console.log(`Package ID: ${config.packageId}`);
  console.log(`Treasury Cap ID: ${config.treasuryCapId}`);
  
  try {
    const result = await runReentrancyProtectionTest(config.packageId);
    console.log("\nTest result:", result.passed ? "PASSED ✅" : "FAILED ❌");
    if (!result.passed && result.error) {
      console.log("Error:", result.error);
    }
  } catch (error) {
    console.error("Test execution error:", error);
  }
}

main(); 