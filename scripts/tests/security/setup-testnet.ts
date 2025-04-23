import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// --- Configuration ---
const NETWORK: 'testnet' | 'localnet' = 'testnet'; // Target network
const GAS_BUDGET_PUBLISH = 500000000;
const GAS_BUDGET_SETUP = 200000000;
const GAS_BUDGET_MINT = 100000000;
const ADMIN_KEY_FILE = 'admin-key.json'; // Relative to this script's location
const USER_KEY_FILE = 'user-key.json'; // Relative to this script's location
const MINT_AMOUNT_ADMIN = 1000;
const MINT_AMOUNT_USER = 500;
// --- End Configuration ---

// --- Helper Functions ---

// Load keypairs from files relative to this script
function loadKeyPair(filePath: string): Ed25519Keypair {
    const absolutePath = path.resolve(__dirname, filePath);
    console.log(`Loading key from: ${absolutePath}`);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Key file not found: ${absolutePath}`);
    }
    const keyData = fs.readFileSync(absolutePath, 'utf8').trim().replace(/^"|"$/g, '');
    const privateKeyBytes = Buffer.from(keyData, 'base64');
    return Ed25519Keypair.fromSecretKey(privateKeyBytes);
}

// Find the project root containing Move.toml
function findMoveTomlDir(startPath: string): string {
    let currentDir = startPath;
    while (true) {
        const checkPath = path.join(currentDir, 'Move.toml');
        if (fs.existsSync(checkPath)) {
            return currentDir;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) { // Reached root
            throw new Error('Could not find Move.toml in parent directories.');
        }
        currentDir = parentDir;
    }
}

// Build and publish the package
async function buildAndPublish(projectRoot: string): Promise<string> {
    console.log(`\n--- Building Package in ${projectRoot} ---`);
    try {
        execSync('sui move build', { cwd: projectRoot, stdio: 'inherit' });
        console.log('Build successful.');
    } catch (error) {
        console.error('Build failed:', error);
        throw new Error('Package build failed.');
    }

    console.log(`\n--- Publishing Package to ${NETWORK} (using active Sui CLI environment) ---`);
    try {
        // Remove --network flag, assuming CLI environment is pre-configured
        const publishCommand = `sui client publish --gas-budget ${GAS_BUDGET_PUBLISH} --json`;
        console.log(`Executing: ${publishCommand}`); 
        const publishOutput = execSync(publishCommand, {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'] 
        });
        console.log('Publish command executed.');
        
        const publishData = JSON.parse(publishOutput);
        // console.log('Publish Output:', JSON.stringify(publishData, null, 2)); // Debug output

        const effects = publishData.effects;
        if (effects?.status?.status !== 'success') {
             throw new Error(`Publish transaction failed: ${effects?.status?.error}`);
        }

        const created = effects.created || [];
        const packageObj = created.find((obj: any) => 'packageId' in obj.reference);

        if (!packageObj || !packageObj.reference.packageId) {
            console.error('Could not find packageId in publish effects:', JSON.stringify(effects, null, 2));
            throw new Error('Failed to parse package ID from publish output.');
        }
        console.log(`Package published successfully. Package ID: ${packageObj.reference.packageId}`);
        return packageObj.reference.packageId;
    } catch (error: any) {
        console.error('Publish failed:', error.message || error);
        if(error.stderr) {
            console.error('Publish stderr:', error.stderr);
        }
         if(error.stdout) {
            console.error('Publish stdout:', error.stdout);
        }
        throw new Error('Package publish failed.');
    }
}

// Call the setup_for_testnet function
async function callSetup(client: SuiClient, packageId: string, adminKeypair: Ed25519Keypair): Promise<{ treasuryCapId: string | null, setupCapId: string | null }> {
    console.log('\n--- Calling setup_for_testnet --- ');
    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

    // First, find the SetupCap object owned by the admin
    // It should have been created and transferred during the package init (publish)
    let setupCapId: string | null = null;
    try {
        const ownedObjects = await client.getOwnedObjects({ owner: adminAddress });
        const setupCapObj = ownedObjects.data.find(obj => obj.data?.type?.includes('::HetraCoin::SetupCap'));
        if (!setupCapObj || !setupCapObj.data?.objectId) {
            console.warn(`Warning: Could not automatically find SetupCap owned by admin ${adminAddress}. This might happen if init didn't run or transfer failed.`);
            // Attempt to proceed assuming setup_for_testnet isn't needed or will fail gracefully.
            // A more robust script might exit here or require the ID manually.
        } else {
            setupCapId = setupCapObj.data.objectId;
            console.log(`Found SetupCap ID: ${setupCapId}`);
        }
    } catch (error) {
         console.error('Error finding SetupCap:', error);
         console.warn('Proceeding without SetupCap...');
    }

    // If we didn't find the SetupCap, we likely cannot call setup_for_testnet.
    // The TreasuryCap should have been created and transferred in `init` during publish.
    if (!setupCapId) {
        console.log('Skipping setup_for_testnet call as SetupCap was not found.');
        console.log('Attempting to find TreasuryCap created during publish...');
         try {
            const ownedObjects = await client.getOwnedObjects({ owner: adminAddress });
            const treasuryCapObj = ownedObjects.data.find(obj => obj.data?.type?.includes('::coin::TreasuryCap<0x2::sui::SUI>') && obj.data?.type?.includes(`${packageId}::HetraCoin::HETRACOIN`)); // Match full type if possible
            if (treasuryCapObj && treasuryCapObj.data?.objectId) {
                console.log(`Found TreasuryCap from init: ${treasuryCapObj.data.objectId}`);
                return { treasuryCapId: treasuryCapObj.data.objectId, setupCapId: null };
            }
         } catch (error) {
              console.error('Error finding TreasuryCap from init:', error);
         }
         // If we reach here, we couldn't find the cap from init either.
         console.error('CRITICAL: Failed to find TreasuryCap from publish init or SetupCap for setup_for_testnet.');
         return { treasuryCapId: null, setupCapId: null };
    }

    // Proceed with calling setup_for_testnet using the found SetupCap
    const tx = new TransactionBlock();
    tx.moveCall({
        target: `${packageId}::HetraCoin::setup_for_testnet`,
        arguments: [tx.object(setupCapId)],
    });
    tx.setGasBudget(GAS_BUDGET_SETUP);

    try {
        console.log('Executing setup_for_testnet transaction...');
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: adminKeypair,
            options: { showEffects: true, showObjectChanges: true },
        });

        console.log('Setup Transaction Digest:', result.digest);
        if (result.effects?.status?.status !== 'success') {
             throw new Error(`setup_for_testnet transaction failed: ${result.effects?.status?.error}`);
        }
        
        // Find the TreasuryCap created by setup_for_testnet
        const objectChanges = result.objectChanges || [];
        const treasuryCapObj = objectChanges.find(
             change => change.type === 'created' && 
             change.objectType?.includes('TreasuryCap') &&
             change.objectType?.includes(`${packageId}::HetraCoin::HETRACOIN`)
        );

        if (treasuryCapObj && 'objectId' in treasuryCapObj) {
             console.log(`TreasuryCap created by setup_for_testnet: ${treasuryCapObj.objectId}`);
             return { treasuryCapId: treasuryCapObj.objectId, setupCapId: setupCapId };
        } else {
             console.error('Could not find TreasuryCap created by setup_for_testnet effects:', JSON.stringify(result.effects, null, 2));
             // Maybe it was created by init? Let's re-check owned objects.
             try {
                const ownedObjects = await client.getOwnedObjects({ owner: adminAddress });
                const cap = ownedObjects.data.find(obj => obj.data?.type?.includes('::coin::TreasuryCap<0x2::sui::SUI>') && obj.data?.type?.includes(`${packageId}::HetraCoin::HETRACOIN`));
                 if (cap && cap.data?.objectId) {
                     console.log(`Found TreasuryCap (likely from init): ${cap.data.objectId}`);
                     return { treasuryCapId: cap.data.objectId, setupCapId: setupCapId }; // Still return setupCapId if found
                 }
             } catch (findError) {
                 console.error('Error re-checking for TreasuryCap:', findError);
             }
             return { treasuryCapId: null, setupCapId: setupCapId };
        }
    } catch (error) {
        console.error('Error executing setup_for_testnet:', error);
        return { treasuryCapId: null, setupCapId: setupCapId }; // Return setupCapId even on error
    }
}

