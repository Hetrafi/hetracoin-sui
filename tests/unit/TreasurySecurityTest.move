// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for Treasury security features
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::TreasurySecurityTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Treasury;

    #[test]
    #[expected_failure(abort_code = Treasury::E_NOT_AUTHORIZED)]
    public fun test_unauthorized_withdrawal() {
        let admin = @0xA;
        let attacker = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let mut treasury = Treasury::create_treasury(admin, ctx);
            
            // Deposit some funds
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Make treasury accessible to attacker
            transfer::public_transfer(treasury, attacker);
        };
        
        // Attacker tries to withdraw
        test_scenario::next_tx(scenario, attacker);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with E_NOT_AUTHORIZED
            Treasury::withdraw(&mut treasury, 100, ctx);
            
            // Clean up
            transfer::public_transfer(treasury, attacker);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = Treasury::E_INSUFFICIENT_FUNDS)]
    public fun test_overdraw_prevention() {
        let admin = @0xA;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let mut treasury = Treasury::create_treasury(admin, ctx);
            
            // Deposit some funds
            let coin = coin::mint_for_testing<HETRACOIN>(500, ctx);
            Treasury::deposit(&mut treasury, coin, ctx);
            
            transfer::public_transfer(treasury, admin);
        };
        
        // Try to withdraw more than available
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with E_INSUFFICIENT_FUNDS
            Treasury::withdraw(&mut treasury, 1000, ctx);
            
            // Clean up
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    public fun test_reentrancy_guard() {
        // This is a simplified test since we can't actually test reentrancy in unit tests
        // But we can verify the guard is properly reset after operations
        let admin = @0xA;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create treasury and perform operations
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let mut treasury = Treasury::create_treasury(admin, ctx);
            
            // Deposit funds
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Withdraw funds
            Treasury::withdraw(&mut treasury, 500, ctx);
            
            // If reentrancy guard wasn't reset, this would fail
            let coin2 = coin::mint_for_testing<HETRACOIN>(500, ctx);
            Treasury::deposit(&mut treasury, coin2, ctx);
            
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 