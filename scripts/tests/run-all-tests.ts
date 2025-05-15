/**
 * HetraCoin Comprehensive Test Runner
 * 
 * This script orchestrates all tests for the HetraCoin ecosystem:
 * - Token functionality (minting, burning, transfers)
 * - Staking system (pool creation, staking, rewards)
 * - Governance (proposal creation, voting)
 * - Marketplace (listings, purchases)
 * 
 * Note: Liquidity Pool functionality is shelved for future development
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Ensure environment variables are defined
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  console.error('DEPLOYER_PRIVATE_KEY not set in environment variables');
  process.exit(1);
}

// Get the network from command line arguments
const network = process.argv[2] as 'testnet' | 'mainnet';
if (!network || (network !== 'testnet' && network !== 'mainnet')) {
  console.error('Please specify network: testnet or mainnet');
  process.exit(1);
}

console.log(`🚀 Running all tests on ${network}...`);

// Define test modules to run
const testModules = [
  { name: 'Deployment', script: 'test-deployment.ts' },
  { name: 'Token Core', script: 'test-token-core.ts' },
  { name: 'Staking', script: 'test-staking.ts' },
  { name: 'Governance', script: 'test-governance.ts' },
  { name: 'Marketplace', script: 'test-hetrafi.ts' },
  { name: 'Comprehensive', script: 'test-comprehensive.ts' },
  { name: 'Security', script: 'test-security.ts' }
];

// Track results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0
};

// Run each test module
for (const module of testModules) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Running test module: ${module.name}`);
  console.log(`${'='.repeat(80)}`);
  
  const scriptPath = path.join(__dirname, 'tests', module.script);
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    console.log(`⚠️ Test script not found: ${module.script} - skipping`);
    results.skipped++;
    continue;
  }
  
  try {
    // Run the test script
    console.log(`Executing: npx ts-node ${scriptPath} ${network}`);
    execSync(`npx ts-node ${scriptPath} ${network}`, { stdio: 'inherit' });
    console.log(`\n✅ Test module passed: ${module.name}`);
    results.passed++;
  } catch (error) {
    console.error(`\n❌ Test module failed: ${module.name}`);
    results.failed++;
  }
}

// Print summary
console.log(`\n${'='.repeat(80)}`);
console.log(`📊 Test Summary: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
console.log(`${'='.repeat(80)}`);

if (results.failed > 0) {
  process.exit(1);
} 