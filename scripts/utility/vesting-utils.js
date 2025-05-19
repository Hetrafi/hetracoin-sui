/**
 * Vesting Utilities
 * 
 * Network-agnostic functions for managing the vesting module on Sui.
 * This script works with either testnet or mainnet based on the current environment.
 */

const { SuiClient } = require('@mysten/sui.js/client');
const { Ed25519Keypair } = require('@mysten/sui.js/keypairs/ed25519');
const { TransactionBlock } = require('@mysten/sui.js/transactions');
const { fromB64 } = require('@mysten/sui.js/utils');
const { getCurrentNetwork, getNetworkConfig, saveNetworkSettings } = require('./network-config');

/**
 * Initialize the Vesting Vault
 * @param {string} adminAddress Optional admin address (if not provided, will use config.adminAddress)
 * @returns {Promise<string>} The address of the newly created vesting vault
 */
async function initializeVestingVault(adminAddress) {
    const config = getNetworkConfig();
    
    if (!config.packageId) {
        throw new Error('Package ID not found in environment variables');
    }
    
    if (!config.deployerPrivateKey) {
        throw new Error('Deployer private key not found in environment variables');
    }
    
    // Set up client
    const client = new SuiClient({ url: config.rpcUrl });
    
    // Create keypair from private key
    let keyData = fromB64(config.deployerPrivateKey);
    // Ensure we have exactly 32 bytes
    if (keyData.length !== 32) {
        keyData = keyData.slice(0, 32);
    }
    const keypair = Ed25519Keypair.fromSecretKey(keyData);
    
    // Create transaction
    const tx = new TransactionBlock();
    
    // Use provided admin address or default from config
    const admin = adminAddress || config.adminAddress;
    console.log(`Using admin address: ${admin}`);
    
    // Call the init_vesting_vault function in the Vesting module
    tx.moveCall({
        target: `${config.packageId}::Vesting::init_vesting_vault`,
        arguments: [
            tx.pure(admin)
        ]
    });
    
    console.log(`Initializing Vesting Vault on ${config.network}...`);
    
    // Execute transaction
    const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: {
            showEffects: true,
            showObjectChanges: true
        }
    });
    
    // Extract the vault address from the result
    const vaultAddress = extractVestingVaultAddress(result);
    
    // Save to .env file
    saveNetworkSettings({
        'VESTING_VAULT_ADDRESS': vaultAddress
    });
    
    console.log(`Vesting Vault initialized at address: ${vaultAddress}`);
    return vaultAddress;
}

/**
 * Fund the Vesting Vault with tokens
 * @param {string} amount Amount of tokens to fund (in MIST - smallest unit)
 * @param {string} vaultAddress Optional explicit vault address to use (if not provided, will use config.vaultAddress)
 * @returns {Promise<string>} Transaction digest
 */
async function fundVestingVault(amount, vaultAddress) {
    const config = getNetworkConfig();
    
    if (!config.packageId || !config.treasuryCapAddress) {
        throw new Error('Required configuration not found in environment variables');
    }
    
    // Use provided vault address or default from config
    const vault = vaultAddress || config.vaultAddress;
    if (!vault) {
        throw new Error('No vesting vault address provided or found in configuration');
    }
    
    // Set up client and keypair
    const client = new SuiClient({ url: config.rpcUrl });
    let keyData = fromB64(config.deployerPrivateKey);
    if (keyData.length !== 32) keyData = keyData.slice(0, 32);
    const keypair = Ed25519Keypair.fromSecretKey(keyData);
    
    // Create transaction
    const tx = new TransactionBlock();
    
    // Mint tokens first
    const coin = tx.moveCall({
        target: `${config.packageId}::HetraCoin::mint`,
        arguments: [
            tx.object(config.treasuryCapAddress),
            tx.pure(amount),
            tx.object(config.adminRegistryAddress),
            tx.object(config.pauseStateAddress)
        ]
    });
    
    // Fund the vault
    tx.moveCall({
        target: `${config.packageId}::Vesting::fund_vault`,
        arguments: [
            tx.object(vault),
            coin
        ]
    });
    
    console.log(`Funding Vesting Vault with ${amount} tokens on ${config.network}...`);
    console.log(`Using vault address: ${vault}`);
    
    // Execute transaction
    const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: { showEffects: true }
    });
    
    console.log(`Vesting Vault funded! Transaction: ${result.digest}`);
    return result.digest;
}

/**
 * Create a vesting schedule for a beneficiary
 * @param {string} beneficiary Address of beneficiary
 * @param {string} amount Amount of tokens to vest (in MIST)
 * @param {number} durationMinutes Vesting duration in minutes
 * @param {number} cliffMinutes Cliff period in minutes
 * @param {string} vaultAddress Optional explicit vault address to use (if not provided, will use config.vaultAddress)
 * @returns {Promise<string>} Transaction digest
 */
