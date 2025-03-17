// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Edge case tests for Hetrafi marketplace
#[allow(duplicate_alias)]
module hetracoin_unit::HetrafiEdgeCaseTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Hetrafi;

    #[test]
    public fun test_small_amount_fee() {
        let admin = @0xA;
        let treasury = @0xB;
        let user = @0xC;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin and Hetrafi
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
            Hetrafi::create(treasury, ctx);
        };
        
        // Test with very small amount (e.g., 1)
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let small_coin = coin::mint_for_testing<HETRACOIN>(1, ctx);
            transfer::public_transfer(small_coin, user);
        };
        
        // User transfers with fee
        test_scenario::next_tx(scenario, user);
        {
            let hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let (transferred, fee) = Hetrafi::transfer_with_fee(&hetrafi, coin, user, ctx);
            
            // For amount 1, fee should be 0 (or 1 depending on your implementation)
            // Let's assume fee is 5% rounded down
            assert_eq(coin::value(&transferred), 1);
            assert_eq(coin::value(&fee), 0);
            
            transfer::public_transfer(transferred, user);
            transfer::public_transfer(fee, treasury);
            test_scenario::return_shared(hetrafi);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    public fun test_zero_amount_fee() {
        let admin = @0xA;
        let treasury = @0xB;
        let user = @0xC;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin and Hetrafi
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
            Hetrafi::create(treasury, ctx);
        };
        
        // Test with zero amount
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let zero_coin = coin::mint_for_testing<HETRACOIN>(0, ctx);
            transfer::public_transfer(zero_coin, user);
        };
        
        // User transfers with fee
        test_scenario::next_tx(scenario, user);
        {
            let hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let (transferred, fee) = Hetrafi::transfer_with_fee(&hetrafi, coin, user, ctx);
            
            // For amount 0, both transferred and fee should be 0
            assert_eq(coin::value(&transferred), 0);
            assert_eq(coin::value(&fee), 0);
            
            transfer::public_transfer(transferred, user);
            transfer::public_transfer(fee, treasury);
            test_scenario::return_shared(hetrafi);
        };
        
        test_scenario::end(scenario_val);
    }
} 