import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

// Initialize SuiClient
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt user for input with a question
 * @param question Question to ask the user
 * @returns Promise with the user's answer
 */
function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Define feature flag interface
interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  lastUpdatedBy: string;
  lastUpdatedAt: number;
}

/**
 * Create a new feature flag
 * 
 * @param name - Name of the feature
 * @param enabled - Initial state of the feature
 * @returns Transaction digest
 */
async function createFeatureFlag(
  name: string,
  enabled: boolean
): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const packageId = process.env.PACKAGE_ID_V2 || process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;

    if (!privateKey || !packageId || !adminRegistryId) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_PRIVATE_KEY, PACKAGE_ID(_V2), and ADMIN_REGISTRY_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nCreating feature flag "${name}" (enabled: ${enabled})`);
    console.log(`Sender: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    console.log(`Using Admin Registry ID: ${adminRegistryId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the create_feature_flag function
    txb.moveCall({
      target: `${packageId}::HetraCoinExtension::create_feature_flag`,
      arguments: [
        txb.object(adminRegistryId),
        txb.pure(Buffer.from(name).toString('hex')),
        txb.pure(enabled),
      ],
    });
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nFeature flag creation transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    // Find created feature flag object ID
    if (result.effects?.created && result.effects.created.length > 0) {
      const createdObj = result.effects.created.find(obj => {
        // Check if owner is a shared object
        const owner = obj.owner;
        return owner && typeof owner === 'object' && 'Shared' in owner;
      });
      
      if (createdObj) {
        console.log(`Created feature flag with ID: ${createdObj.reference.objectId}`);
      }
    }
    
    if (result.events && result.events.length > 0) {
      console.log('Events:');
      result.events.forEach((event, index) => {
        console.log(`  Event #${index + 1}: ${event.type}`);
        if (event.parsedJson) {
          console.log(`    Data: ${JSON.stringify(event.parsedJson, null, 2)}`);
        }
      });
    }
    
    return result.digest;
  } catch (error) {
    console.error('Error creating feature flag:', error);
    throw error;
  }
}

/**
 * Update an existing feature flag
 * 
 * @param featureFlagId - Object ID of the feature flag
 * @param enabled - New state of the feature
 * @returns Transaction digest
 */
async function updateFeatureFlag(
  featureFlagId: string,
  enabled: boolean
): Promise<string> {
  try {
    // Get environment variables
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const packageId = process.env.PACKAGE_ID_V2 || process.env.PACKAGE_ID;
    const adminRegistryId = process.env.ADMIN_REGISTRY_ID;

    if (!privateKey || !packageId || !adminRegistryId) {
      throw new Error('Missing required environment variables. Make sure DEPLOYER_PRIVATE_KEY, PACKAGE_ID(_V2), and ADMIN_REGISTRY_ID are set in .env file');
    }
    
    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
    const sender = keypair.getPublicKey().toSuiAddress();
    
    console.log(`\nUpdating feature flag (ID: ${featureFlagId}) to enabled: ${enabled}`);
    console.log(`Sender: ${sender}`);
    console.log(`Using Package ID: ${packageId}`);
    
    // Create transaction block
    const txb = new TransactionBlock();
    
    // Call the update_feature_flag function
    txb.moveCall({
      target: `${packageId}::HetraCoinExtension::update_feature_flag`,
      arguments: [
        txb.object(adminRegistryId),
        txb.object(featureFlagId),
        txb.pure(enabled),
      ],
    });
    
    // Execute the transaction
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      signer: keypair,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
    
    console.log('\nFeature flag update transaction successful!');
    console.log(`Transaction digest: ${result.digest}`);
    console.log('Status:', result.effects?.status?.status);
    
    if (result.events && result.events.length > 0) {
      console.log('Events:');
      result.events.forEach((event, index) => {
        console.log(`  Event #${index + 1}: ${event.type}`);
        if (event.parsedJson) {
          console.log(`    Data: ${JSON.stringify(event.parsedJson, null, 2)}`);
        }
      });
    }
    
    return result.digest;
  } catch (error) {
    console.error('Error updating feature flag:', error);
    throw error;
  }
}

