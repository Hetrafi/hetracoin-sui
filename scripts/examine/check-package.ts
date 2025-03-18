/**
 * HetraCoin Package Inspector
 * 
 * This script examines the deployed package to see what modules and functions exist
 */
import { SuiClient } from '@mysten/sui.js/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Get the network from command line arguments
const network = process.argv[2] as 'testnet' | 'mainnet';
if (!network || (network !== 'testnet' && network !== 'mainnet')) {
  console.error('Please specify network: testnet or mainnet');
  process.exit(1);
}

async function inspectPackage() {
  console.log(`🔍 Inspecting package on ${network}...`);
  
  // Initialize client
  const rpcUrl = network === 'testnet' 
    ? 'https://fullnode.testnet.sui.io:443' 
    : 'https://fullnode.mainnet.sui.io:443';
  
  const client = new SuiClient({ url: rpcUrl });
  
  // Load deployment info
  console.log('Loading deployment info...');
  const deploymentPath = path.join(__dirname, `../../deployment-${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    console.error(`Deployment file not found: ${deploymentPath}`);
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log('Package ID from deployment file:', packageId);

  // Try to get the actual package ID from the initialization file
  let initPackageId = packageId;
  try {
    const initPath = path.join(__dirname, `../../initialization-${network}.json`);
    if (fs.existsSync(initPath)) {
      const initInfo = JSON.parse(fs.readFileSync(initPath, 'utf8'));
      if (initInfo.packageId) {
        console.log(`Found package ID in initialization file: ${initInfo.packageId}`);
        initPackageId = initInfo.packageId;
      }
    }
  } catch (error) {
    console.log('Error reading initialization file');
  }
  
  // Use the correct package ID for all operations
  const activePackageId = initPackageId || packageId;
  console.log(`Using package ID for inspection: ${activePackageId}`);

  // Get package details
  try {
    const packageDetails = await client.getObject({
      id: activePackageId,
      options: {
        showContent: true,
        showBcs: true,
      }
    });
    
    console.log('\n📦 Package Details:');
    
    if (packageDetails.data?.content?.dataType === 'package') {
      const modules = packageDetails.data.content.modules;
      console.log(`Found ${Object.keys(modules).length} modules:`);
      
      for (const [moduleName, moduleContent] of Object.entries(modules)) {
        console.log(`\n📄 Module: ${moduleName}`);
        
        // Extract function names from the module
        const functionPattern = /public\s+fun\s+([a-zA-Z0-9_]+)/g;
        const moduleString = moduleContent as string;
        let match;
        const functions = [];
        
        while ((match = functionPattern.exec(moduleString)) !== null) {
          functions.push(match[1]);
        }
        
        console.log(`Functions: ${functions.join(', ')}`);
      }
    } else {
      console.log('Package content not available or not in expected format');
    }
  } catch (error) {
    console.error('Error inspecting package:', error);
  }
}

inspectPackage().catch(error => {
  console.error('Error:', error);
  process.exit(1);
}); 