// Mint initial coins
async function mintInitialCoins(client: SuiClient, packageId: string, treasuryCapId: string, adminKeypair: Ed25519Keypair, userAddress: string): Promise<{ adminCoinId: string | null, userCoinId: string | null }> {
    console.log('\n--- Minting Initial Coins --- ');
    const tx = new TransactionBlock();

    const adminCoin = tx.moveCall({
        target: `${packageId}::HetraCoin::mint`,
        arguments: [tx.object(treasuryCapId), tx.pure(MINT_AMOUNT_ADMIN)],
    });
    tx.transferObjects([adminCoin], tx.pure(adminKeypair.getPublicKey().toSuiAddress()));

    const userCoin = tx.moveCall({
        target: `${packageId}::HetraCoin::mint`,
        arguments: [tx.object(treasuryCapId), tx.pure(MINT_AMOUNT_USER)],
    });
    tx.transferObjects([userCoin], tx.pure(userAddress));

    tx.setGasBudget(GAS_BUDGET_MINT);

    try {
        console.log('Executing mint transaction...');
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: adminKeypair,
            options: { showEffects: true, showObjectChanges: true },
        });

        console.log('Mint Transaction Digest:', result.digest);
         if (result.effects?.status?.status !== 'success') {
             throw new Error(`Mint transaction failed: ${result.effects?.status?.error}`);
        }

        let adminCoinId: string | null = null;
        let userCoinId: string | null = null;

        const objectChanges = result.objectChanges || [];
        const adminAddress = adminKeypair.getPublicKey().toSuiAddress();

        // Find admin coin ID
        const adminCoinObj = objectChanges.find(
            change => change.type === 'created' && 
            change.objectType?.includes(`${packageId}::HetraCoin::HETRACOIN`) &&
            'owner' in change && 
            typeof change.owner === 'object' &&
            'AddressOwner' in change.owner &&
            change.owner.AddressOwner === adminAddress
        );
         if (adminCoinObj && 'objectId' in adminCoinObj) {
            adminCoinId = adminCoinObj.objectId;
            console.log(`Minted Admin Coin ID: ${adminCoinId}`);
        }

        // Find user coin ID
        const userCoinObj = objectChanges.find(
            change => change.type === 'created' && 
            change.objectType?.includes(`${packageId}::HetraCoin::HETRACOIN`) &&
            'owner' in change && 
            typeof change.owner === 'object' &&
            'AddressOwner' in change.owner &&
            change.owner.AddressOwner === userAddress
        );
        if (userCoinObj && 'objectId' in userCoinObj) {
            userCoinId = userCoinObj.objectId;
             console.log(`Minted User Coin ID: ${userCoinId}`);
        }
        
         if (!adminCoinId || !userCoinId) {
             console.warn('Could not identify one or both minted coin IDs from effects:', JSON.stringify(result.effects, null, 2));
         }

        return { adminCoinId, userCoinId };

    } catch (error) {
        console.error('Error executing mint transaction:', error);
        return { adminCoinId: null, userCoinId: null };
    }
}

