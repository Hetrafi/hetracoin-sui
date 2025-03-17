// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for HetraCoin core functionality
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::HetraCoinTest {
    use sui::test_utils::assert_eq;
    use sui::test_scenario::{Self, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};

    #[test]
    public fun test_transfer() {
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
            // Verify the treasury cap was created and sent to admin
            assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let coin = coin::mint(&mut treasury_cap, 1000, test_scenario::ctx(scenario));
            transfer::public_transfer(coin, user);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // User transfers coins
        test_scenario::next_tx(scenario, user);
        {
            // Verify the coin was received by the user
            assert!(test_scenario::has_most_recent_for_sender<Coin<HETRACOIN>>(scenario), 0);
            
            let mut coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            HetraCoin::secure_transfer(&mut coin, admin, 500, ctx);
            
            assert_eq(coin::value(&coin), 500);
            test_scenario::return_to_sender(scenario, coin);
        };
        
        test_scenario::end(scenario_val);
    }
}
