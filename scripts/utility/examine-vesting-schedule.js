/**
 * Examine Vesting Schedule
 * 
 * This script examines the vesting schedule details directly from the blockchain.
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { fromB64 } = require('@mysten/sui.js/utils');
const { getCurrentNetwork, getNetworkConfig } = require('./network-config');

// Vault address from our previous tests
const VESTING_VAULT_ADDRESS = "0xad837d175c3a5f32c033b8c10e353b4ab455047c8b3ebc9318d052906a7f1fa6";
const BENEFICIARY_ADDRESS = "0xa64cdbc9c2030f77ca7a45aef2c095c37f1029e03a49de8e80a9a739c2a5e2cf";

async function main() {
  try {
    // Get network configuration
    const network = getCurrentNetwork();
    const config = getNetworkConfig();
    console.log(`Examining vesting schedule on ${network.toUpperCase()}...`);
    
    // Create Sui client
    const client = new SuiClient({ url: config.rpcUrl });
    
    // Get the current epoch
    const { epoch } = await client.getLatestSuiSystemState();
    console.log(`Current epoch: ${epoch}`);
    
    // Examine the vesting vault object
    const vaultObject = await client.getObject({
      id: VESTING_VAULT_ADDRESS,
      options: { showContent: true, showDisplay: true }
    });
    
    console.log('\n===== VESTING VAULT DETAILS =====');
    console.log(`Vault type: ${vaultObject.data?.type || 'Unknown'}`);
    
    // Get schedules table
    if (vaultObject.data?.content?.fields?.schedules?.fields?.id) {
      const tableId = vaultObject.data.content.fields.schedules.fields.id.id;
      const tableSize = vaultObject.data.content.fields.schedules.fields.size || '0';
      
      console.log(`Schedule table ID: ${tableId}`);
      console.log(`Number of schedules: ${tableSize}`);
      console.log(`Admin address: ${vaultObject.data.content.fields.admin || 'Unknown'}`);
      
      // Try to get table entries (requires dynamic field access)
      try {
        // First, get the field containing our beneficiary's schedules
        const dynamicFields = await client.getDynamicFields({
          parentId: tableId
        });
        
        console.log('\n===== SCHEDULE TABLE ENTRIES =====');
        console.log(`Total fields found: ${dynamicFields.data?.length || 0}`);
        
        // Look for our beneficiary's entry
        const beneficiaryEntry = dynamicFields.data?.find(field => 
          field.name?.value === BENEFICIARY_ADDRESS
        );
        
        if (beneficiaryEntry) {
          console.log(`Found entry for beneficiary: ${BENEFICIARY_ADDRESS}`);
          
          // Get the detailed object
          const scheduleObject = await client.getObject({
            id: beneficiaryEntry.objectId,
            options: { showContent: true, showDisplay: true }
          });
          
          // Extract the vector of schedules
          if (scheduleObject.data?.content?.fields?.value) {
            const schedules = scheduleObject.data.content.fields.value;
            console.log(`Schedule vector: ${JSON.stringify(schedules, null, 2)}`);
            
            // Parse the first schedule
            if (Array.isArray(schedules)) {
              schedules.forEach((schedule, index) => {
                console.log(`\n--- SCHEDULE ${index} ---`);
                console.log(`Total amount: ${schedule.total_amount || 'unknown'}`);
                console.log(`Claimed amount: ${schedule.claimed_amount || '0'}`);
                console.log(`Start time (epoch): ${schedule.start_time || 'unknown'}`);
                console.log(`Duration (epochs): ${schedule.duration || 'unknown'}`);
                console.log(`Cliff period (epochs): ${schedule.cliff_period || 'unknown'}`);
                console.log(`Revoked: ${schedule.revoked || 'false'}`);
                
                // Calculate remaining cliff time
                if (schedule.start_time && schedule.cliff_period) {
                  const startEpoch = parseInt(schedule.start_time);
                  const cliffEpoch = startEpoch + parseInt(schedule.cliff_period);
                  const epochsUntilCliff = cliffEpoch - epoch;
                  
                  console.log(`\nCliff calculations:`)
                  console.log(`Start epoch: ${startEpoch}`);
                  console.log(`Cliff ends at epoch: ${cliffEpoch}`);
                  console.log(`Current epoch: ${epoch}`);
                  console.log(`Epochs until cliff ends: ${epochsUntilCliff}`);
                  
                  if (epochsUntilCliff <= 0) {
                    console.log(`CLIFF PERIOD HAS PASSED! Tokens should be claimable.`);
                  } else {
                    console.log(`Cliff period not passed yet. Need to wait ${epochsUntilCliff} more epochs.`);
                  }
                }
              });
            }
          }
        } else {
          console.log(`No entry found for beneficiary: ${BENEFICIARY_ADDRESS}`);
        }
      } catch (error) {
        console.error('Error accessing dynamic fields:', error.message);
      }
    }
    
    // Try to claim tokens to see the exact error
    console.log('\n===== ATTEMPTING TOKEN CLAIM =====');
    try {
      // Create keypair from private key
      let keyData = fromB64(config.deployerPrivateKey);
      if (keyData.length !== 32) keyData = keyData.slice(0, 32);
      const keypair = Ed25519Keypair.fromSecretKey(keyData);
      
      // Build transaction
      const tx = new TransactionBlock();
      tx.setGasBudget(10000000);
      
      tx.moveCall({
        target: `${config.packageId}::Vesting::claim_vested_tokens`,
        arguments: [
          tx.object(VESTING_VAULT_ADDRESS),
          tx.pure(0) // Schedule index
        ]
      });
      
      // Execute transaction
      const result = await client.dryRunTransactionBlock({
        transactionBlock: tx,
        sender: BENEFICIARY_ADDRESS
      });
      
      console.log('Dry run result:', JSON.stringify(result.effects?.status, null, 2));
    } catch (error) {
      console.error('Error in dry run:', error.message);
    }
  } catch (error) {
    console.error('Error examining vesting schedule:', error);
    process.exit(1);
  }
}

// Run the script
main(); 