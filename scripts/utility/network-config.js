/**
 * Utility module for network-agnostic configuration
 * 
 * This script detects the current network environment (testnet or mainnet)
 * and provides the appropriate configuration from the .env file.
 */

const dotenv = require('dotenv');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

/**
 * Network Configuration Utility
 */

// Default configuration for networks
const networkConfigs = {
  testnet: {
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    packageId: process.env.TESTNET_PACKAGE_ID,
    treasuryCapAddress: process.env.TESTNET_TREASURY_CAP,
    deployerPrivateKey: process.env.TESTNET_DEPLOYER_PRIVATE_KEY
  },
  mainnet: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    packageId: process.env.MAINNET_PACKAGE_ID,
    treasuryCapAddress: process.env.MAINNET_TREASURY_CAP,
    deployerPrivateKey: process.env.MAINNET_DEPLOYER_PRIVATE_KEY
  },
  devnet: {
    rpcUrl: 'https://fullnode.devnet.sui.io:443',
    packageId: process.env.DEVNET_PACKAGE_ID,
    treasuryCapAddress: process.env.DEVNET_TREASURY_CAP,
    deployerPrivateKey: process.env.DEVNET_DEPLOYER_PRIVATE_KEY
  },
  localnet: {
    rpcUrl: 'http://127.0.0.1:9000',
    packageId: process.env.LOCALNET_PACKAGE_ID,
    treasuryCapAddress: process.env.LOCALNET_TREASURY_CAP,
    deployerPrivateKey: process.env.LOCALNET_DEPLOYER_PRIVATE_KEY
  }
};

/**
 * Get the current network based on environment variables
 * @returns {string} - The current network name
 */
function getCurrentNetwork() {
  const network = process.env.SUI_NETWORK || 'testnet';
  return network.toLowerCase();
}

/**
 * Get the network configuration for the current network
 * @returns {object} - The network configuration
 */
function getNetworkConfig() {
  const network = getCurrentNetwork();
  const config = networkConfigs[network];
  
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }
  
  // Validate required configuration
  if (!config.packageId) {
    throw new Error(`Package ID not set for network ${network}. Set ${network.toUpperCase()}_PACKAGE_ID environment variable.`);
  }
  
  if (!config.treasuryCapAddress) {
    throw new Error(`Treasury Cap address not set for network ${network}. Set ${network.toUpperCase()}_TREASURY_CAP environment variable.`);
  }
  
  if (!config.deployerPrivateKey) {
    throw new Error(`Deployer private key not set for network ${network}. Set ${network.toUpperCase()}_DEPLOYER_PRIVATE_KEY environment variable.`);
  }
  
  return {
    ...config,
    network
  };
}

/**
 * Get environment variable with network-specific priority
 * @param {string} name The base variable name
 * @param {string} prefix The network prefix (TESTNET_ or MAINNET_)
 * @returns {string} The value or empty string if not found
 */
function getNetworkEnv(name, prefix) {
    // First try with network prefix
    if (process.env[`${prefix}${name}`]) {
        return process.env[`${prefix}${name}`];
    }
    // Then try without prefix
    return process.env[name] || '';
}

/**
 * Saves network settings back to the .env file
 * @param {Object} settings - Settings to save
 * @param {boolean} networkSpecific - Whether to prefix settings with network name
 */
function saveNetworkSettings(settings, networkSpecific = true) {
    const network = getCurrentNetwork();
    const prefix = networkSpecific ? 
        (network === 'mainnet' ? 'MAINNET_' : 'TESTNET_') : '';
    
    // Read existing .env file or create if it doesn't exist
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    
    try {
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
    } catch (error) {
        console.warn('Could not read .env file, creating new one');
    }
    
    // Update values or add new ones
    for (const [key, value] of Object.entries(settings)) {
        const envKey = `${prefix}${key}`;
        const regex = new RegExp(`^${envKey}=.*$`, 'm');
        
        if (regex.test(envContent)) {
            // Update existing value
            envContent = envContent.replace(regex, `${envKey}=${value}`);
        } else {
            // Add new value
            envContent += `\n${envKey}=${value}`;
        }
    }
    
    // Write back to .env file
    fs.writeFileSync(envPath, envContent.trim());
    console.log(`Updated .env file with ${Object.keys(settings).length} settings for ${network}`);
}

module.exports = {
    getCurrentNetwork,
    getNetworkConfig,
    saveNetworkSettings
}; 