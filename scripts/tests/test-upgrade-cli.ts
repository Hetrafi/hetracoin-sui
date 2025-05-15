import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config();

/**
 * Test the upgradeability of the HetraCoin package using Sui CLI
 */
async function testUpgradeCli() {
  try {
    console.log('Testing package upgrade with Staking module using Sui CLI...');
    
    // Get environment variables
    const packageId = process.env.PACKAGE_ID;
    const upgradeCapId = process.env.UPGRADE_CAP_ID;
    
    if (!packageId || !upgradeCapId) {
      throw new Error('Missing required environment variables. Make sure PACKAGE_ID and UPGRADE_CAP_ID are set in .env file');
    }
    
    console.log(`Package ID: ${packageId}`);
    console.log(`Upgrade Cap ID: ${upgradeCapId}`);
    
    // Step 1: Prepare the upgrade modules by copying only what's needed
    console.log('\nPreparing upgrade with only Staking module...');
    const tempDir = path.join(__dirname, '../../temp_upgrade');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Copy the sources directory
    const sourcesDir = path.join(tempDir, 'sources');
    if (!fs.existsSync(sourcesDir)) {
      fs.mkdirSync(sourcesDir, { recursive: true });
    }
    
    // Copy current modules (keep existing modules)
    const currentSourcesDir = path.join(__dirname, '../../sources');
    fs.readdirSync(currentSourcesDir).forEach(file => {
      const filePath = path.join(currentSourcesDir, file);
      if (fs.statSync(filePath).isFile() && file.endsWith('.move')) {
        fs.copyFileSync(filePath, path.join(sourcesDir, file));
      }
    });
    
    // Copy only the Staking.move module from phase_2
    fs.copyFileSync(
      path.join(__dirname, '../../future_contracts/phase_2/Staking.move'),
      path.join(sourcesDir, 'Staking.move')
    );
    
    // Copy Move.toml
    fs.copyFileSync(
      path.join(__dirname, '../../Move.toml'),
      path.join(tempDir, 'Move.toml')
    );
    
    // Step 2: Build the updated package
    console.log('\nBuilding the updated package...');
    // Change to temp directory
    process.chdir(tempDir);
    
    try {
      // Execute sui move build
      execSync('sui move build', { stdio: 'inherit' });
      console.log('Build successful!');
    } catch (error) {
      console.error('Build failed:', error);
      throw error;
    }
    
    // Step 3: Use the Sui CLI to publish the upgrade
    console.log('\nExecuting upgrade using Sui CLI...');
    
    try {
      // Execute sui client publish --upgrade-capability [UPGRADE_CAP_ID] --gas-budget 200000000
      const publishCommand = `sui client publish --upgrade-capability ${upgradeCapId} --gas-budget 200000000`;
      console.log(`Running command: ${publishCommand}`);
      
      const publishResult = execSync(publishCommand, { encoding: 'utf8' });
      console.log('Publish/upgrade result:');
      console.log(publishResult);
      
      // Parse the result to extract the new package ID
      // Look for a line like "Published to 0x..."
      const packageIdMatch = publishResult.match(/[Pp]ublished to (0x[a-fA-F0-9]+)/);
      if (packageIdMatch && packageIdMatch[1]) {
        const newPackageId = packageIdMatch[1];
        console.log(`\nNew package ID: ${newPackageId}`);
        
        // Update the .env file with the new package ID
        console.log('\nUpdating .env file with the new package ID...');
        let envContent = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8');
        
        if (envContent.includes('PACKAGE_ID_V2=')) {
          // Update existing variable
          envContent = envContent.replace(/PACKAGE_ID_V2=.*/, `PACKAGE_ID_V2=${newPackageId}`);
        } else {
          // Add new variable
          envContent += `\nPACKAGE_ID_V2=${newPackageId}`;
        }
        
        fs.writeFileSync(path.join(__dirname, '../../.env'), envContent);
        console.log('Updated .env file with PACKAGE_ID_V2');
      } else {
        console.log('Could not find new package ID in the output.');
      }
    } catch (error) {
      console.error('Publish command failed:', error);
      throw error;
    }
    
    // Step 4: Change back to original directory
    process.chdir(path.join(__dirname, '../..'));
    console.log('\nUpgrade process completed.');
    
  } catch (error) {
    console.error('Error testing package upgrade:', error);
    
    // Ensure we're back in the original directory
    try {
      process.chdir(path.join(__dirname, '../..'));
    } catch (err) {
      // Ignore directory change errors
    }
    
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  testUpgradeCli()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { testUpgradeCli }; 