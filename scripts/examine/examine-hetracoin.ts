import { SuiClient } from '@mysten/sui.js/client';
import * as fs from 'fs';
import * as path from 'path';

async function examineHetraCoin() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  
  // Get the HetraCoin package ID
  const packageId = '0x5546ec1417f25a7a1d91c9c2d1d827d05647c57c257693e5bc5680308b84e2c9';
  
  console.log('Examining HetraCoin module...');
  console.log('Package ID:', packageId);
  
  try {
    // Get package object
    const packageObj = await client.getObject({
      id: packageId,
      options: { showContent: true, showBcs: true }
    });
    
    if (packageObj.data?.content?.dataType === 'package') {
      const modules = packageObj.data.content.disassembled;
      
      // Find the HetraCoin module
      if (modules && modules.HetraCoin) {
        console.log('\nHetraCoin module found!');
        
        // Extract function signatures
        const moduleCode = modules.HetraCoin as string;
        const functionMatches = moduleCode.match(/public\s+(?:entry)?\s+fun\s+([^(]+)\s*\(([^)]*)\)/g);
        
        if (functionMatches) {
          console.log('\nFunction signatures:');
          functionMatches.forEach(match => {
            console.log(`- ${match.trim()}`);
          });
        }
        
        // Look specifically for mint
        const mintMatch = moduleCode.match(/public\s+(?:entry)?\s+fun\s+mint\s*\(([^)]*)\)/);
        if (mintMatch) {
          console.log('\nMint function signature:');
          console.log(mintMatch[0]);
          console.log('\nParameters:');
          console.log(mintMatch[1]);
        }
        
        // Save the module code to a file for inspection
        const outputPath = path.join(__dirname, '../../HetraCoin.move.txt');
        fs.writeFileSync(outputPath, moduleCode);
        console.log(`\nModule code saved to ${outputPath}`);
      } else {
        console.log('HetraCoin module not found in package');
      }
    }
  } catch (error: any) {
    console.error('Error examining HetraCoin module:', error.message);
  }
}

examineHetraCoin().catch(console.error); 