import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config();

/**
 * Test the upgradeability of the HetraCoin package
 */
async function testUpgrade() {
  try {
    console.log('Testing package upgrade with Staking module...');
    
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const packageId = process.env.PACKAGE_ID;
    const upgradeCapId = process.env.UPGRADE_CAP_ID;
    
    if (!privateKey || !packageId || !upgradeCapId) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_PRIVATE_KEY, PACKAGE_ID, and UPGRADE_CAP_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`Sender address: ${sender}`);
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
    
    // Step 3: Get the bytecode modules
    const buildDir = path.join(tempDir, 'build/hetracoin-sui');
    const bytecodeModules: number[][] = [];
    
    fs.readdirSync(buildDir).forEach(file => {
      if (file.endsWith('.mv')) {
        const filePath = path.join(buildDir, file);
        const bytecode = fs.readFileSync(filePath);
        bytecodeModules.push(Array.from(bytecode));
      }
    });
    
    // Initialize SuiClient with testnet
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    
    // Step 4: Create the upgrade transaction
    console.log('\nPreparing the upgrade transaction...');
    
    const tx = new TransactionBlock();
    
    // Get the upgrade ticket first
    const upgradeTicket = tx.moveCall({
      target: '0x2::package::authorize_upgrade',
      arguments: [
        tx.object(upgradeCapId),
        tx.pure(packageId)
      ]
    });
    
    // Add the bytecode modules to the transaction
    const modulesBytes = tx.pure(bytecodeModules);
    
    // Commit the upgrade with the ticket
    tx.moveCall({
      target: '0x2::package::commit_upgrade',
      arguments: [
        tx.object(upgradeCapId), 
        tx.pure(packageId),
        modulesBytes,
        upgradeTicket
      ]
    });
    
    // Execute the transaction
    console.log('\nExecuting the upgrade transaction...');
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });
    
    console.log('\nUpgrade transaction result:');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    if (result.effects?.status?.status === 'success') {
      console.log('\n✅ Package upgrade successful!');
      
      // Extract new package ID from object changes
      let newPackageId = '';
      if (result.objectChanges) {
        const publishedChange = result.objectChanges.find(change => 
          change.type === 'published'
        );
        
        if (publishedChange && 'packageId' in publishedChange) {
          newPackageId = publishedChange.packageId;
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
        }
      }
    } else {
      console.error('\n❌ Package upgrade failed');
      if (result.effects?.status?.error) {
        console.error('Error:', result.effects.status.error);
      }
    }
    
    // Change back to original directory
    process.chdir(path.join(__dirname, '../..'));
    console.log('\nUpgrade process completed.');
    
    return result.digest;
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
  testUpgrade()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { testUpgrade }; 