/**
 * Check Coin Metadata
 * 
 * This utility checks the on-chain metadata for the HetraCoin token
 * and helps diagnose issues with metadata not showing up in explorers.
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { getNetworkConfig } = require('./network-config');

async function main() {
  // Get command line arguments
  const cmdPackageId = process.argv[2];
  
  // Get network configuration
  const config = getNetworkConfig();
  const network = config.network;
  
  console.log(`Checking HetraCoin metadata on ${network}...`);
  
  // Create Sui client
  const client = new SuiClient({ url: config.rpcUrl });
  
  // Use package ID from command line if provided, otherwise from config
  let packageId = cmdPackageId || config.packageId;
  if (!packageId) {
    console.error('Package ID not found. Please provide it as a command-line argument:');
    console.error('  node scripts/utility/check-coin-metadata.js <package-id>');
    process.exit(1);
  }
  
  console.log(`Using Package ID: ${packageId}`);
  
  // First, find the CoinMetadata object by type
  try {
    const metadataType = `${packageId}::HetraCoin::HETRACOIN`;
    console.log(`Looking for CoinMetadata with type: ${metadataType}`);
    
    // Query objects by type
    const objects = await client.getOwnedObjects({
      owner: 'Immutable',
      filter: { StructType: `0x2::coin::CoinMetadata<${metadataType}>` },
      options: { showContent: true }
    });
    
    if (!objects.data || objects.data.length === 0) {
      console.log('No CoinMetadata objects found with Immutable owner.');
      
      // Try searching for objects with the type regardless of owner
      console.log('Searching for CoinMetadata objects with any owner...');
      const typeObjects = await client.queryObjects({
        query: { StructType: `0x2::coin::CoinMetadata<${metadataType}>` },
        options: { showContent: true }
      });
      
      if (!typeObjects.data || typeObjects.data.length === 0) {
        console.error('No CoinMetadata objects found at all. The metadata may not have been created correctly.');
        console.error('Please verify the package ID is correct and that HetraCoin module is published.');
        process.exit(1);
      } else {
        console.log(`Found ${typeObjects.data.length} CoinMetadata objects:`);
        displayMetadataObjects(typeObjects.data);
      }
    } else {
      console.log(`Found ${objects.data.length} CoinMetadata objects:`);
      displayMetadataObjects(objects.data);
    }
    
  } catch (error) {
    console.error('Error querying CoinMetadata:', error);
    process.exit(1);
  }
}

function displayMetadataObjects(objects) {
  objects.forEach((obj, index) => {
    console.log(`\nMetadata Object #${index + 1}:`);
    console.log(`ID: ${obj.data.objectId}`);
    
    if (obj.data.content && obj.data.content.dataType === 'moveObject') {
      const fields = obj.data.content.fields;
      console.log('Metadata fields:');
      console.log(`  Name: ${Buffer.from(fields.name).toString()}`);
      console.log(`  Symbol: ${Buffer.from(fields.symbol).toString()}`);
      console.log(`  Description: ${Buffer.from(fields.description).toString()}`);
      console.log(`  Decimals: ${fields.decimals}`);
      
      if (fields.icon_url && fields.icon_url.fields && fields.icon_url.fields.url) {
        const iconUrl = Buffer.from(fields.icon_url.fields.url).toString();
        console.log(`  Icon URL: ${iconUrl}`);
        console.log('\nIcon URL Diagnostics:');
        console.log(`  - URL properly formed: ${isValidUrl(iconUrl) ? 'Yes' : 'No'}`);
        console.log(`  - URL uses HTTPS: ${iconUrl.startsWith('https://') ? 'Yes' : 'No'}`);
        console.log(`  - Image hosted on reliable service: ${isReliableImageHost(iconUrl) ? 'Yes' : 'No'}`);
        
        if (!isValidUrl(iconUrl)) {
          console.log('  ❌ URL is not properly formed. Fix: Use a valid URL format');
        }
        if (!iconUrl.startsWith('https://')) {
          console.log('  ❌ URL does not use HTTPS. Fix: Use HTTPS for security and compatibility');
        }
        if (!isReliableImageHost(iconUrl)) {
          console.log('  ❌ Image not hosted on a reliable service. Fix: Use a reliable image hosting service');
          console.log('     Recommended services: Imgur, AWS S3, GitHub, Cloudflare, or IPFS gateway');
        }
      } else {
        console.log('  Icon URL: Not set');
        console.log('  ❌ No icon URL is set. Fix: Update metadata with a valid icon URL');
      }
    } else {
      console.log('No content or invalid content format');
    }
  });
  
  console.log('\nRecommendations for Metadata Issues:');
  console.log('1. Icon must be properly hosted on a reliable service (Imgur, AWS S3, etc.)');
  console.log('2. URL must use HTTPS protocol for security');
  console.log('3. Consider updating metadata if any issues are found');
  console.log('\nTo update metadata, you would need to create a migration script that:');
  console.log('- Creates new metadata with correct values');
  console.log('- Updates the coin to use the new metadata');
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isReliableImageHost(url) {
  const reliableHosts = [
    'imgur.com',
    'i.imgur.com',
    's3.amazonaws.com',
    'amazonaws.com',
    'cloudfront.net',
    'github.com',
    'githubusercontent.com',
    'cloudflare.com',
    'ipfs.io',
    'pinata.cloud',
    'arweave.net',
    'infura-ipfs.io'
  ];
  
  try {
    const hostname = new URL(url).hostname;
    return reliableHosts.some(host => hostname.includes(host));
  } catch {
    return false;
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { main }; 