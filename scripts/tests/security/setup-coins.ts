import { getFullnodeUrl, SuiClient } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const NETWORK: 'testnet' | 'localnet' = 'testnet';
const GAS_BUDGET = 100000000;
const ADMIN_KEY_FILE = 'admin-key.json';
const USER_KEY_FILE = 'user-key.json';
const ATTACKER_KEY_FILE = 'attacker-key.json';
const TREASURY_OWNER_KEY_FILE = null; // Will be passed as command line argument
const MINT_AMOUNT = 1000; // Amount to mint for each user

// Get package ID from command line if provided
let packageId = '';
let treasuryCapId = '';
let treasuryOwnerKey = '';

for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--package' && i + 1 < process.argv.length) {
    packageId = process.argv[i + 1];
  }
  if (process.argv[i] === '--treasury' && i + 1 < process.argv.length) {
    treasuryCapId = process.argv[i + 1];
  }
  if (process.argv[i] === '--signer-key' && i + 1 < process.argv.length) {
    treasuryOwnerKey = process.argv[i + 1];
  }
}

if (!packageId) {
  console.error('Please provide a package ID with --package');
  process.exit(1);
}

if (!treasuryCapId) {
  console.error('Please provide a treasury cap ID with --treasury');
  process.exit(1);
}

let treasuryOwnerKeypair: Ed25519Keypair;
if (treasuryOwnerKey) {
  // Use direct key if provided
  console.log('Using provided treasury owner key');
  try {
    const privateKeyBytes = Buffer.from(treasuryOwnerKey, 'base64');
    treasuryOwnerKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
    console.log(`Treasury Owner address: ${treasuryOwnerKeypair.getPublicKey().toSuiAddress()}`);
  } catch (error) {
    console.error('Error parsing treasury owner key:', error);
    process.exit(1);
  }
} else {
  console.error('Please provide a treasury owner key with --signer-key');
  console.error('This should be the base64-encoded private key of the account that owns the treasury cap');
  process.exit(1);
}

// Load keypairs from files
function loadKeyPair(filePath: string): Ed25519Keypair {
  // Get absolute path to workspace root
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const absolutePath = path.join(workspaceRoot, filePath);
  
  console.log(`Loading key from: ${absolutePath}`);
  const keyData = fs.readFileSync(absolutePath, 'utf8').trim().replace(/^"|"$/g, '');
  const privateKeyBytes = Buffer.from(keyData, 'base64');
  return Ed25519Keypair.fromSecretKey(privateKeyBytes);
}

async function main() {
  try {
    // Load keypairs
    console.log('Loading keypairs...');
    const adminKeypair = loadKeyPair(ADMIN_KEY_FILE);
    const userKeypair = loadKeyPair(USER_KEY_FILE);
    const attackerKeypair = loadKeyPair(ATTACKER_KEY_FILE);

    const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
    const userAddress = userKeypair.getPublicKey().toSuiAddress();
    const attackerAddress = attackerKeypair.getPublicKey().toSuiAddress();

    console.log(`Admin address: ${adminAddress}`);
    console.log(`User address: ${userAddress}`);
    console.log(`Attacker address: ${attackerAddress}`);

    // Setup client
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Mint coins for testing
    console.log(`Using package ID: ${packageId}`);
    console.log(`Using treasury cap ID: ${treasuryCapId}`);

    // Create transaction for minting coins
    const tx = new TransactionBlock();
    
    // Mint for admin
    console.log('Minting coins for admin...');
    const adminCoin = tx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [tx.object(treasuryCapId), tx.pure(MINT_AMOUNT)],
    });
    tx.transferObjects([adminCoin], tx.pure(adminAddress));
    
    // Mint for user
    console.log('Minting coins for user...');
    const userCoin = tx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [tx.object(treasuryCapId), tx.pure(MINT_AMOUNT)],
    });
    tx.transferObjects([userCoin], tx.pure(userAddress));
    
    // Mint for attacker (just for testing)
    console.log('Minting coins for attacker (for testing)...');
    const attackerCoin = tx.moveCall({
      target: `${packageId}::HetraCoin::mint`,
      arguments: [tx.object(treasuryCapId), tx.pure(MINT_AMOUNT)],
    });
    tx.transferObjects([attackerCoin], tx.pure(attackerAddress));

    tx.setGasBudget(GAS_BUDGET);

    // Execute transaction
    console.log('Executing transaction...');
    const result = await client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: treasuryOwnerKeypair,
      options: { showEffects: true, showObjectChanges: true },
    });

    console.log('Transaction successful!');
    console.log('Transaction digest:', result.digest);

    // Find the created coin IDs
    let adminCoinId = null;
    let userCoinId = null;
    let attackerCoinId = null;

    const objectChanges = result.objectChanges || [];
    
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
      console.log(`Admin Coin ID: ${adminCoinId}`);
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
      console.log(`User Coin ID: ${userCoinId}`);
    }

    // Find attacker coin ID
    const attackerCoinObj = objectChanges.find(
      change => change.type === 'created' && 
      change.objectType?.includes(`${packageId}::HetraCoin::HETRACOIN`) &&
      'owner' in change && 
      typeof change.owner === 'object' &&
      'AddressOwner' in change.owner &&
      change.owner.AddressOwner === attackerAddress
    );
    if (attackerCoinObj && 'objectId' in attackerCoinObj) {
      attackerCoinId = attackerCoinObj.objectId;
      console.log(`Attacker Coin ID: ${attackerCoinId}`);
    }

    // Generate config file for tests
    console.log('\nCreating test-config.json with object IDs...');
    const configData = {
      packageId,
      treasuryCapId,
      adminCoinId,
      userCoinId,
      attackerCoinId
    };

    fs.writeFileSync(
      path.join(__dirname, 'test-config.json'),
      JSON.stringify(configData, null, 2)
    );

    console.log('\nSetup complete! You can now run the security tests with:');
    console.log(`npx ts-node index.ts testnet --package ${packageId}`);

  } catch (error) {
    console.error('Error setting up coins:', error);
    process.exit(1);
  }
}

main(); 