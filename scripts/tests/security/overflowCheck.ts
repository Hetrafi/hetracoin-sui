import { TransactionBlock } from '@mysten/sui.js/transactions';
import { accounts, client, TEST_GAS_BUDGET, NETWORK, MOCK_MODE, sharedObjects } from './index';

// Test result type
export type TestResult = {
  passed: boolean;
  description: string;
  error?: string;
};

export async function runOverflowCheckTest(packageId: string): Promise<TestResult> {
  console.log('\n--- Testing Overflow Protection ---');
  
  // For mock mode, simulate a passing test
  if (MOCK_MODE) {
    console.log('✅ [MOCK] Contract properly protects against overflow attacks');
    return {
      passed: true,
      description: 'Contract correctly prevents arithmetic overflow (mock test)'
    };
  }
  
  try {
    // Use the treasury cap that was created during initialization
    if (!sharedObjects.treasuryCapId) {
      throw new Error('Treasury cap ID not found in shared objects');
    }
    
    const treasuryCapId = sharedObjects.treasuryCapId;
    console.log(`Using treasury cap with ID: ${treasuryCapId}`);
    
    // Set up a transaction block for testing overflow protection
    const overflowTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      overflowTx.setGasBudget(TEST_GAS_BUDGET);
      console.log(`Setting gas budget for overflow test: ${TEST_GAS_BUDGET}`);
    }
    
    // Attempt to mint coins with an extremely large value that would potentially cause an overflow
    // In Sui Move, u64 has a maximum value of 18,446,744,073,709,551,615
    console.log('Creating overflow test transaction...');
    const extremelyLargeValue = '18446744073709551615'; // Max u64 value
    
    // Call the mint function with the real treasury cap and a large value to check if it's properly protected
    overflowTx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        overflowTx.object(treasuryCapId), // Use real treasury cap
        overflowTx.pure(extremelyLargeValue),  // Amount to mint
      ],
    });
    
    // Use devInspectTransactionBlock to check if the transaction would succeed
    console.log('Inspecting overflow test transaction...');
    const inspectResult = await client.devInspectTransactionBlock({
      transactionBlock: overflowTx,
      sender: accounts.admin.address // Admin who has mint permission
    });
    
    console.log('Overflow test result:', JSON.stringify(inspectResult.effects?.status).substring(0, 100) + '...');
    
    // For a properly implemented contract, the transaction should fail because:
    // 1. Either the contract should detect potential overflow and abort using MAX_SUPPLY check
    // 2. Or Sui Move's built-in overflow checking should abort the transaction
    
    const isOverflowProtected = 
      inspectResult.effects?.status?.status === 'failure' && 
      (JSON.stringify(inspectResult.effects).includes('arithmetic overflow') || 
       JSON.stringify(inspectResult.effects).includes('ARITHMETIC_ERROR') ||
       JSON.stringify(inspectResult.effects).includes('OVERFLOW') ||
       JSON.stringify(inspectResult.effects).includes('E_OVERFLOW'));
    
    if (isOverflowProtected) {
      console.log('✅ Contract properly protects against overflow attacks');
      return {
        passed: true,
        description: 'Contract correctly prevents arithmetic overflow'
      };
    } else {
      console.log('❌ Contract may be vulnerable to arithmetic overflow');
      console.log('Error details:', JSON.stringify(inspectResult.effects).substring(0, 200) + '...');
      return {
        passed: false,
        description: 'Contract failed to prevent potential arithmetic overflow',
        error: JSON.stringify(inspectResult.effects)
      };
    }
  } catch (error) {
    console.error('Error during overflow protection test:', error);
    return {
      passed: false,
      description: 'Tests if the contract is protected against arithmetic overflow',
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 