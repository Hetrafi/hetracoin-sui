/**
 * Find Deployment IDs
 * 
 * This utility helps find the correct package ID and treasury cap ID
 * from deployment files to use with the metadata utility scripts.
 */

const fs = require('fs');
const path = require('path');
const { getNetworkConfig } = require('./network-config');

function main() {
  // Get network configuration
  const config = getNetworkConfig();
  const network = config.network || 'testnet';
  
  console.log(`Looking for deployment files on ${network}...`);
  
  // Define paths to deployment files
  const deploymentFilePath = path.join(__dirname, `../../deployment-phase1-${network}.json`);
  const initFilePath = path.join(__dirname, `../../initialization-phase1-${network}.json`);
  
  // Array to collect all possible IDs
  const foundIds = {
    packageIds: [],
    treasuryCapIds: []
  };
  
  // Check deployment-phase1 file
  if (fs.existsSync(deploymentFilePath)) {
    try {
      const deployment = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
      if (deployment.packageId) {
        console.log(`\n✅ Found package ID in deployment-phase1-${network}.json:`);
        console.log(`   ${deployment.packageId}`);
        foundIds.packageIds.push(deployment.packageId);
      }
    } catch (error) {
      console.error(`Error reading deployment file: ${error.message}`);
    }
  } else {
    console.log(`⚠️ No deployment-phase1-${network}.json file found`);
  }
  
  // Check initialization-phase1 file
  if (fs.existsSync(initFilePath)) {
    try {
      const init = JSON.parse(fs.readFileSync(initFilePath, 'utf8'));
      if (init.packageId) {
        console.log(`\n✅ Found package ID in initialization-phase1-${network}.json:`);
        console.log(`   ${init.packageId}`);
        if (!foundIds.packageIds.includes(init.packageId)) {
          foundIds.packageIds.push(init.packageId);
        }
      }
      if (init.treasuryCapId) {
        console.log(`\n✅ Found treasury cap ID in initialization-phase1-${network}.json:`);
        console.log(`   ${init.treasuryCapId}`);
        foundIds.treasuryCapIds.push(init.treasuryCapId);
      }
    } catch (error) {
      console.error(`Error reading initialization file: ${error.message}`);
    }
  } else {
    console.log(`⚠️ No initialization-phase1-${network}.json file found`);
  }
  
  // Check regular deployment file
  const regularDeploymentFilePath = path.join(__dirname, `../../deployment-${network}.json`);
  if (fs.existsSync(regularDeploymentFilePath)) {
    try {
      const deployment = JSON.parse(fs.readFileSync(regularDeploymentFilePath, 'utf8'));
      if (deployment.packageId) {
        console.log(`\n✅ Found package ID in deployment-${network}.json:`);
        console.log(`   ${deployment.packageId}`);
        if (!foundIds.packageIds.includes(deployment.packageId)) {
          foundIds.packageIds.push(deployment.packageId);
        }
      }
    } catch (error) {
      console.error(`Error reading deployment file: ${error.message}`);
    }
  }
  
  // Check regular initialization file
  const regularInitFilePath = path.join(__dirname, `../../initialization-${network}.json`);
  if (fs.existsSync(regularInitFilePath)) {
    try {
      const init = JSON.parse(fs.readFileSync(regularInitFilePath, 'utf8'));
      if (init.packageId) {
        console.log(`\n✅ Found package ID in initialization-${network}.json:`);
        console.log(`   ${init.packageId}`);
        if (!foundIds.packageIds.includes(init.packageId)) {
          foundIds.packageIds.push(init.packageId);
        }
      }
      if (init.treasuryCapId) {
        console.log(`\n✅ Found treasury cap ID in initialization-${network}.json:`);
        console.log(`   ${init.treasuryCapId}`);
        if (!foundIds.treasuryCapIds.includes(init.treasuryCapId)) {
          foundIds.treasuryCapIds.push(init.treasuryCapId);
        }
      }
    } catch (error) {
      console.error(`Error reading initialization file: ${error.message}`);
    }
  }
  
  // Check environment variables
  if (config.packageId) {
    console.log(`\n✅ Found package ID in environment variables:`);
    console.log(`   ${config.packageId}`);
    if (!foundIds.packageIds.includes(config.packageId)) {
      foundIds.packageIds.push(config.packageId);
    }
  }
  
  if (config.treasuryCapId) {
    console.log(`\n✅ Found treasury cap ID in environment variables:`);
    console.log(`   ${config.treasuryCapId}`);
    if (!foundIds.treasuryCapIds.includes(config.treasuryCapId)) {
      foundIds.treasuryCapIds.push(config.treasuryCapId);
    }
  }
  
  // Show summary
  console.log('\n=== SUMMARY ===');
  
  if (foundIds.packageIds.length > 0) {
    console.log('\nFound package IDs:');
    foundIds.packageIds.forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
  } else {
    console.log('\n❌ No package IDs found in any files');
  }
  
  if (foundIds.treasuryCapIds.length > 0) {
    console.log('\nFound treasury cap IDs:');
    foundIds.treasuryCapIds.forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
  } else {
    console.log('\n❌ No treasury cap IDs found in any files');
  }
  
  // Show example commands
  if (foundIds.packageIds.length > 0) {
    const packageId = foundIds.packageIds[0];
    console.log('\n\nTo check metadata:');
    console.log(`node scripts/utility/check-coin-metadata.js ${packageId}`);
    
    if (foundIds.treasuryCapIds.length > 0) {
      const treasuryCapId = foundIds.treasuryCapIds[0];
      console.log('\nTo update metadata:');
      console.log(`node scripts/utility/update-coin-metadata.js ${packageId} ${treasuryCapId}`);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { main }; 