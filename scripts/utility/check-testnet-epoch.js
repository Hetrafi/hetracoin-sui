/**
 * Testnet Epoch Investigation Script
 * 
 * This script checks the current epoch on the Sui testnet and investigates
 * a vesting vault's schedule details to understand epoch progression.
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { getCurrentNetwork, getNetworkConfig } = require('./network-config');

// Vault address from our previous tests
const VESTING_VAULT_ADDRESS = "0xad837d175c3a5f32c033b8c10e353b4ab455047c8b3ebc9318d052906a7f1fa6";
const BENEFICIARY_ADDRESS = "0xa64cdbc9c2030f77ca7a45aef2c095c37f1029e03a49de8e80a9a739c2a5e2cf";
const SCHEDULE_INDEX = 0;

async function main() {
  try {
    // Get network configuration
    const network = getCurrentNetwork();
    const config = getNetworkConfig();
    console.log(`Investigating epochs on ${network.toUpperCase()}...`);
    
    // Create Sui client
    const client = new SuiClient({ url: config.rpcUrl });
    
    // 1. Get current epoch
    const { epoch, epochDurationMs, epochStartTimestampMs } = await client.getLatestSuiSystemState();
    
    // Calculate epoch details
    const currentTime = new Date();
    const epochStartTime = new Date(epochStartTimestampMs);
    const elapsedMs = currentTime.getTime() - epochStartTime.getTime();
    const timeUntilNextEpoch = Math.max(0, epochDurationMs - elapsedMs);
    
    console.log('\n===== EPOCH INFORMATION =====');
    console.log(`Current epoch: ${epoch}`);
    console.log(`Current time: ${currentTime.toLocaleString()}`);
    console.log(`Epoch start time: ${epochStartTime.toLocaleString()}`);
    console.log(`Epoch duration: ${epochDurationMs / 1000 / 60} minutes`);
    console.log(`Time elapsed in current epoch: ${elapsedMs / 1000 / 60} minutes`);
    console.log(`Approximate time until next epoch: ${timeUntilNextEpoch / 1000 / 60} minutes`);
    
    // 2. Examine the vesting vault object
    console.log('\n===== VESTING VAULT DETAILS =====');
    try {
      const vaultObject = await client.getObject({
        id: VESTING_VAULT_ADDRESS,
        options: { showContent: true, showDisplay: true }
      });
      
      console.log(`Vault type: ${vaultObject.data?.type || 'Unknown'}`);
      
      // 3. Try to get vesting schedule details
      console.log('\n===== CHECKING VESTING SCHEDULE =====');
      const tx = new TransactionBlock();
      tx.setGasBudget(10000000);
      
      // Call get_claimable_amount to get details about the schedule
      tx.moveCall({
        target: `${config.packageId}::Vesting::get_claimable_amount`,
        arguments: [
          tx.object(VESTING_VAULT_ADDRESS),
          tx.pure(BENEFICIARY_ADDRESS),
          tx.pure(SCHEDULE_INDEX),
          tx.pure(epoch) // Use current epoch
        ]
      });
      
      // Execute the transaction
      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: BENEFICIARY_ADDRESS
      });
      
      console.log(`Vesting schedule details for beneficiary ${BENEFICIARY_ADDRESS}:`);
      console.log(`Schedule index: ${SCHEDULE_INDEX}`);
      
      if (result.results && result.results[0] && result.results[0].returnValues) {
        const claimableAmount = result.results[0].returnValues[0];
        console.log(`Claimable amount: ${claimableAmount}`);
        
        if (parseInt(claimableAmount) === 0) {
          console.log('No tokens are claimable yet, cliff period has not passed.');
        } else {
          console.log('Tokens are now claimable! Cliff period has passed.');
        }
      } else {
        console.log('Could not retrieve claimable amount. Schedule might not exist.');
      }
      
      // Try to get vesting vault tables directly using Object API
      console.log('\n===== VESTING VAULT TABLE CONTENTS =====');
      if (vaultObject.data?.content?.fields?.schedules?.fields?.id) {
        const tableId = vaultObject.data.content.fields.schedules.fields.id.id;
        const tableSize = vaultObject.data.content.fields.schedules.fields.size || '0';
        
        console.log(`Schedule table ID: ${tableId}`);
        console.log(`Number of schedules: ${tableSize}`);
        
        if (tableSize !== '0') {
          console.log(`Admin address: ${vaultObject.data.content.fields.admin || 'Unknown'}`);
          console.log(`Total allocated: ${vaultObject.data.content.fields.total_allocated || '0'}`);
          console.log(`Token balance: ${vaultObject.data.content.fields.token_balance || '0'}`);
        }
      }
      
    } catch (error) {
      console.error('Error examining vesting vault:', error.message);
    }
    
  } catch (error) {
    console.error('Error investigating testnet epochs:', error);
    process.exit(1);
  }
}

// Run the script
main(); 