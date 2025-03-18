import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
  testnet: {
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
  },
  mainnet: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
  }
};

async function verifyDeployment(network: 'testnet' | 'mainnet') {
  console.log(`Verifying HetraCoin deployment on ${network}...`);
  
  // Load deployment info
  const deploymentFile = path.join(__dirname, `../deployment-${network}.json`);
  const initFile = path.join(__dirname, `../initialization-${network}.json`);
  
  if (!fs.existsSync(deploymentFile) || !fs.existsSync(initFile)) {
    console.error(`Deployment files for ${network} not found`);
    return false;
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  const init = JSON.parse(fs.readFileSync(initFile, 'utf8'));
  
  const client = new SuiClient({ url: CONFIG[network].rpcUrl });
  
  try {
    // 1. Verify package exists
    console.log(`Verifying package ${deployment.packageId}...`);
    const packageObj = await client.getObject({
      id: deployment.packageId,
      options: { showContent: true }
    });
    
    if (!packageObj) {
      throw new Error(`Package ${deployment.packageId} not found`);
    }
    console.log('✅ Package verified');
    
    // 2. Verify modules exist
    const modules = [
      'HetraCoin', 'Treasury', 'Governance', 'Staking', 
      'Proposal', 'Hetrafi', 'Escrow', 'LiquidityPool'
    ];
    
    for (const module of modules) {
      console.log(`Verifying module ${module}...`);
      const moduleObj = await client.getNormalizedMoveModule({
        package: deployment.packageId,
        module: module.toLowerCase()
      });
      
      if (!moduleObj) {
        throw new Error(`Module ${module} not found`);
      }
      console.log(`✅ Module ${module} verified`);
    }
    
    // 3. Verify shared objects
    console.log('Verifying shared objects...');
    
    // Check for Hetrafi marketplace
    const hetrafiObjects = await client.getOwnedObjects({
      owner: 'Shared',
      filter: { StructType: `${deployment.packageId}::hetrafi::Hetrafi` },
      options: { showContent: true }
    });
    
    if (!hetrafiObjects.data || hetrafiObjects.data.length === 0) {
      throw new Error('Hetrafi marketplace not found');
    }
    console.log('✅ Hetrafi marketplace verified');
    
    // Check for Staking pool
    const stakingObjects = await client.getOwnedObjects({
      owner: 'Shared',
      filter: { StructType: `${deployment.packageId}::staking::StakingPool` },
      options: { showContent: true }
    });
    
    if (!stakingObjects.data || stakingObjects.data.length === 0) {
      throw new Error('Staking pool not found');
    }
    console.log('✅ Staking pool verified');
    
    // Check for Governance system
    const governanceObjects = await client.getOwnedObjects({
      owner: 'Shared',
      filter: { StructType: `${deployment.packageId}::proposal::GovernanceSystem` },
      options: { showContent: true }
    });
    
    if (!governanceObjects.data || governanceObjects.data.length === 0) {
      throw new Error('Governance system not found');
    }
    console.log('✅ Governance system verified');
    
    console.log(`\n🎉 HetraCoin deployment on ${network} verified successfully!`);
    return true;
  } catch (error) {
    console.error(`Verification failed: ${error}`);
    return false;
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const network = (args[0] || 'testnet') as 'testnet' | 'mainnet';
  
  if (!['testnet', 'mainnet'].includes(network)) {
    console.error('Invalid network. Use "testnet" or "mainnet"');
    process.exit(1);
  }
  
  const success = await verifyDeployment(network);
  process.exit(success ? 0 : 1);
}

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { verifyDeployment }; 