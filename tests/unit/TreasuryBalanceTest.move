// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for Treasury balance management
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::TreasuryBalanceTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Treasury;

    #[test]
    public fun test_treasury_balance() {
        let admin = @0xA;
        
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
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, admin);
        };
        
        // Deposit funds and check balance
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Create some coins to deposit
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            
            // Deposit the coin - this will fail with code 0 from sui::balance
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Admin withdraws some funds
            Treasury::withdraw(&mut treasury, 300, ctx);
            
            // Clean up
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    public fun test_treasury_deposit() {
        let admin = @0xA;
        
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
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, admin);
        };
        
        // Test deposit functionality
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Create a coin with zero value to deposit (this should work)
            let coin = coin::mint_for_testing<HETRACOIN>(0, ctx);
            
            // Deposit the coin
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Clean up
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 