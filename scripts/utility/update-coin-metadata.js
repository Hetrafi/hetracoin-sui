/**
 * Update Coin Metadata
 * 
 * This utility updates the metadata for the HetraCoin token on-chain.
 * It's useful for fixing issues with metadata not showing up correctly in explorers.
 * 
 * Usage: node scripts/utility/update-coin-metadata.js [package-id] [treasury-cap-id]
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { fromB64 } = require('@mysten/sui.js/utils');
const { getNetworkConfig } = require('./network-config');

async function main() {
  // Get command line arguments
  const cmdPackageId = process.argv[2];
  const cmdTreasuryCapId = process.argv[3];
  
  // Get network configuration
  const config = getNetworkConfig();
  const network = config.network;
  
  console.log(`Preparing to update HetraCoin metadata on ${network}...`);
  
  // Create Sui client
  const client = new SuiClient({ url: config.rpcUrl });
  
  // Use package ID from command line if provided, otherwise from config
  let packageId = cmdPackageId || config.packageId;
  if (!packageId) {
    console.error('Package ID not found. Please provide it as a command-line argument:');
    console.error('  node scripts/utility/update-coin-metadata.js <package-id> [treasury-cap-id]');
    process.exit(1);
  }
  
  // Get the admin private key
  if (!config.deployerPrivateKey) {
    console.error('Deployer private key not found in environment variables');
    process.exit(1);
  }
  
  // Create keypair from private key
  let keyData = fromB64(config.deployerPrivateKey);
  if (keyData.length !== 32) {
    keyData = keyData.slice(0, 32);
  }
  const keypair = Ed25519Keypair.fromSecretKey(keyData);
  const sender = keypair.getPublicKey().toSuiAddress();
  
  console.log(`Using deployer address: ${sender}`);
  console.log(`Using package ID: ${packageId}`);
  
  // First, find the current CoinMetadata object
  const metadataType = `${packageId}::HetraCoin::HETRACOIN`;
  console.log(`Looking for CoinMetadata with type: ${metadataType}`);
  
  try {
    // Try searching for objects with the type regardless of owner
    const typeObjects = await client.queryObjects({
      query: { StructType: `0x2::coin::CoinMetadata<${metadataType}>` },
      options: { showContent: true }
    });
    
    if (!typeObjects.data || typeObjects.data.length === 0) {
      console.error('No CoinMetadata objects found. Cannot update metadata.');
      console.error('Please verify the package ID is correct and that HetraCoin module is published.');
      process.exit(1);
    }
    
    // Get the metadata object
    const metadataObject = typeObjects.data[0];
    console.log(`Found metadata object with ID: ${metadataObject.data.objectId}`);
    
    // Use treasury cap ID from command line if provided, otherwise from config
    let treasuryCapId = cmdTreasuryCapId || config.treasuryCapId;
    if (!treasuryCapId) {
      console.error('Treasury cap ID not found. Please provide it as a command-line argument:');
      console.error('  node scripts/utility/update-coin-metadata.js <package-id> <treasury-cap-id>');
      process.exit(1);
    }
    
    console.log(`Using treasury cap ID: ${treasuryCapId}`);
    
    // Create transaction to update metadata
    const tx = new TransactionBlock();
    
    // Function to update metadata
    tx.moveCall({
      target: `0x2::coin::update_metadata`,
      arguments: [
        tx.object(treasuryCapId),
        tx.pure("HetraCoin"), // name
        tx.pure("HETRA"), // symbol
        tx.pure("The official decentralized gaming token powering the Hetrafi ecosystem"), // description
        tx.pure("https://i.imgur.com/5UHvXlN.png"), // icon URL - we're using the same URL but ensuring it's properly updated
        tx.pure(9) // decimals
      ],
      typeArguments: [metadataType]
    });
    
    console.log('Executing metadata update transaction...');
    
    // Execute transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
    
    console.log('Metadata update transaction executed!');
    console.log('Transaction digest:', result.digest);
    
    // Provide explorer link
    const explorerUrl = network === 'mainnet' 
      ? `https://suiscan.xyz/mainnet/tx/${result.digest}`
      : `https://suiscan.xyz/testnet/tx/${result.digest}`;
    
    console.log(`View transaction on Suiscan: ${explorerUrl}`);
    
    // Check if transaction was successful
    if (result.effects && result.effects.status && result.effects.status.status === 'success') {
      console.log('Metadata updated successfully!');
    } else {
      console.error('Transaction failed:', result.effects?.status);
    }
    
  } catch (error) {
    console.error('Error updating metadata:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { main }; 