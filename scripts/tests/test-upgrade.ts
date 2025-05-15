import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

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
    
    // Copy Move.toml
    fs.copyFileSync(
      path.join(__dirname, '../../Move.toml'),
      path.join(tempDir, 'Move.toml')
    );
    
    // Step 2: Build the updated package
    console.log('\nBuilding the updated package...');
    // Change to temp directory
    process.chdir(tempDir);
    
    let buildOutputJson: string;
    try {
      // Execute sui move build and capture output
      buildOutputJson = execSync('sui move build --dump-bytecode-as-base64', { encoding: 'utf-8' });
      console.log('Build successful!');
    } catch (error) {
      console.error('Build failed:', error);
      throw error;
    }
    
    // Parse the build output
    const buildResult = JSON.parse(buildOutputJson);
    const modules_base64: string[] = buildResult.modules;
    const dependencies_object_ids: string[] = buildResult.dependencies;
    const package_digest_base64: string = buildResult.digest;

    // Decode modules from base64 to number[][]
    const bytecodeModules: number[][] = modules_base64.map(mod_base64 => 
      Array.from(Buffer.from(mod_base64, 'base64'))
    );
    
    // Decode digest from base64 to Uint8Array
    const packageDigestU8Array: Uint8Array = Buffer.from(package_digest_base64, 'base64');
    
    // Step 4: Execute the upgrade transaction
    console.log('\nExecuting the upgrade transaction...');
    
    const txb1 = new TransactionBlock();
    const upgradePolicy = 0; // 0 for additive upgrade policy

    // Call authorize_upgrade
    const upgradeTicket = txb1.moveCall({
      target: '0x2::package::authorize_upgrade',
      arguments: [
        txb1.object(upgradeCapId),      // Upgrade capability
        txb1.pure(upgradePolicy),       // Upgrade policy (0 for additive)
        txb1.pure(packageDigestU8Array, 'vector<u8>') // Digest of the new package as Uint8Array with explicit BCS type
      ],
    });
    
    // Call commit_upgrade with the ticket
    txb1.moveCall({ 
      target: '0x2::package::commit_upgrade',
      arguments: [
        txb1.object(upgradeCapId),      // Upgrade capability
        upgradeTicket,                  // Upgrade ticket from authorize_upgrade
        txb1.pure(bytecodeModules, 'vector<vector<u8>>'),     // New modules with explicit BCS type
        txb1.pure(dependencies_object_ids, 'vector<address>') // Dependency Object IDs with explicit BCS type
      ],
    });
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb1,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nUpgrade transaction result:');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    if (result.effects?.status?.status === 'success') {
      console.log('\n✅ Package upgrade successful!');
      
      // Extract the upgraded package ID
      const upgradeEvents = result.events?.filter(e => 
        e.type.includes('package::UpgradeEvent')
      );
      
      if (upgradeEvents && upgradeEvents.length > 0) {
        // Extract package ID from the event object without type assertion
        const packageIdFromEvent = upgradeEvents[0].parsedJson ? 
          // Use optional chaining and type-safe access
          (upgradeEvents[0].parsedJson as Record<string, unknown>)['package'] as string :
          undefined;
          
        if (packageIdFromEvent) {
          const newPackageId = packageIdFromEvent;
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
    
    // Clean up temporary directory
    console.log('\nCleaning up temporary files...');
    process.chdir(path.join(__dirname, '../..'));
    // fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Temporary files cleaned up');
    
    return result.digest;
  } catch (error) {
    console.error('Error testing package upgrade:', error);
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