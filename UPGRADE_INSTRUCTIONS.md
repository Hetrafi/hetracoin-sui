
# HetraCoin Upgrade Instructions

Follow these steps to upgrade the HetraCoin package by adding the Staking module.

## Step 1: Prepare the Upgrade Files

1. Copy all existing Move files from the 'sources' directory to a temporary directory
2. Add the 'Staking.move' file from 'future_contracts/phase_2/' to the temporary directory
3. Copy the Move.toml file to the temporary directory
4. Build the package:

```bash
cd temp_directory
sui move build
```

## Step 2: Authorize Upgrade

1. Execute the following transaction to get an upgrade ticket:

```
sui client call --package 0x2 --module package --function authorize_upgrade --args 0x2900415917e9c96c5115c445962e7b06f3dddb35263c3d7d480127ddca6684cd 0x181a6a120a8a8d210b2c1cc18d3769336b41f8ab1d13398fbcce3dfba9e3fbd4 --gas-budget 100000000
```

2. Save the result object from the response, it contains your upgrade ticket: <UPGRADE_TICKET>

## Step 3: Commit the Upgrade

1. Execute the commit_upgrade function with the upgrade ticket:

```
sui client call --package 0x2 --module package --function commit_upgrade --args 0x2900415917e9c96c5115c445962e7b06f3dddb35263c3d7d480127ddca6684cd 0x181a6a120a8a8d210b2c1cc18d3769336b41f8ab1d13398fbcce3dfba9e3fbd4 <PATH_TO_BYTECODE_MODULES> <UPGRADE_TICKET> --gas-budget 100000000
```

You can pass the bytecode modules using:
```
--args-json '[["path/to/module1.mv", "path/to/module2.mv"]]'
```

2. The response will include a new package ID. Update your .env file with:

```
PACKAGE_ID_V2=<NEW_PACKAGE_ID>
```

## Step 4: Test the Upgraded Package

1. Create a new staking pool using:

```
sui client call --package <PACKAGE_ID_V2> --module Staking --function create_staking_pool --args 500 30 --gas-budget 100000000
```

2. Save the StakingPool object ID from the response for future use.
