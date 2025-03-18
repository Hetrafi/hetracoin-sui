import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';

async function listModules() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, '../../deployment-testnet.json');
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  
  console.log('Package ID:', packageId);
  
  try {
    // Get package object
    const packageObj = await client.getObject({
      id: packageId,
      options: { showContent: true }
    });
    
    console.log('\n📦 Modules in Package:');
    
    // Extract modules
    if (packageObj.data?.content?.dataType === 'package') {
      const modules = packageObj.data.content.disassembled;
      if (modules) {
        for (const moduleName of Object.keys(modules)) {
          console.log(`- ${moduleName}`);
        }
      } else {
        console.log('No modules found in package');
      }
    }
  } catch (error) {
    console.error('Error listing modules:', error);
  }
}

listModules().catch(console.error); 