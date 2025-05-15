/**
 * HetraCoin Shared Objects Check
 * 
 * This script checks the AdminRegistry and EmergencyPauseState shared objects
 * using their IDs from the .env file.
 * 
 * Usage:
 *   npx ts-node scripts/tests/check-shared-objects.ts
 */
import { SuiClient } from '@mysten/sui.js/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Set up console logging with colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message: string, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) { log(`✅ ${message}`, colors.green); }
function errorLog(message: string) { log(`❌ ${message}`, colors.red); }
function warning(message: string) { log(`⚠️ ${message}`, colors.yellow); }
function info(message: string) { log(`ℹ️ ${message}`, colors.blue); }
function heading(message: string) { log(`\n🔷 ${message} 🔷\n`, colors.cyan); }

async function checkSharedObjects() {
  heading("CHECKING HETRACOIN SHARED OBJECTS");
  
  // Initialize client
  info('Initializing SUI client...');
  const rpcUrl = 'https://fullnode.testnet.sui.io:443';
  const client = new SuiClient({ url: rpcUrl });
  success('SUI client initialized');
  
  // Load deployment info
  info('Loading deployment info...');
  const deploymentPath = path.join(__dirname, `../../deployment-phase1-testnet.json`);
  if (!fs.existsSync(deploymentPath)) {
    errorLog(`Deployment file not found: ${deploymentPath}`);
    process.exit(1);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const packageId = deploymentInfo.packageId;
  success(`Package ID loaded: ${packageId}`);

  // Get shared object IDs from .env
  const adminRegistryId = process.env.ADMIN_REGISTRY_ID;
  const pauseStateId = process.env.EMERGENCY_PAUSE_STATE_ID;

  if (!adminRegistryId) {
    errorLog("ADMIN_REGISTRY_ID not found in .env file");
  } else {
    info(`AdminRegistry ID from .env: ${adminRegistryId}`);
  }

  if (!pauseStateId) {
    errorLog("EMERGENCY_PAUSE_STATE_ID not found in .env file");
  } else {
    info(`EmergencyPauseState ID from .env: ${pauseStateId}`);
  }

  // Check AdminRegistry
  if (adminRegistryId) {
    try {
      heading("CHECKING ADMIN REGISTRY");
      const adminRegistry = await client.getObject({
        id: adminRegistryId,
        options: { showContent: true, showType: true }
      });

      if (adminRegistry.data) {
        success("AdminRegistry object found!");
        info("Type: " + adminRegistry.data.type);
        info("Content: " + JSON.stringify(adminRegistry.data.content, null, 2));
      } else {
        errorLog("AdminRegistry object not found or has no data");
      }
    } catch (error) {
      errorLog(`Error checking AdminRegistry: ${error}`);
    }
  }

  // Check EmergencyPauseState
  if (pauseStateId) {
    try {
      heading("CHECKING EMERGENCY PAUSE STATE");
      const pauseState = await client.getObject({
        id: pauseStateId,
        options: { showContent: true, showType: true }
      });

      if (pauseState.data) {
        success("EmergencyPauseState object found!");
        info("Type: " + pauseState.data.type);

        // Check if the system is paused
        const content = pauseState.data.content;
        if (content && typeof content === 'object' && 'fields' in content) {
          const fields = content.fields as any;
          const paused = fields.paused;
          
          if (paused) {
            warning("System is currently PAUSED");
            info("Reason: " + fields.pause_reason);
            info("Paused at: " + fields.paused_at);
            info("Paused by: " + fields.paused_by);
          } else {
            success("System is currently ACTIVE (not paused)");
          }
          
          info("Last updated: " + fields.last_updated);
        }
      } else {
        errorLog("EmergencyPauseState object not found or has no data");
      }
    } catch (error) {
      errorLog(`Error checking EmergencyPauseState: ${error}`);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  checkSharedObjects().catch((error) => {
    console.error("Uncaught error:", error);
    process.exit(1);
  });
}

export { checkSharedObjects }; 