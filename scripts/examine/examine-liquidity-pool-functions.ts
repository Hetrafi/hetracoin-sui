import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';

async function examineLiquidityPoolFunctions() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, '../../deployment-testnet.json');
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  
  console.log('Package ID:', packageId);
  
  try {
    // Get normalized module data
    const moduleData = await client.getNormalizedMoveModule({
      package: packageId,
      module: 'LiquidityPool'
    });
    
    console.log('\n📦 LiquidityPool Module Functions:');
    
    // List all functions
    for (const [funcName, funcData] of Object.entries(moduleData.exposedFunctions)) {
      console.log(`\nFunction: ${funcName}`);
      console.log(`Visibility: ${funcData.visibility}`);
      console.log(`Is Entry: ${funcData.isEntry}`);
      
      if (funcData.parameters && funcData.parameters.length > 0) {
        console.log('Parameters:');
        funcData.parameters.forEach((param, index) => {
          console.log(`  ${index}: ${JSON.stringify(param)}`);
        });
      }
      
      if (funcData.typeParameters && funcData.typeParameters.length > 0) {
        console.log('Type Parameters:');
        funcData.typeParameters.forEach((typeParam, index) => {
          console.log(`  ${index}: ${JSON.stringify(typeParam)}`);
        });
      }
    }
  } catch (error) {
    console.error('Error examining LiquidityPool functions:', error);
  }
}

examineLiquidityPoolFunctions().catch(console.error); 