/**
 * List all feature flags
 * @returns Array of feature flag objects
 */
async function listFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    // Get package ID
    const packageId = process.env.PACKAGE_ID_V2 || process.env.PACKAGE_ID;
    
    if (!packageId) {
      throw new Error('Missing PACKAGE_ID(_V2) environment variable');
    }
    
    // Query objects of type FeatureFlag
    const objectType = `${packageId}::HetraCoinExtension::FeatureFlag`;
    
    const objects = await client.getOwnedObjects({
      owner: 'Immutable',
      options: {
        showContent: true,
        showType: true,
      },
    });
    
    // Parse and return the result
    const flags: FeatureFlag[] = [];
    
    for (const obj of objects.data) {
      if (obj.data?.type?.includes(objectType)) {
        const content = obj.data?.content;
        if (content?.dataType !== 'moveObject') continue;
        
        const fields = content.fields as Record<string, any>;
        const nameBytes = fields.name;
        
        // Decode name from hex
        let name = '';
        if (Array.isArray(nameBytes)) {
          name = new TextDecoder().decode(new Uint8Array(nameBytes));
        }
        
        flags.push({
          id: obj.data.objectId,
          name,
          enabled: fields.enabled,
          lastUpdatedBy: fields.last_updated_by,
          lastUpdatedAt: fields.last_updated_at,
        });
      }
    }
    
    return flags;
  } catch (error) {
    console.error('Error listing feature flags:', error);
    throw error;
  }
}

// Interactive CLI execution
async function interactiveCreateFeatureFlag() {
  console.log('=== HetraCoin Create Feature Flag ===');
  
  try {
    // Ask for feature name
    const name = await promptUser('\nEnter the name of the feature: ');
    
    if (!name || name.trim().length === 0) {
      console.error('Error: Feature name cannot be empty.');
      rl.close();
      return;
    }
    
    // Ask for initial enabled state
    const enabledInput = await promptUser('Enable this feature? (yes/no): ');
    const enabled = enabledInput.toLowerCase() === 'yes' || enabledInput.toLowerCase() === 'y';
    
    // Confirmation
    console.log('\nFeature Flag Details:');
    console.log(`  Name: ${name}`);
    console.log(`  Enabled: ${enabled}`);
    
    const confirm = await promptUser('\nConfirm creation? (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Feature flag creation cancelled.');
      rl.close();
      return;
    }
    
    // Execute creation
    await createFeatureFlag(name, enabled);
    
    console.log('\nFeature flag created successfully!');
  } catch (error) {
    console.error(`\nError during feature flag creation: ${error}`);
  } finally {
    rl.close();
  }
}

