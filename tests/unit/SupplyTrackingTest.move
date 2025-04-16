// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for the total_supply tracking functionality
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::SupplyTrackingTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;

    #[test]
    public fun test_total_supply_tracking() {
        let admin = @0xA;
        let user = @0xB;
        
        // Create a test scenario
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Check initial supply
        test_scenario::next_tx(scenario, admin);
        {
            let treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            
            // Initial supply should be 0
            let initial_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(initial_supply == 0, 0);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Mint some coins and verify supply increases
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Mint 1000 coins
            let mint_amount = 1000;
            let minted_coin = Governance::mint(&mut treasury_cap, mint_amount, ctx);
            
            // Supply should now be 1000
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == mint_amount, 1);
            
            // Transfer the minted coin to the user
            transfer::public_transfer(minted_coin, user);
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Mint more coins and verify supply increases correctly
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Mint another 2000 coins
            let mint_amount = 2000;
            let minted_coin = Governance::mint(&mut treasury_cap, mint_amount, ctx);
            
            // Supply should now be 3000 (1000 + 2000)
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == 3000, 2);
            
            // Transfer the minted coin to the user
            transfer::public_transfer(minted_coin, user);
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Test burn functionality
        test_scenario::next_tx(scenario, user);
        {
            let coins = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            test_scenario::return_to_sender(scenario, coins);
        };
        
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            test_scenario::next_tx(scenario, user);
            
            let mut coins = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let burn_amount = 500;
            let coin_to_burn = coin::split(&mut coins, burn_amount, test_scenario::ctx(scenario));
            
            // Return the remaining coins to the user
            test_scenario::return_to_sender(scenario, coins);
            
            // Switch back to admin to burn the coins
            test_scenario::next_tx(scenario, admin);
            let ctx = test_scenario::ctx(scenario);
            
            // Burn the coins
            Governance::burn(&mut treasury_cap, coin_to_burn, ctx);
            
            // Supply should now be 2500 (3000 - 500)
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == 2500, 3);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        test_scenario::end(scenario_val);
    }
} 