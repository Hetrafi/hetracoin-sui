import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('mainnet') });

/**
 * Format a number with commas for readability
 * @param num Number to format
 * @returns Formatted number string
 */
function formatNumber(num: bigint | number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Get current admin from the registry
 * 
 * @returns Current admin address
 */
async function getCurrentAdmin(): Promise<string> {
  try {
    // Get package ID and object IDs from environment variables
    const packageId = process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;

    if (!packageId || !adminRegistryId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and ADMIN_REGISTRY_ID are set in .env file');
    }
    
    // Create transaction block for readonly transaction
    const txb = new TransactionBlock();
    
    // Call the governance_admin function
    txb.moveCall({
      target: `${packageId}::HetraCoin::governance_admin`,
      arguments: [txb.object(adminRegistryId)],
    });
    
    // Set transaction as readonly (pure)
    const result = await client.devInspectTransactionBlock({
      transactionBlock: txb,
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    
    // Parse the result to extract the admin address
    if (result.results && result.results[0] && result.results[0].returnValues) {
      // Extract address bytes and convert to proper 0x format
      const addressBytes = result.results[0].returnValues[0][0];
      if (Array.isArray(addressBytes)) {
        // Convert array of bytes to hex string
        const addressHex = Array.from(addressBytes)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
        return `0x${addressHex}`;
      }
      
      // Fallback if format is different than expected
      return String(addressBytes);
    }
    
    throw new Error('Failed to get admin address');
  } catch (error) {
    console.error('Error getting admin:', error);
    throw error;
  }
}

/**
 * Find AdminCap object and its owner
 * 
 * @returns Object with AdminCap ID and owner address
 */
async function findAdminCap() {
  try {
    const packageId = process.env.PACKAGE_ID;
    const adminCapId = process.env.ADMIN_CAP_ID;
    
    if (!packageId) {
      throw new Error('PACKAGE_ID not found in .env file');
    }
    
    // If we already know the AdminCap ID, use it directly
    if (adminCapId) {
      console.log(`Using AdminCap ID from .env: ${adminCapId}`);
      
      // Get object details to find owner
      const adminCapObj = await client.getObject({
        id: adminCapId,
        options: {
          showOwner: true,
        },
      });
      
      if (!adminCapObj.data) {
        throw new Error(`AdminCap with ID ${adminCapId} not found`);
      }
      
      const owner = adminCapObj.data.owner;
      let ownerAddress = "Unknown";
      
      if (owner && typeof owner === 'object') {
        if ('AddressOwner' in owner) {
          ownerAddress = owner.AddressOwner;
        } else if ('ObjectOwner' in owner) {
          ownerAddress = owner.ObjectOwner;
        }
      }
      
      return {
        id: adminCapId,
        owner: ownerAddress,
        exists: true,
      };
    } else {
      console.log('AdminCap ID not found in .env, trying to find it by type...');
      
      // Try to find AdminCap by type query
      const adminCapType = `${packageId}::HetraCoin::AdminCap`;
      
      // Get objects by type using sui_getOwnedObjects RPC call
      // This is a simplified approach - for a comprehensive search, you'd need to
      // query all addresses or check object defs from the package
      
      // Use the current wallet address to try finding owned AdminCaps
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
      }
      
      const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
      const address = keypair.getPublicKey().toSuiAddress();
      
      const objects = await client.getOwnedObjects({
        owner: address,
        options: {
          showType: true,
          showContent: true,
        },
      });
      
      // Find AdminCap objects
      const adminCapObjects = objects.data.filter(obj => 
        obj.data && obj.data.type && obj.data.type.includes('AdminCap')
      );
      
      if (adminCapObjects.length > 0) {
        const adminCapObj = adminCapObjects[0];
        return {
          id: adminCapObj.data?.objectId || 'Unknown',
          owner: address,
          exists: true,
        };
      }
      
      // If we still don't find it, return unknown status
      return {
        id: 'Unknown',
        owner: 'Unknown',
        exists: false,
        note: 'AdminCap not found in current wallet. Add ADMIN_CAP_ID to .env for better results.'
      };
    }
  } catch (error) {
    console.error('Error finding AdminCap:', error);
    return {
      id: 'Error',
      owner: 'Error',
      exists: false,
      error: String(error)
    };
  }
}

/**
 * Get current wallet address from private key
 */
function getCurrentWalletAddress(): string | null {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }
  
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
  return keypair.getPublicKey().toSuiAddress();
}

/**
 * Find TreasuryCap object and its owner
 * 
 * @returns Object with TreasuryCap ID and owner address
 */
async function findTreasuryCap() {
  try {
    const packageId = process.env.PACKAGE_ID;
    const treasuryCapId = process.env.TREASURY_CAP_ID;
    
    if (!packageId) {
      throw new Error('PACKAGE_ID not found in .env file');
    }
    
    // If we already know the TreasuryCap ID, use it directly
    if (treasuryCapId) {
      console.log(`Using TreasuryCap ID from .env: ${treasuryCapId}`);
      
      // Get object details to find owner
      const treasuryCapObj = await client.getObject({
        id: treasuryCapId,
        options: {
          showOwner: true,
        },
      });
      
      if (!treasuryCapObj.data) {
        throw new Error(`TreasuryCap with ID ${treasuryCapId} not found`);
      }
      
      const owner = treasuryCapObj.data.owner;
      let ownerAddress = "Unknown";
      
      if (owner && typeof owner === 'object') {
        if ('AddressOwner' in owner) {
          ownerAddress = owner.AddressOwner;
        } else if ('ObjectOwner' in owner) {
          ownerAddress = owner.ObjectOwner;
        }
      }
      
      return {
        id: treasuryCapId,
        owner: ownerAddress,
        exists: true,
      };
    } else {
      console.log('TreasuryCap ID not found in .env, trying to find it by type...');
      
      // Try to find TreasuryCap by type query
      const treasuryCapType = `${packageId}::HetraCoin::TreasuryCap`;
      
      // Use the current wallet address to try finding owned TreasuryCaps
      const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('DEPLOYER_PRIVATE_KEY not found in .env file');
      }
      
      const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
      const address = keypair.getPublicKey().toSuiAddress();
      
      const objects = await client.getOwnedObjects({
        owner: address,
        options: {
          showType: true,
          showContent: true,
        },
      });
      
      // Find TreasuryCap objects
      const treasuryCapObjects = objects.data.filter(obj => 
        obj.data && obj.data.type && obj.data.type.includes('TreasuryCap')
      );
      
      if (treasuryCapObjects.length > 0) {
        const treasuryCapObj = treasuryCapObjects[0];
        return {
          id: treasuryCapObj.data?.objectId || 'Unknown',
          owner: address,
          exists: true,
        };
      }
      
      // If we still don't find it, return unknown status
      return {
        id: 'Unknown',
        owner: 'Unknown',
        exists: false,
        note: 'TreasuryCap not found in current wallet. Add TREASURY_CAP_ID to .env for better results.'
      };
    }
  } catch (error) {
    console.error('Error finding TreasuryCap:', error);
    return {
      id: 'Error',
      owner: 'Error',
      exists: false,
      error: String(error)
    };
  }
}

