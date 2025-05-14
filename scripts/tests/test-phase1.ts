import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Set package ID directly since we know it from deployment
  const packageId = '0x8667452485be796d6cb4ad2fce0d8e19734c1eb2a673b483186c7dc1b4062369';
  const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY || '5n7DJoMI7j/h4+0KB6ApWG6qe6b2EyzcabAxOmskagE=';

  // Setup provider and keypair
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  const address = keypair.getPublicKey().toSuiAddress();
  
  console.log("Testing package:", packageId);
  console.log("From address:", address);
  
  // 1. First, find all objects
  const objects = await provider.getOwnedObjects({
    owner: address,
    options: { showContent: true, showType: true }
  });
  console.log("Found objects:", objects.data.length);
  
  // Find the TreasuryCap
  const treasuryCap = objects.data.find(obj => 
    obj.data?.type?.includes('TreasuryCap') && 
    obj.data?.type?.includes('HETRACOIN')
  );
  
  // Find the AdminCap
  const adminCap = objects.data.find(obj => 
    obj.data?.type?.includes('AdminCap')
  );
  
  console.log("TreasuryCap:", treasuryCap?.data?.objectId);
  console.log("AdminCap:", adminCap?.data?.objectId);
  
  // 2. Examine owned objects in more detail
  console.log("\nExamining owned objects in detail...");
  
  // List all owned objects with their types
  console.log("\nAll owned objects:");
  objects.data.forEach((obj, index) => {
    if (obj.data && obj.data.type) {
      console.log(`${index + 1}. ${obj.data.type}: ${obj.data.objectId}`);
    }
  });
  
  // 3. Examine TreasuryCap in more detail if available
  if (treasuryCap?.data?.objectId) {
    try {
      console.log("\nFetching TreasuryCap details...");
      const treasuryCapDetails = await provider.getObject({
        id: treasuryCap.data.objectId,
        options: { showContent: true, showOwner: true }
      });
      console.log("TreasuryCap details:", JSON.stringify(treasuryCapDetails.data, null, 2));
    } catch (error) {
      console.error("Error fetching TreasuryCap details:", error);
    }
  }
  
  // 4. Examine AdminCap in more detail if available
  if (adminCap?.data?.objectId) {
    try {
      console.log("\nFetching AdminCap details...");
      const adminCapDetails = await provider.getObject({
        id: adminCap.data.objectId,
        options: { showContent: true, showOwner: true }
      });
      console.log("AdminCap details:", JSON.stringify(adminCapDetails.data, null, 2));
    } catch (error) {
      console.error("Error fetching AdminCap details:", error);
    }
  }
  
  // 5. Search for CoinMetadata
  console.log("\nSearching for CoinMetadata directly...");
  try {
    const metadataObjects = objects.data.filter(obj => 
      obj.data?.type?.includes('CoinMetadata')
    );
      
    if (metadataObjects.length > 0) {
      console.log(`Found ${metadataObjects.length} CoinMetadata objects:`);
      
      for (const obj of metadataObjects) {
        if (obj.data?.objectId) {
          const metadata = await provider.getObject({
            id: obj.data.objectId,
            options: { showContent: true, showDisplay: true }
          });
          console.log("Metadata details:", JSON.stringify(metadata.data, null, 2));
        }
      }
    } else {
      console.log("No CoinMetadata objects found among owned objects");
    }
  } catch (error) {
    console.error("Error fetching CoinMetadata:", error);
  }
  
  // 6. Summary
  if (treasuryCap?.data?.objectId && adminCap?.data?.objectId) {
    console.log("\nDeployment verification completed successfully!");
    console.log("Your HetraCoin contract is deployed and contains the necessary capabilities:");
    console.log(`- Treasury Cap: ${treasuryCap.data.objectId}`);
    console.log(`- Admin Cap: ${adminCap.data.objectId}`);
    console.log("You can now proceed with further testing or integration.");
  } else {
    console.log("\nDeployment verification incomplete - missing critical objects:");
    if (!treasuryCap?.data?.objectId) console.log("- Missing TreasuryCap");
    if (!adminCap?.data?.objectId) console.log("- Missing AdminCap");
  }
}

main().catch(console.error);
