/**
 * Check Epoch Script
 * 
 * This script checks the current epoch on the Sui blockchain.
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { getCurrentNetwork, getNetworkConfig } = require('./network-config');

async function main() {
  try {
    // Get network configuration
    const network = getCurrentNetwork();
    const config = getNetworkConfig();
    console.log(`Checking epoch on ${network}...`);
    
    // Create Sui client
    const client = new SuiClient({ url: config.rpcUrl });
    
    // Get current epoch
    const { epoch } = await client.getLatestSuiSystemState();
    
    console.log(`Current epoch: ${epoch}`);
    console.log(`Current time: ${new Date().toLocaleString()}`);
    
    // Wait a minute and check again
    console.log("\nWaiting 60 seconds...");
    setTimeout(async () => {
      const { epoch: newEpoch } = await client.getLatestSuiSystemState();
      const currentTime = new Date();
      
      console.log(`New epoch: ${newEpoch}`);
      console.log(`Current time: ${currentTime.toLocaleString()}`);
      
      if (newEpoch !== epoch) {
        console.log(`\nEpoch advanced by ${newEpoch - epoch} in 60 seconds`);
        const epochsPerMinute = newEpoch - epoch;
        console.log(`Estimated epochs per minute: ${epochsPerMinute}`);
        console.log(`Estimated seconds per epoch: ${60 / epochsPerMinute}`);
      } else {
        console.log("\nEpoch did not change in 60 seconds");
      }
    }, 60000);
    
  } catch (error) {
    console.error('Error checking epoch:', error);
    process.exit(1);
  }
}

// Run the script
main(); 