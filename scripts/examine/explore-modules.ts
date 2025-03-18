import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function exploreModules() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Load deployment info
  const deploymentInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '../../deployment-testnet.json'), 'utf8'));
  const packageId = deploymentInfo.packageId;
  
  console.log(`Exploring modules in package: ${packageId}`);
  
  // List of modules to explore
  const modules = [
    'HetraCoin',
    'Staking',
    'Proposal',
    'Hetrafi',
    'LiquidityPool',
    'Treasury',
    'Escrow',
    'Governance'
  ];
  
  for (const moduleName of modules) {
    try {
      console.log(`\n📦 Exploring module: ${moduleName}`);
      
      const moduleData = await client.getNormalizedMoveModule({
        package: packageId,
        module: moduleName.toLowerCase()
      });
      
      console.log('Functions:');
      for (const [funcName, funcData] of Object.entries(moduleData.exposedFunctions)) {
        console.log(`  - ${funcName}:`);
        console.log(`    Visibility: ${funcData.visibility}`);
        console.log(`    Parameters: ${JSON.stringify(funcData.parameters)}`);
        if (funcData.typeParameters && funcData.typeParameters.length > 0) {
          console.log(`    Type Parameters: ${JSON.stringify(funcData.typeParameters)}`);
        }
      }
      
      console.log('Structs:');
      for (const [structName, structData] of Object.entries(moduleData.structs)) {
        console.log(`  - ${structName}:`);
        console.log(`    Abilities: ${Object.keys(structData.abilities).join(', ')}`);
        console.log(`    Fields: ${JSON.stringify(structData.fields)}`);
      }
    } catch (error) {
      console.log(`Error exploring module ${moduleName}:`, error);
    }
  }
}

exploreModules().catch(console.error); 