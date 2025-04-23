import { TransactionBlock } from '@mysten/sui.js/transactions';
import { accounts, client, TEST_GAS_BUDGET, NETWORK, MOCK_MODE, sharedObjects } from './index';
import { DevInspectResults } from '@mysten/sui.js/client';

// Test result type
export type TestResult = {
  passed: boolean;
  description: string;
  error?: string;
};

export async function runUnauthorizedMintTest(packageId: string): Promise<TestResult> {
  console.log('\n--- Testing Unauthorized Mint Protection ---');
  
  // For mock mode, simulate a passing test
  if (MOCK_MODE) {
    console.log('✅ [MOCK] Unauthorized mint correctly prevented');
    return {
      passed: true,
      description: 'Contract properly prevents unauthorized minting (mock test)'
    };
  }
  
  try {
    // Use the treasury cap that was created during initialization
    if (!sharedObjects.treasuryCapId) {
      throw new Error('Treasury cap ID not found in shared objects');
    }
    
    const treasuryCapId = sharedObjects.treasuryCapId;
    console.log(`Using treasury cap with ID: ${treasuryCapId}`);
    
    // Now set up an attacker transaction to try to mint coins with the real treasury cap
    const attackTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      attackTx.setGasBudget(TEST_GAS_BUDGET);
      console.log(`Setting gas budget for test: ${TEST_GAS_BUDGET}`);
    }
    
    // Attempt to mint coins as the attacker using the real treasury cap ID
    console.log('Attempting unauthorized mint by attacker...');
    attackTx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        attackTx.object(treasuryCapId), // Real treasury cap ID
        attackTx.pure(1000),
      ],
    });
    
    // Use devInspectTransactionBlock to check transaction without executing
    const inspectResult = await client.devInspectTransactionBlock({
      transactionBlock: attackTx,
      sender: accounts.attacker.address
    });
    
    // Check if the transaction failed with the expected error
    const errorFound = inspectResult.effects?.status?.status === 'failure';
    const errorContainsUnauthorized = JSON.stringify(inspectResult.effects).includes('E_NOT_AUTHORIZED') || 
                                     JSON.stringify(inspectResult.effects).includes('NotOwner');
    
    if (errorFound && errorContainsUnauthorized) {
      console.log('✅ Unauthorized mint correctly prevented');
      return {
        passed: true,
        description: 'Contract properly prevents unauthorized minting'
      };
    } else if (errorFound) {
      console.log('⚠️ Mint failed but not because of the authorization check');
      console.log('Error details:', JSON.stringify(inspectResult.effects).substring(0, 200) + '...');
      return {
        passed: false,
        description: 'Contract rejected the mint but for unexpected reasons',
        error: JSON.stringify(inspectResult.effects)
      };
    } else {
      console.log('❌ Unauthorized mint should have failed but was accepted');
      return {
        passed: false,
        description: 'Contract allowed unauthorized minting',
        error: 'Unauthorized mint should have been rejected but was accepted'
      };
    }
  } catch (error) {
    console.error('Error during unauthorized mint test:', error);
    return {
      passed: false,
      description: 'Tests if unauthorized addresses can mint tokens',
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 