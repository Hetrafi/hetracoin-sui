/**
 * HetraCoin Module Explorer
 * 
 * This script lists all modules in the HetraCoin package
 * and provides detailed information about their functions
 * and structures.
 * 
 * Note: Liquidity Pool is shelved for future development
 */
import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Get the network from command line arguments
const network = process.argv[2] as 'testnet' | 'mainnet';
if (!network || (network !== 'testnet' && network !== 'mainnet')) {
  console.error('Please specify network: testnet or mainnet');
  process.exit(1);
}

async function listModules() {
  console.log(`Listing modules for HetraCoin on ${network}...`);
  
  // Initialize client
  const rpcUrl = network === 'testnet' 
    ? 'https://fullnode.testnet.sui.io:443' 
    : 'https://fullnode.mainnet.sui.io:443';
  
  const client = new SuiClient({ url: rpcUrl });
  
  // Load deployment info
  const deploymentPath = path.join(__dirname, `../../deployment-${network}.json`);
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  
  console.log('Package ID:', packageId);
  
  try {
    // Get package object
    const packageObj = await client.getObject({
      id: packageId,
      options: { showContent: true }
    });
    
    if (packageObj.data?.content?.dataType !== 'package') {
      console.error('Object is not a package');
      process.exit(1);
    }
    
    const modules = packageObj.data.content.disassembled;
    console.log(`\nFound ${Object.keys(modules).length} modules:`);
    
    // List all modules
    for (const [moduleName, moduleData] of Object.entries(modules)) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 Module: ${moduleName}`);
      console.log(`${'='.repeat(80)}`);
      
      // Get normalized module data for more details
      try {
        const normalizedModule = await client.getNormalizedMoveModule({
          package: packageId,
          module: moduleName
        });
        
        // List structs
        if (Object.keys(normalizedModule.structs).length > 0) {
          console.log('\n🔹 Structs:');
          for (const [structName, structData] of Object.entries(normalizedModule.structs)) {
            console.log(`   - ${structName}`);
            
            if (structData.abilities) {
              console.log(`     Abilities: ${JSON.stringify(structData.abilities)}`);
            }
            
            if (structData.fields && structData.fields.length > 0) {
              console.log('     Fields:');
              for (const field of structData.fields) {
                console.log(`       ${field.name}: ${JSON.stringify(field.type)}`);
              }
            }
          }
        }
        
        // List functions
        if (Object.keys(normalizedModule.exposedFunctions).length > 0) {
          console.log('\n🔹 Functions:');
          for (const [funcName, funcData] of Object.entries(normalizedModule.exposedFunctions)) {
            console.log(`   - ${funcName}`);
            console.log(`     Visibility: ${funcData.visibility}`);
            console.log(`     Is Entry: ${funcData.isEntry}`);
            
            if (funcData.parameters && funcData.parameters.length > 0) {
              console.log('     Parameters:');
              funcData.parameters.forEach((param, index) => {
                console.log(`       ${index}: ${JSON.stringify(param)}`);
              });
            }
            
            if (funcData.typeParameters && funcData.typeParameters.length > 0) {
              console.log('     Type Parameters:');
              funcData.typeParameters.forEach((typeParam, index) => {
                console.log(`       ${index}: ${JSON.stringify(typeParam)}`);
              });
            }
          }
        }
        
        // Special note for LiquidityPool
        if (moduleName === 'LiquidityPool') {
          console.log('\n⚠️ Note: The LiquidityPool module is currently shelved.');
          console.log('   Future development will integrate with existing DEXes instead.');
        }
        
      } catch (error: any) {
        console.log(`   Error getting normalized module data: ${error.message}`);
      }
    }
    
  } catch (error: any) {
    console.error('Error listing modules:', error.message);
    process.exit(1);
  }
}

listModules().catch(error => {
  console.error('Error in execution:', error);
  process.exit(1);
}); 