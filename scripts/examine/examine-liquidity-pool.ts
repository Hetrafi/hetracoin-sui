import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';

async function examineLiquidityPool() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Get the package ID
  const packageId = '0x1a3df812a3c177cf6be95dc5406601911dfd564c3334e0641f217893b9f8f3dc';
  
  console.log('Examining LiquidityPool module...');
  console.log('Package ID:', packageId);
  
  try {
    // Get package object
    const packageObj = await client.getObject({
      id: packageId,
      options: { showContent: true, showBcs: true }
    });
    
    if (packageObj.data?.content?.dataType === 'package') {
      const modules = packageObj.data.content.disassembled;
      
      // Find the LiquidityPool module
      if (modules && modules.LiquidityPool) {
        console.log('\nLiquidityPool module found!');
        
        // Extract function signatures
        const moduleCode = modules.LiquidityPool as string;
        const functionMatches = moduleCode.match(/public\s+(?:entry)?\s+fun\s+([^(]+)\s*\(([^)]*)\)/g);
        
        if (functionMatches) {
          console.log('\nFunction signatures:');
          functionMatches.forEach(match => {
            console.log(`- ${match.trim()}`);
          });
        }
        
        // Look specifically for create_pool
        const createPoolMatch = moduleCode.match(/public\s+(?:entry)?\s+fun\s+create_pool\s*\(([^)]*)\)/);
        if (createPoolMatch) {
          console.log('\ncreate_pool function signature:');
          console.log(createPoolMatch[0]);
          console.log('\nParameters:');
          console.log(createPoolMatch[1]);
        }
        
        // Save the module code to a file for inspection
        const outputPath = path.join(__dirname, '../../LiquidityPool.move.txt');
        fs.writeFileSync(outputPath, moduleCode);
        console.log(`\nModule code saved to ${outputPath}`);
      } else {
        console.log('LiquidityPool module not found in package');
      }
    }
  } catch (error: any) {
    console.error('Error examining LiquidityPool module:', error.message);
  }
}

examineLiquidityPool().catch(console.error); 