import { SuiClient } from '@mysten/sui.js/client';
import * as dotenv from 'dotenv';
import { fromB64 } from '@mysten/sui.js/utils';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function exploreLiquidityPool() {
  // Initialize client
  console.log('Initializing SUI client...');
  const rpcUrl = 'https://fullnode.testnet.sui.io:443';
  const client = new SuiClient({ url: rpcUrl });
  
  // Load deployment info
  console.log('Loading deployment info...');
  const deploymentPath = path.join(__dirname, '../../deployment-testnet.json');
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  console.log('Package ID:', packageId);
  
  // Get the package object
  const packageObj = await client.getObject({
    id: packageId,
    options: { showContent: true, showBcs: true }
  });
  
  // Extract the LiquidityPool module
  if (packageObj.data?.content?.dataType === 'package') {
    const modules = packageObj.data.content.disassembled;
    if (modules && modules.LiquidityPool) {
      console.log('\n📦 LiquidityPool Module Details:');
      
      // Look for the create_pool function
      const moduleCode = modules.LiquidityPool as string;
      const lines = moduleCode.split('\n');
      
      console.log('\nSearching for create_pool function...');
      let inCreatePoolFunction = false;
      let createPoolSignature = '';
      let createPoolBody = [];
      
      for (const line of lines) {
        if (line.includes('public fun create_pool')) {
          inCreatePoolFunction = true;
          createPoolSignature = line.trim();
          console.log(`\nFound create_pool function: ${createPoolSignature}`);
        } else if (inCreatePoolFunction) {
          if (line.includes('}')) {
            inCreatePoolFunction = false;
            break;
          }
          createPoolBody.push(line.trim());
        }
      }
      
      if (createPoolBody.length > 0) {
        console.log('\nFunction body:');
        console.log(createPoolBody.join('\n'));
      }
      
      // Look for struct definitions
      console.log('\nSearching for LiquidityPool struct...');
      let inLiquidityPoolStruct = false;
      let liquidityPoolStruct = [];
      
      for (const line of lines) {
        if (line.includes('struct LiquidityPool')) {
          inLiquidityPoolStruct = true;
          liquidityPoolStruct.push(line.trim());
        } else if (inLiquidityPoolStruct) {
          if (line.includes('}')) {
            liquidityPoolStruct.push(line.trim());
            inLiquidityPoolStruct = false;
            break;
          }
          liquidityPoolStruct.push(line.trim());
        }
      }
      
      if (liquidityPoolStruct.length > 0) {
        console.log('\nLiquidityPool struct:');
        console.log(liquidityPoolStruct.join('\n'));
      }
    } else {
      console.log('LiquidityPool module not found in package');
    }
  }
}

exploreLiquidityPool().catch(error => {
  console.error('Error:', error);
}); 