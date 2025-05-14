import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';

dotenv.config();

async function main() {
  // Load deployment info
  const deploymentPath = path.join(__dirname, '../../deployment-phase1-testnet.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    process.exit(1);
  }
    
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log(`Package ID: ${packageId}`);
  
  // Initialize client
  const client = new SuiClient({
    url: 'https://fullnode.testnet.sui.io:443'
  });
  
  // Create keypair from the private key
  const privateKeyString = process.env.DEPLOYER_PRIVATE_KEY as string;
  let privateKeyArray = fromB64(privateKeyString);
  
  if (privateKeyArray.length !== 32) {
    // Handle different key formats
    if (privateKeyArray.length === 33 && privateKeyArray[0] === 0) {
      privateKeyArray = privateKeyArray.slice(1);
    } else {
      throw new Error(`Unexpected private key length: ${privateKeyArray.length}`);
    }
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyArray);
  const walletAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`Wallet address: ${walletAddress}`);
  
  // Construct coin type
  const coinType = `${packageId}::HetraCoin::HETRACOIN`;
  console.log(`Coin type: ${coinType}`);
  
  // Find metadata
  console.log("\nFinding CoinMetadata...");
  try {
    const metadataObjects = await client.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: `0x2::coin::CoinMetadata<${coinType}>` },
      options: { showContent: true, showDisplay: true }
    });
    
    console.log(`Found ${metadataObjects.data.length} metadata objects`);
    
    if (metadataObjects.data.length > 0) {
      const metadataId = metadataObjects.data[0].data?.objectId;
      console.log(`Metadata object ID: ${metadataId}`);
      
      // Get detailed metadata
      if (metadataId) {
        const metadata = await client.getObject({
          id: metadataId,
          options: { showContent: true, showDisplay: true }
        });
        
        console.log("\nMetadata Content:");
        console.log(JSON.stringify(metadata.data?.content, null, 2));
        
        if (metadata.data?.content && typeof metadata.data.content === 'object' && 'fields' in metadata.data.content) {
          const fields = metadata.data.content.fields;
          console.log("\nMetadata Fields:");
          console.log(JSON.stringify(fields, null, 2));
          
          if ('icon_url' in fields) {
            console.log("\nIcon URL:");
            console.log(JSON.stringify(fields.icon_url, null, 2));
          } else {
            console.log("\nNo icon_url field found in metadata");
          }
        }
      }
    } else {
      console.log("No metadata objects found");
    }
  } catch (e) {
    console.error("Error finding metadata:", e);
  }
  
  // Try to find Admin Registry
  console.log("\nFinding AdminRegistry...");
  try {
    const objects = await client.getOwnedObjects({
      owner: walletAddress,
      options: { showType: true, showContent: true }
    });
    
    // Look for AdminRegistry
    const adminRegistries = objects.data.filter(obj => 
      obj.data?.type?.includes(`${packageId}::HetraCoin::AdminRegistry`)
    );
    
    console.log(`Found ${adminRegistries.length} AdminRegistry objects`);
    
    // Look for EmergencyPauseState
    const pauseStates = objects.data.filter(obj => 
      obj.data?.type?.includes(`${packageId}::HetraCoin::EmergencyPauseState`)
    );
    
    console.log(`Found ${pauseStates.length} EmergencyPauseState objects`);
    
    // Explore shared objects
    console.log("\nChecking for shared objects...");
    try {
      const sharedObjects = await client.getObject({
        id: packageId,
        options: { showPreviousTransaction: true }
      });
      
      console.log("Package info:");
      console.log(JSON.stringify(sharedObjects, null, 2));
    } catch (e) {
      console.error("Error finding package info:", e);
    }
  } catch (e) {
    console.error("Error finding admin objects:", e);
  }
}

main().catch(console.error); 