// Interactive CLI for listing feature flags
async function interactiveListFeatureFlags() {
  console.log('=== HetraCoin Feature Flags ===');
  
  try {
    const featureFlags = await listFeatureFlags();
    
    if (!featureFlags || featureFlags.length === 0) {
      console.log('\nNo feature flags found.');
      rl.close();
      return;
    }
    
    console.log('\nFeature Flags:');
    featureFlags.forEach((flag, index) => {
      console.log(`\n[${index + 1}] ID: ${flag.id}`);
      console.log(`    Name: ${flag.name}`);
      console.log(`    Enabled: ${flag.enabled}`);
      console.log(`    Last Updated By: ${flag.lastUpdatedBy}`);
      console.log(`    Last Updated At: ${flag.lastUpdatedAt}`);
    });
    
    // Ask if user wants to update a feature flag
    const updateOption = await promptUser('\nWould you like to update a feature flag? (yes/no): ');
    
    if (updateOption.toLowerCase() === 'yes' || updateOption.toLowerCase() === 'y') {
      // Ask which flag to update
      const flagIndex = parseInt(await promptUser('Enter the number of the flag to update: '));
      
      if (isNaN(flagIndex) || flagIndex < 1 || flagIndex > featureFlags.length) {
        console.error('Invalid selection.');
        rl.close();
        return;
      }
      
      const selectedFlag = featureFlags[flagIndex - 1];
      
      // Ask for new enabled state
      const enabledInput = await promptUser(`Set "${selectedFlag.name}" to enabled? Current value: ${selectedFlag.enabled} (yes/no): `);
      const newEnabled = enabledInput.toLowerCase() === 'yes' || enabledInput.toLowerCase() === 'y';
      
      // Confirmation
      const confirm = await promptUser(`\nConfirm updating "${selectedFlag.name}" to enabled=${newEnabled}? (yes/no): `);
      
      if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
        console.log('Feature flag update cancelled.');
        rl.close();
        return;
      }
      
      // Execute update
      await updateFeatureFlag(selectedFlag.id, newEnabled);
      console.log('\nFeature flag updated successfully!');
    }
  } catch (error) {
    console.error(`\nError during feature flag listing/update: ${error}`);
  } finally {
    rl.close();
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode - show menu
    (async () => {
      // Create readline interface for the menu
      const menuRL = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('=== HetraCoin Feature Flag Operations ===');
      console.log('1. Create a new feature flag');
      console.log('2. List and manage feature flags');
      
      const choice = await promptUser('\nSelect an operation (1-2): ');
      
      // Close the menu readline before opening a new one
      menuRL.close();
      
      switch (choice) {
        case '1':
          // Create a new readline for feature flag creation
          const createRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveCreateFeatureFlag();
          break;
          
        case '2':
          // Create a new readline for listing flags
          const listRL = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          interactiveListFeatureFlags();
          break;
          
        default:
          console.log('Invalid selection.');
      }
    })();
  } else if (args.length >= 1) {
    const command = args[0];

    switch (command) {
      case 'create':
        if (args.length < 3) {
          console.log('Usage: npx ts-node test-feature-flag.ts create <name> <enabled>');
          process.exit(1);
        }
        
        const name = args[1];
        const enabled = args[2].toLowerCase() === 'true' || args[2].toLowerCase() === 'yes';
        
        createFeatureFlag(name, enabled)
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'update':
        if (args.length < 3) {
          console.log('Usage: npx ts-node test-feature-flag.ts update <feature_flag_id> <enabled>');
          process.exit(1);
        }
        
        const featureFlagId = args[1];
        const newEnabled = args[2].toLowerCase() === 'true' || args[2].toLowerCase() === 'yes';
        
        updateFeatureFlag(featureFlagId, newEnabled)
          .then(() => process.exit(0))
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      case 'list':
        listFeatureFlags()
          .then(flags => {
            console.log('Feature Flags:');
            flags.forEach(flag => {
              console.log(`\nID: ${flag.id}`);
              console.log(`Name: ${flag.name}`);
              console.log(`Enabled: ${flag.enabled}`);
              console.log(`Last Updated By: ${flag.lastUpdatedBy}`);
              console.log(`Last Updated At: ${flag.lastUpdatedAt}`);
            });
            process.exit(0);
          })
          .catch(err => {
            console.error(err);
            process.exit(1);
          });
        break;
        
      default:
        console.log('Usage:');
        console.log('  Interactive mode: npx ts-node test-feature-flag.ts');
        console.log('  Command-line mode:');
        console.log('    npx ts-node test-feature-flag.ts create <name> <enabled>');
        console.log('    npx ts-node test-feature-flag.ts update <feature_flag_id> <enabled>');
        console.log('    npx ts-node test-feature-flag.ts list');
        process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  Interactive mode: npx ts-node test-feature-flag.ts');
    console.log('  Command-line mode:');
    console.log('    npx ts-node test-feature-flag.ts create <name> <enabled>');
    console.log('    npx ts-node test-feature-flag.ts update <feature_flag_id> <enabled>');
    console.log('    npx ts-node test-feature-flag.ts list');
    process.exit(1);
  }
}

export { createFeatureFlag, updateFeatureFlag, listFeatureFlags }; 