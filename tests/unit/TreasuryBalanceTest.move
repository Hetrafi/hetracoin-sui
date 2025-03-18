// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for Treasury balance management
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::TreasuryBalanceTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Treasury;

    #[test]
    public fun test_treasury_balance_management() {
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
        
        // Test deposit and withdrawal
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Create some coins to deposit
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            
            // Deposit the coin - now uses balance instead of burning
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Check balance using the getter function
            assert!(Treasury::get_balance(&treasury) == 1000, 0);
            
            // Admin withdraws some funds
            Treasury::withdraw(&mut treasury, 300, ctx);
            
            // Check updated balance
            assert!(Treasury::get_balance(&treasury) == 700, 0);
            
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
            
            // Create some coins to deposit
            let coin = coin::mint_for_testing<HETRACOIN>(500, ctx);
            
            // Deposit the coin
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Check balance using the getter function
            assert!(Treasury::get_balance(&treasury) == 500, 0);
            
            // Clean up
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 