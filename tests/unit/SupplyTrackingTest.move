// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for the total_supply tracking functionality
#[allow(duplicate_alias, unused_use, unused_variable)]
module hetracoin_unit::SupplyTrackingTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;

    #[test]
    public fun test_total_supply_tracking() {
        let admin = @0xA;
        let user = @0xB;
        
        // Create a test scenario
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create AdminRegistry
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let admin_registry = HetraCoin::create_admin_registry_for_testing(admin, ctx);
            transfer::public_share_object(admin_registry);
        };
        
        // Create EmergencyPauseState
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            HetraCoin::create_pause_state_for_testing(ctx);
        };
        
        // Check initial supply
        ts::next_tx(scenario, admin);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            
            // Initial supply should be 0
            let initial_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(initial_supply == 0, 0);
            
            ts::return_to_sender(scenario, treasury_cap);
        };
        
        // Mint some coins and verify supply increases
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint 1000 coins
            let mint_amount = 1000;
            let minted_coin = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, mint_amount, ctx);
            
            // Supply should now be 1000
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == mint_amount, 1);
            
            // Transfer the minted coin to the user
            transfer::public_transfer(minted_coin, user);
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Mint more coins and verify supply increases correctly
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint another 2000 coins
            let mint_amount = 2000;
            let minted_coin = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, mint_amount, ctx);
            
            // Supply should now be 3000 (1000 + 2000)
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == 3000, 2);
            
            // Transfer the minted coin to the user
            transfer::public_transfer(minted_coin, user);
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Test burn functionality
        ts::next_tx(scenario, user);
        {
            let mut coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let burn_amount = 500;
            let ctx = ts::ctx(scenario);
            let coin_to_burn = coin::split(&mut coins, burn_amount, ctx);
            
            // Transfer coins to burn to admin
            transfer::public_transfer(coin_to_burn, admin);
            
            // Return the remaining coins to the user
            ts::return_to_sender(scenario, coins);
        };
        
        // Admin burns the coins
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let coin_to_burn = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Burn the coins
            Governance::burn(&mut treasury_cap, &admin_registry, coin_to_burn, ctx);
            
            // Supply should now be 2500 (3000 - 500)
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == 2500, 3);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
        };
        
        ts::end(scenario_val);
    }
} 