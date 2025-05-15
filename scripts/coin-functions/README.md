# HetraCoin CLI Functions

This directory contains TypeScript CLI functions for interacting with the HetraCoin contract on the Sui blockchain.

## Setup

1. Make sure you have Node.js and npm installed
2. Install dependencies:
```
npm install
```
3. Create a `.env` file in the root directory with the following variables:
```
DEPLOYER_PRIVATE_KEY="your_private_key"
PACKAGE_ID="0x..."
TREASURY_CAP_ID="0x..."
ADMIN_CAP_ID="0x..."
ADMIN_REGISTRY_ID="0x..."
PAUSE_STATE_ID="0x..."
```

## Available Functions

All functions are available in both interactive and command-line modes. For a more user-friendly experience, run the scripts without arguments to use interactive mode.

### Mint

Mint new HetraCoin tokens:

**Interactive mode:**
```
npx ts-node scripts/coin-functions/mint.ts
```

**Command-line mode:**
```
npx ts-node scripts/coin-functions/mint.ts <amount> <recipient_address>
```

Example:
```
npx ts-node scripts/coin-functions/mint.ts 100 0x1234...
```

### Burn

Burn HetraCoin tokens:

**Interactive mode:**
```
npx ts-node scripts/coin-functions/burn.ts
```

**Command-line mode:**
```
npx ts-node scripts/coin-functions/burn.ts burn <coin_object_id>
```

Example:
```
npx ts-node scripts/coin-functions/burn.ts burn 0x1234...
```

You can also check the total supply:
```
npx ts-node scripts/coin-functions/burn.ts total-supply
```

### Transfer

Transfer HetraCoin tokens:

**Interactive mode:**
```
npx ts-node scripts/coin-functions/transfer.ts
```

**Command-line mode:**
```
npx ts-node scripts/coin-functions/transfer.ts transfer <amount> <coin_object_id> <recipient_address>
```

Example:
```
npx ts-node scripts/coin-functions/transfer.ts transfer 50 0x1234... 0x5678...
```

You can also list coin objects:
```
npx ts-node scripts/coin-functions/transfer.ts list <address>
```

### Admin

Manage HetraCoin admin functions:

**Interactive mode:**
```
npx ts-node scripts/coin-functions/admin.ts
```

**Command-line mode:**
```
npx ts-node scripts/coin-functions/admin.ts change-admin <new_admin_address>
npx ts-node scripts/coin-functions/admin.ts transfer-cap <new_admin_address>
npx ts-node scripts/coin-functions/admin.ts get-admin
```

### Emergency Pause

Control the emergency pause system:

**Interactive mode:**
```
npx ts-node scripts/coin-functions/pause.ts
```

**Command-line mode:**
```
npx ts-node scripts/coin-functions/pause.ts pause "reason for pausing"
npx ts-node scripts/coin-functions/pause.ts unpause
npx ts-node scripts/coin-functions/pause.ts status
```

## Getting Object IDs

If you need to find the object IDs for your deployment, you can use:

```
npx ts-node scripts/coin-functions/get-object-ids.ts
```

This will attempt to find all the required object IDs (TreasuryCap, AdminCap, AdminRegistry, etc.) and print them to the console.

## Security Notes

1. The private key in the `.env` file has direct access to all HetraCoin admin functions. Keep it secure!
2. The admin functions allow permanent changes to the contract administration. Use with caution.
3. The emergency pause system can halt all token operations. Only use in case of security incidents.
4. Always confirm transaction parameters before executing, especially when burning tokens or transferring admin capabilities. 