async function createVestingSchedule(beneficiary, amount, durationMinutes, cliffMinutes, vaultAddress) {
    const config = getNetworkConfig();
    
    if (!config.packageId) {
        throw new Error('Package ID not found in environment variables');
    }
    
    // Use provided vault address or default from config
    const vault = vaultAddress || config.vaultAddress;
    if (!vault) {
        throw new Error('No vesting vault address provided or found in configuration');
    }
    
    // Convert minutes to epochs (1 epoch ≈ 2 seconds on Sui)
    const epochsPerMinute = 30; // 60 seconds / 2 seconds per epoch
    const durationEpochs = durationMinutes * epochsPerMinute;
    const cliffEpochs = cliffMinutes * epochsPerMinute;
    
    // Set up client and keypair
    const client = new SuiClient({ url: config.rpcUrl });
    let keyData = fromB64(config.deployerPrivateKey);
    if (keyData.length !== 32) keyData = keyData.slice(0, 32);
    const keypair = Ed25519Keypair.fromSecretKey(keyData);
    const sender = keypair.getPublicKey().toSuiAddress();
    
    // Create transaction
    const tx = new TransactionBlock();
    
    // Set explicit gas budget to avoid dry run failures
    tx.setGasBudget(50000000); // 50 MIST
    
    console.log(`Using vault address: ${vault}`);
    console.log(`Admin address: ${config.adminAddress}`);
    console.log(`Sender address: ${sender}`);
    
    // Check that sender matches admin for this vault
    if (sender !== config.adminAddress) {
        console.log('Warning: Sender address does not match the admin address.');
        console.log('Ensure the sender has admin rights on the vesting vault.');
    }
    
    tx.moveCall({
        target: `${config.packageId}::Vesting::create_vesting_schedule`,
        arguments: [
            tx.object(vault),
            tx.pure(beneficiary),
            tx.pure(amount),
            tx.pure(durationEpochs),
            tx.pure(cliffEpochs)
        ]
    });
    
    console.log(`Creating vesting schedule for ${beneficiary} on ${config.network}...`);
    console.log(`Amount: ${amount}, Duration: ${durationMinutes} minutes, Cliff: ${cliffMinutes} minutes`);
    
    // Execute transaction
    const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: { showEffects: true }
    });
    
    console.log(`Vesting schedule created! Transaction: ${result.digest}`);
    return result.digest;
}

/**
 * Create multiple vesting schedules in a batch
 * @param {Object[]} schedules Array of schedule objects {beneficiary, amount, durationMinutes, cliffMinutes}
 * @returns {Promise<string>} Transaction digest
 */
async function batchCreateVestingSchedules(schedules) {
    const config = getNetworkConfig();
    
    if (!config.packageId || !config.vaultAddress) {
        throw new Error('Required configuration not found in environment variables');
    }
    
    // Set up client and keypair
    const client = new SuiClient({ url: config.rpcUrl });
    let keyData = fromB64(config.deployerPrivateKey);
    if (keyData.length !== 32) keyData = keyData.slice(0, 32);
    const keypair = Ed25519Keypair.fromSecretKey(keyData);
    
    // Create arrays for batch parameters
    const beneficiaries = schedules.map(s => s.beneficiary);
    const amounts = schedules.map(s => s.amount);
    
    // Convert minutes to epochs (1 epoch ≈ 2 seconds on Sui)
    const epochsPerMinute = 30; // 60 seconds / 2 seconds per epoch
    const durations = schedules.map(s => s.durationMinutes * epochsPerMinute);
    const cliffPeriods = schedules.map(s => s.cliffMinutes * epochsPerMinute);
    
    // Create transaction
    const tx = new TransactionBlock();
    
    tx.moveCall({
        target: `${config.packageId}::Vesting::batch_create_schedules`,
        arguments: [
            tx.object(config.vaultAddress),
            tx.pure(beneficiaries),
            tx.pure(amounts),
            tx.pure(durations),
            tx.pure(cliffPeriods)
        ]
    });
    
    console.log(`Creating ${schedules.length} vesting schedules in batch on ${config.network}...`);
    
    // Execute transaction
    const result = await client.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        signer: keypair,
        options: { showEffects: true }
    });
    
    console.log(`Batch vesting schedules created! Transaction: ${result.digest}`);
    return result.digest;
}

/**
 * Extract the Vesting Vault address from transaction results
 * @private
 */
function extractVestingVaultAddress(result) {
    const created = result.objectChanges?.filter(change => 
        change.type === 'created' && 
        change.objectType.includes('::Vesting::VestingVault')
    );
    
    if (created && created.length > 0) {
        return created[0].objectId;
    }
    
    throw new Error('Could not extract Vesting Vault address from transaction result');
}

module.exports = {
    initializeVestingVault,
    fundVestingVault,
    createVestingSchedule,
    batchCreateVestingSchedules
}; 