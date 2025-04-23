import { TransactionBlock } from '@mysten/sui.js/transactions';
import { accounts, client, TEST_GAS_BUDGET, NETWORK, MOCK_MODE, sharedObjects } from './index';

// Test result type
export type TestResult = {
  passed: boolean;
  description: string;
  error?: string;
};

export async function runAccessControlTest(packageId: string): Promise<TestResult> {
  console.log('\n--- Testing Access Control Mechanisms ---');

  // For mock mode, simulate a passing test
  if (MOCK_MODE) {
    console.log('✅ [MOCK] Contract properly enforces access control');
    return {
      passed: true,
      description: 'Contract correctly enforces access control on privileged functions (mock test)'
    };
  }

  try {
    // Use the treasury cap that was created during initialization
    if (!sharedObjects.treasuryCapId) {
      throw new Error('Treasury cap ID not found in shared objects');
    }
    
    const treasuryCapId = sharedObjects.treasuryCapId;
    console.log(`Using treasury cap with ID: ${treasuryCapId}`);
    
    // Set up a transaction block for testing access control
    const accessControlTx = new TransactionBlock();
    
    if (NETWORK === 'testnet') {
      accessControlTx.setGasBudget(TEST_GAS_BUDGET);
      console.log(`Setting gas budget for access control test: ${TEST_GAS_BUDGET}`);
    }
    
    // Attempt to call the mint function with a non-admin account using the real treasury cap
    console.log('Creating access control test transaction...');
    accessControlTx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [
        accessControlTx.object(treasuryCapId), // Real treasury cap ID
        accessControlTx.pure('1000'),         // Amount to mint
      ],
    });
    
    // Use devInspectTransactionBlock to check if the transaction would succeed
    console.log('Inspecting unauthorized mint transaction...');
    const inspectResult = await client.devInspectTransactionBlock({
      transactionBlock: accessControlTx,
      sender: accounts.attacker.address  // Using attacker account to test access control
    });
    
    console.log('Access control test result:', JSON.stringify(inspectResult.effects?.status).substring(0, 100) + '...');
    
    // For a properly implemented contract, the transaction should fail because
    // the attacker doesn't have admin rights to mint tokens
    const isAccessControlled = 
      inspectResult.effects?.status?.status === 'failure' && 
      (JSON.stringify(inspectResult.effects).includes('E_NOT_AUTHORIZED') || 
       JSON.stringify(inspectResult.effects).includes('unauthorized') ||
       JSON.stringify(inspectResult.effects).includes('NotOwner') ||
       JSON.stringify(inspectResult.effects).includes('denied'));
    
    if (isAccessControlled) {
      console.log('✅ Contract properly enforces access control');
      return {
        passed: true,
        description: 'Contract correctly enforces access control on privileged functions'
      };
    } else {
      console.log('❌ Contract may have weak access control mechanisms');
      console.log('  - Non-admin accounts may be able to mint tokens');
      console.log('Error details:', JSON.stringify(inspectResult.effects).substring(0, 200) + '...');
      
      return {
        passed: false,
        description: 'Contract failed access control tests',
        error: JSON.stringify(inspectResult.effects)
      };
    }
  } catch (error) {
    console.error('Error during access control test:', error);
    return {
      passed: false,
      description: 'Tests if the contract properly controls access to privileged functions',
      error: error instanceof Error ? error.message : String(error)
    };
  }
} 