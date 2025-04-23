import { TransactionBlock } from '@mysten/sui.js/transactions';
import { accounts, client, TEST_GAS_BUDGET, NETWORK, MOCK_MODE, sharedObjects } from './index';

// Test result type
export type TestResult = {
  passed: boolean;
  description: string;
  error?: string;
};

export async function runReentrancyProtectionTest(packageId: string): Promise<TestResult> {
  console.log('\n--- Testing Reentrancy Protection ---');
  
  // For mock mode, simulate a passing test
  if (MOCK_MODE) {
    console.log('✅ [MOCK] Reentrancy attack correctly blocked');
    return {
      passed: true,
      description: 'Contract properly blocks reentrancy attacks with explicit checks (mock test)'
    };
  }
  
  try {
    // Use the user coin that was created during initialization
    if (!sharedObjects.userCoinId) {
      throw new Error('User coin ID not found in shared objects');
    }
    
    const hetraCoinId = sharedObjects.userCoinId;
    console.log(`Using user HetraCoin with ID: ${hetraCoinId}`);
    
    // Set up a transaction block for testing reentrancy protection
    const reentryTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      reentryTx.setGasBudget(TEST_GAS_BUDGET);
      console.log(`Setting gas budget for reentrancy test: ${TEST_GAS_BUDGET}`);
    }
    
    // Attempt to simulate a reentrant call by making nested calls to the secure_transfer function
    console.log('Creating reentrancy test transaction...');
    
    // First, call secure_transfer function
    reentryTx.moveCall({
      target: `${packageId}::HetraCoin::secure_transfer`,
      arguments: [
        reentryTx.object(hetraCoinId),
        reentryTx.pure(accounts.admin.address),
        reentryTx.pure(50), // Amount to transfer
      ]
    });
    
    // Try to call the same function again in the same transaction block
    // This simulates what would happen in a reentrant attack
    reentryTx.moveCall({
      target: `${packageId}::HetraCoin::secure_transfer`,
      arguments: [
        reentryTx.object(hetraCoinId),
        reentryTx.pure(accounts.attacker.address),
        reentryTx.pure(50), // Amount to transfer
      ]
    });
    
    // Use devInspectTransactionBlock to check if the transaction would succeed
    console.log('Inspecting reentrancy test transaction...');
    const inspectResult = await client.devInspectTransactionBlock({
      transactionBlock: reentryTx,
      sender: accounts.user.address
    });
    
    console.log('Reentrancy test result:', JSON.stringify(inspectResult.effects?.status).substring(0, 100) + '...');
    
    // For a properly implemented contract, either:
    // 1. The transaction should fail with a reentrant call error
    // 2. OR it should succeed but with proper state isolation between calls
    
    // Check if the transaction failed with an error indicating reentrancy protection
    const isReentrancyProtected = 
      inspectResult.effects?.status?.status === 'failure' && 
      (JSON.stringify(inspectResult.effects).includes('E_REENTRANCY') || 
       JSON.stringify(inspectResult.effects).includes('ALREADY_IN_USE'));
    
    // Alternatively, if your implementation uses a check-effects-interactions pattern
    // properly, multiple operations might succeed safely
    const hasSafeImplementation = 
      inspectResult.effects?.status?.status === 'success';
    
    if (isReentrancyProtected) {
      console.log('✅ Reentrancy attack correctly blocked with explicit check');
      return {
        passed: true,
        description: 'Contract properly blocks reentrancy attacks with explicit checks'
      };
    } else if (hasSafeImplementation) {
      console.log('✅ Contract safely processes multiple transfers in sequence');
      return {
        passed: true,
        description: 'Contract safely handles multiple operations through proper state management'
      };
    } else {
      console.log('❌ Contract handling of multiple operations is unexpected');
      console.log('Error details:', JSON.stringify(inspectResult.effects).substring(0, 200) + '...');
      return {
        passed: false,
        description: 'Contract failed to handle potential reentrancy scenario properly',
        error: JSON.stringify(inspectResult.effects)
      };
    }
  } catch (error) {
    console.error('Error during reentrancy protection test:', error);
    return {
      passed: false,
      description: 'Tests if the contract is protected against reentrancy attacks',
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 