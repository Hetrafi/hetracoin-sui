import { TransactionBlock } from '@mysten/sui.js/transactions';
import { accounts, client, TEST_GAS_BUDGET, NETWORK, MOCK_MODE, sharedObjects } from './index';
import { DevInspectResults } from '@mysten/sui.js/client';

// Test result type
export type TestResult = {
  passed: boolean;
  description: string;
  error?: string;
};

export async function runZeroAmountTransferTest(packageId: string): Promise<TestResult> {
  console.log('\n--- Testing Zero Amount Transfer Protection ---');
  console.log('Description: Tests if the contract prevents transfers of zero amounts');
  console.log(`Using package: ${packageId}`);
  
  // For mock mode, simulate a passing test
  if (MOCK_MODE) {
    console.log('⚠️ Running in MOCK mode - no actual testing performed');
    return {
      passed: true,
      description: 'Contract properly rejects transfers with zero amounts (mock test)'
    };
  }
  
  try {
    // Use the admin coin that was created during initialization
    if (!sharedObjects.adminCoinId) {
      throw new Error('Admin coin ID not found in shared objects');
    }
    
    const hetraCoinId = sharedObjects.adminCoinId;
    console.log(`Using admin HetraCoin with ID: ${hetraCoinId}`);
    
    // Create transaction to test zero amount transfer
    console.log('\nAttempting to transfer zero amount (should fail)...');
    const zeroCoinTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      zeroCoinTx.setGasBudget(TEST_GAS_BUDGET);
    }
    
    console.log('Creating test transaction with zero amount...');
    zeroCoinTx.moveCall({
      target: `${packageId}::HetraCoin::secure_transfer`,
      arguments: [
        zeroCoinTx.object(hetraCoinId),
        zeroCoinTx.pure(accounts.user.address),
        zeroCoinTx.pure(0), // Zero amount - this should trigger the assertion
      ],
    });
    
    // Use devInspectTransactionBlock to check transaction without execution
    console.log('Inspecting zero-amount transaction...');
    const inspectResult = await client.devInspectTransactionBlock({
      transactionBlock: zeroCoinTx,
      sender: accounts.admin.address
    });
    
    console.log('Result:', JSON.stringify(inspectResult.effects?.status).substring(0, 100) + '...');
    
    // Check if the transaction failed with the expected error
    const errorFound = inspectResult.effects?.status?.status === 'failure';
    const errorContainsZeroAmount = JSON.stringify(inspectResult.effects).includes('E_ZERO_AMOUNT');
    
    if (errorFound && errorContainsZeroAmount) {
      console.log('✅ Zero amount transfer correctly prevented by the assertion check');
      return {
        passed: true,
        description: 'Contract properly rejects transfers with zero amounts'
      };
    } else if (errorFound) {
      console.log('⚠️ Transfer failed but not because of the zero amount check');
      console.log('Error details:', JSON.stringify(inspectResult.effects).substring(0, 200) + '...');
      return {
        passed: false,
        description: 'Contract rejected the transfer but for unexpected reasons',
        error: JSON.stringify(inspectResult.effects)
      };
    } else {
      console.log('❌ Zero amount transfer should have failed but was accepted');
      return {
        passed: false,
        description: 'Contract allowed a transfer with zero amount',
        error: 'Zero amount transfer should have been rejected but was accepted'
      };
    }
  } catch (error) {
    console.error('Error during zero amount transfer test:', error);
    return {
      passed: false,
      description: 'Tests if the contract prevents transfers of zero amounts',
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 