/**
 * Main function to check admin status
 */
async function checkAdminStatus() {
  console.log('=== HetraCoin Admin Status Check ===\n');
  
  try {
    // Get package info
    const packageId = process.env.PACKAGE_ID;
    console.log(`Package ID: ${packageId || 'Not set in .env'}\n`);
    
    // Get current admin from registry
    const adminAddress = await getCurrentAdmin();
    console.log('==== Admin Registry ====');
    console.log(`Current Admin: ${adminAddress}`);
    
    // Get current wallet
    const walletAddress = getCurrentWalletAddress();
    console.log(`Current Wallet: ${walletAddress || 'No wallet found (DEPLOYER_PRIVATE_KEY not set)'}`);
    
    if (walletAddress && adminAddress) {
      console.log(`Is Wallet the Admin?: ${walletAddress === adminAddress ? 'YES' : 'NO'}`);
    }
    
    // Get AdminCap info
    console.log('\n==== AdminCap Status ====');
    const adminCap = await findAdminCap();
    console.log(`AdminCap ID: ${adminCap.id}`);
    console.log(`AdminCap Owner: ${adminCap.owner}`);
    
    if (adminCap.exists && walletAddress) {
      console.log(`Wallet has AdminCap?: ${adminCap.owner === walletAddress ? 'YES' : 'NO'}`);
    }
    
    if (adminCap.note) {
      console.log(`Note: ${adminCap.note}`);
    }
    
    // Get TreasuryCap info
    console.log('\n==== TreasuryCap Status ====');
    const treasuryCap = await findTreasuryCap();
    console.log(`TreasuryCap ID: ${treasuryCap.id}`);
    console.log(`TreasuryCap Owner: ${treasuryCap.owner}`);
    
    if (treasuryCap.exists && walletAddress) {
      console.log(`Wallet has TreasuryCap?: ${treasuryCap.owner === walletAddress ? 'YES' : 'NO'}`);
    }
    
    if (treasuryCap.note) {
      console.log(`Note: ${treasuryCap.note}`);
    }
    
    // Overall admin status
    console.log('\n==== Overall Admin Status ====');
    if (walletAddress) {
      const isRegistryAdmin = adminAddress === walletAddress;
      const hasAdminCap = adminCap.exists && adminCap.owner === walletAddress;
      const hasTreasuryCap = treasuryCap.exists && treasuryCap.owner === walletAddress;
      
      // Determine overall status with all three components
      if (isRegistryAdmin && hasAdminCap && hasTreasuryCap) {
        console.log('✅ COMPLETE ADMIN ACCESS: Your wallet is the admin, has the AdminCap, and has the TreasuryCap');
      } else if (isRegistryAdmin && hasAdminCap) {
        console.log('⚠️ STRONG ADMIN ACCESS: Your wallet is the admin and has the AdminCap, but does not have the TreasuryCap');
      } else if (isRegistryAdmin && hasTreasuryCap) {
        console.log('⚠️ PARTIAL ADMIN ACCESS: Your wallet is the admin and has the TreasuryCap, but does not have the AdminCap');
      } else if (hasAdminCap && hasTreasuryCap) {
        console.log('⚠️ PARTIAL ADMIN ACCESS: Your wallet has both the AdminCap and TreasuryCap, but is not the admin in the registry');
      } else if (isRegistryAdmin) {
        console.log('⚠️ LIMITED ADMIN ACCESS: Your wallet is the admin in the registry, but has neither the AdminCap nor TreasuryCap');
      } else if (hasAdminCap) {
        console.log('⚠️ MINIMAL ADMIN ACCESS: Your wallet has the AdminCap, but is not the admin and does not have the TreasuryCap');
      } else if (hasTreasuryCap) {
        console.log('⚠️ MINIMAL ADMIN ACCESS: Your wallet has the TreasuryCap, but is not the admin and does not have the AdminCap');
      } else {
        console.log('❌ NO ADMIN ACCESS: Your wallet is not the admin and has neither the AdminCap nor the TreasuryCap');
      }
      
      // Recommendations
      console.log('\n==== Recommendations ====');
      if (!isRegistryAdmin && !hasAdminCap && !hasTreasuryCap) {
        console.log('You need to get admin rights from the current admin holders');
      } else {
        // Build specific recommendations based on what's missing
        let recommendationCount = 1;
        
        if (!isRegistryAdmin) {
          if (hasAdminCap) {
            console.log(`${recommendationCount}. Use your AdminCap to change the admin registry to your address:`);
            console.log(`   npx ts-node scripts/coin-functions/admin.ts change-admin ${walletAddress}`);
            recommendationCount++;
          } else {
            console.log(`${recommendationCount}. Get the AdminCap first, then change the admin registry to your address`);
            recommendationCount++;
          }
        }
        
        if (!hasAdminCap) {
          console.log(`${recommendationCount}. Ask the AdminCap holder to transfer the AdminCap to you:`);
          console.log(`   npx ts-node scripts/coin-functions/admin.ts transfer-cap ${walletAddress}`);
          console.log(`   Current holder: ${adminCap.owner}`);
          recommendationCount++;
        }
        
        if (!hasTreasuryCap) {
          console.log(`${recommendationCount}. Ask the TreasuryCap holder to transfer the TreasuryCap to you:`);
          console.log(`   Use a direct transfer command or initiate a treasury cap transfer`);
          console.log(`   Current holder: ${treasuryCap.owner}`);
          recommendationCount++;
        }
        
        if (isRegistryAdmin && hasAdminCap && hasTreasuryCap) {
          console.log('You have complete admin access - no action needed');
        }
      }
    } else {
      console.log('❓ Cannot determine admin status: No wallet key provided in .env');
    }
    
  } catch (error) {
    console.error(`\nError checking admin status: ${error}`);
  }
}

// Execute if run directly
if (require.main === module) {
  checkAdminStatus();
}

export { checkAdminStatus, getCurrentAdmin, findAdminCap, findTreasuryCap }; 