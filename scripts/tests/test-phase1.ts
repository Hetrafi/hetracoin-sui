import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const privateKeyBase64 = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKeyBase64) {
    throw new Error('Missing DEPLOYER_PRIVATE_KEY in .env file');
  }

  // Setup provider and keypair
  const privateKeyBytes = Buffer.from(privateKeyBase64, 'base64');
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
  const provider = new SuiClient({
    url: 'https://fullnode.testnet.sui.io',
  });
  const address = keypair.getPublicKey().toSuiAddress();

  // Replace with your actual package ID after deployment
  const packageId = process.env.PACKAGE_ID;
  if (!packageId) {
    throw new Error('Missing PACKAGE_ID in .env file');
  }
  
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
  
  // 2. Find shared objects
  console.log("Searching for shared objects...");
  const packageDynamicFields = await provider.getDynamicFields({
    parentId: packageId
  });
  
  console.log("Package dynamic fields:", packageDynamicFields.data);
  
  // Find AdminRegistry and EmergencyPauseState
  const adminRegistryObjects = await provider.getOwnedObjects({
    owner: "0x0000000000000000000000000000000000000000",
    filter: { StructType: `${packageId}::HetraCoin::AdminRegistry` },
    options: { showType: true }
  });
  console.log("Admin Registry search:", adminRegistryObjects);
  
  const pauseState = await provider.getOwnedObjects({
    owner: "0x0000000000000000000000000000000000000000",
    filter: { StructType: `${packageId}::HetraCoin::EmergencyPauseState` },
    options: { showType: true }
  });
  console.log("EmergencyPauseState search:", pauseState);
  
  // 3. Try to mint some tokens (if we have TreasuryCap)
  if (treasuryCap?.data?.objectId) {
    console.log("Testing mint functionality...");
    
    // Need to find AdminRegistry and EmergencyPauseState first
    const dynamicFields = await provider.getDynamicFields({ parentId: packageId });
    console.log("Dynamic fields:", dynamicFields);
    
    // Try a different query approach
    const suiObjects = await provider.getObject({
      id: packageId,
      options: { showContent: true }
    });
    console.log("Package details:", suiObjects);
  }
}

main().catch(console.error);