// --- Main Execution --- 
async function main() {
    try {
        const projectRoot = findMoveTomlDir(__dirname);
        const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
        const adminKeypair = loadKeyPair(ADMIN_KEY_FILE);
        const userKeypair = loadKeyPair(USER_KEY_FILE);
        const userAddress = userKeypair.getPublicKey().toSuiAddress();
        const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
        
        console.log(`Admin Address: ${adminAddress}`);
        console.log(`User Address: ${userAddress}`);

        // 1. Build and Publish
        const packageId = await buildAndPublish(projectRoot);

        // Wait a bit for publish to propagate
        console.log('Waiting 5 seconds for publish to propagate...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 2. Call Setup / Find Treasury Cap
        // Note: The TreasuryCap *should* be created and transferred in the publish `init`.
        // `callSetup` now primarily tries to find the SetupCap and then the TreasuryCap.
        // It only calls `setup_for_testnet` if the SetupCap is found, which might 
        // indicate the init transfer failed or a different setup flow is intended.
        const { treasuryCapId, setupCapId } = await callSetup(suiClient, packageId, adminKeypair);

        if (!treasuryCapId) {
            throw new Error('Failed to obtain TreasuryCap ID after publish/setup.');
        }

        // 3. Mint Initial Coins
        const { adminCoinId, userCoinId } = await mintInitialCoins(suiClient, packageId, treasuryCapId, adminKeypair, userAddress);

        if (!adminCoinId || !userCoinId) {
            console.warn('Warning: Failed to obtain one or both initial Coin IDs after minting.');
            // Continue to print available info
        }

        // 4. Output Results
        console.log('\n=== Setup Complete ===');
        console.log(`Network: ${NETWORK}`);
        console.log(`Package ID: ${packageId}`);
        console.log(`Treasury Cap ID: ${treasuryCapId}`);
        console.log(`Admin Coin ID: ${adminCoinId || 'NOT FOUND'}`);
        console.log(`User Coin ID: ${userCoinId || 'NOT FOUND'}`);
        if (setupCapId) {
             console.log(`(Setup Cap ID used/found: ${setupCapId})`);
        }

        console.log('\n---> Please update sharedObjects in scripts/tests/security/index.ts with these IDs:');
        console.log(`     sharedObjects.treasuryCapId = '${treasuryCapId}';`);
        console.log(`     sharedObjects.adminCoinId = '${adminCoinId || 'NOT FOUND'}';`);
        console.log(`     sharedObjects.userCoinId = '${userCoinId || 'NOT FOUND'}';`);
        console.log('---> Then run the tests using:');
        console.log(`     cd scripts/tests/security`);
        console.log(`     npx ts-node ./index.ts ${NETWORK} --package ${packageId}`);

    } catch (error) {
        console.error('\n--- Setup Script Failed --- ');
        console.error(error);
        process.exit(1);
    }
}

main(); 