// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for HetraCoin transfer
module hetracoin_unit::EventTest {
    use sui::test_scenario::{Self};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, Coin, TreasuryCap};
    use hetracoin::HetraCoin::{Self, HETRACOIN};

    #[test]
    public fun test_transfer_functionality() {
        let admin = @0xA;
        let user = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // First transaction to publish the module and initialize the coin
        test_scenario::next_tx(scenario, admin);
        {
            // Create the coin with the one-time witness
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Admin mints coins
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let coin = coin::mint(&mut treasury_cap, 1000, test_scenario::ctx(scenario));
            sui::transfer::public_transfer(coin, user);
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // User transfers coins
        test_scenario::next_tx(scenario, user);
        {
            let mut coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Initial balance check
            assert_eq(coin::value(&coin), 1000);
            
            // Perform the transfer
            HetraCoin::secure_transfer(&mut coin, admin, 500, ctx);
            
            // Check remaining balance
            assert_eq(coin::value(&coin), 500);
            
            test_scenario::return_to_sender(scenario, coin);
        };
        
        // Check that admin received the coins
        test_scenario::next_tx(scenario, admin);
        {
            let coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            assert_eq(coin::value(&coin), 500);
            test_scenario::return_to_sender(scenario, coin);
        };
        
        test_scenario::end(scenario_val);
    }
} 