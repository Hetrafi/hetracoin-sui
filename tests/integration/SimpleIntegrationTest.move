// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Simple integration test for HetraCoin
#[allow(duplicate_alias, unused_use)]
module hetracoin_integration::SimpleIntegrationTest {
    use sui::test_scenario::{Self as ts};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Treasury;

    #[test]
    public fun test_simple_integration() {
        let admin = @0xA;
        let user = @0xB;
        let treasury_addr = @0xC;
        
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
        
        // Create Treasury
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let treasury = Treasury::create_treasury(treasury_addr, ctx);
            transfer::public_transfer(treasury, treasury_addr);
        };
        
        // Mint coins for user
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint 1000 coins for the user
            let user_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 1000, ctx);
            
            // Send to user
            transfer::public_transfer(user_coins, user);
            
            // Return objects
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // User verifies received coins
        ts::next_tx(scenario, user);
        {
            let user_coins = ts::take_from_sender<Coin<HETRACOIN>>(scenario);
            
            // Verify coin amount
            assert_eq(coin::value<HETRACOIN>(&user_coins), 1000);
            
            // User can spend coins as needed
            // ...
            
            ts::return_to_sender(scenario, user_coins);
        };
        
        ts::end(scenario_val);
    }
} 