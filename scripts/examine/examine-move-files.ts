import * as fs from 'fs';
import * as path from 'path';

function examineMoveFiles() {
  const moveDir = path.join(__dirname, '../../sources');
  
  if (!fs.existsSync(moveDir)) {
    console.log('Move source directory not found');
    return;
  }
  
  console.log('Examining Move source files:');
  
  // List all .move files
  const moveFiles = fs.readdirSync(moveDir).filter(file => file.endsWith('.move'));
  
  for (const file of moveFiles) {
    console.log(`\n📄 ${file}:`);
    
    // Read file content
    const filePath = path.join(moveDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Look for create_pool function
    if (file.toLowerCase().includes('liquidity') || file.toLowerCase().includes('pool')) {
      console.log('\nSearching for pool creation functions...');
      
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('public') && (line.includes('create_pool') || line.includes('create') && line.includes('pool'))) {
          console.log(`\nFound potential pool creation function at line ${i + 1}:`);
          
          // Print the function and a few lines after it
          for (let j = i; j < Math.min(i + 15, lines.length); j++) {
            console.log(`${j + 1}: ${lines[j]}`);
          }
          
          console.log('...');
          break;
        }
      }
    }
  }
}

examineMoveFiles(); 