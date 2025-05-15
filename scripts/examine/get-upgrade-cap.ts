import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

/**
 * Get the upgrade cap ID for the package
 */
async function getUpgradeCap() {
  try {
    console.log('Retrieving UpgradeCap for the HetraCoin package...');
    
    // Get environment variables
    const deployerAddress = process.env.DEPLOYER_ADDRESS;
    const packageId = process.env.PACKAGE_ID;
    
    if (!deployerAddress || !packageId) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_ADDRESS and PACKAGE_ID are set in .env file');
    }
    
    console.log(`Deployer address: ${deployerAddress}`);
    console.log(`Package ID: ${packageId}`);
    
    // Get objects owned by the deployer
    const objects = await client.getOwnedObjects({
      owner: deployerAddress,
      options: {
        showContent: true,
        showType: true,
      },
    });
    
    // Filter for the upgrade cap
    const upgradeCap = objects.data.find(obj => {
      if (!obj.data?.type?.includes('0x2::package::UpgradeCap') || 
          obj.data.content?.dataType !== 'moveObject') {
        return false;
      }
      
      // Safely check if this is the upgrade cap for our package
      const fields = obj.data.content.fields as Record<string, unknown>;
      return fields && 
             typeof fields === 'object' && 
             'package' in fields && 
             fields.package === packageId;
    });
    
    if (!upgradeCap) {
      throw new Error('UpgradeCap not found for the package. Make sure the package was published with upgradeable cap and the deployer address is correct.');
    }
    
    const upgradeCapId = upgradeCap.data?.objectId;
    console.log(`\nFound UpgradeCap with ID: ${upgradeCapId}`);
    
    // Update the .env file with the upgrade cap ID
    console.log('\nUpdating .env file with the upgrade cap ID...');
    let envContent = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8');
    
    if (envContent.includes('UPGRADE_CAP_ID=')) {
      // Update existing variable
      envContent = envContent.replace(/UPGRADE_CAP_ID=.*/, `UPGRADE_CAP_ID=${upgradeCapId}`);
    } else {
      // Add new variable
      envContent += `\nUPGRADE_CAP_ID=${upgradeCapId}`;
    }
    
    fs.writeFileSync(path.join(__dirname, '../../.env'), envContent);
    console.log('Updated .env file with UPGRADE_CAP_ID');
    
    return upgradeCapId;
  } catch (error) {
    console.error('Error retrieving UpgradeCap:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  getUpgradeCap()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { getUpgradeCap }; 