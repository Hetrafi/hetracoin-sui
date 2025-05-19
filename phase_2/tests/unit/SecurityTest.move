// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for security & unauthorized access checks
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::SecurityTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Treasury;
    use hetracoin::Escrow;

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Governance)]
    public fun test_unauthorized_mint_fails() {
        let admin = @0xA;
        let attacker = @0xB;
        
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
        
        // Transfer treasury cap to attacker
        ts::next_tx(scenario, admin);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, attacker);
        };
        
        // Attacker tries to mint (should fail)
        ts::next_tx(scenario, attacker);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Should fail with abort code 1
            let minted_coin = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 100000, ctx);
            transfer::public_transfer(minted_coin, attacker);
            
            // Return objects to prevent test framework errors
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Treasury)]
    public fun test_unauthorized_treasury_withdrawal_fails() {
        let admin = @0xA;
        let attacker = @0xB;
        
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // Create treasury
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, attacker);
        };
        
        // Attacker tries to withdraw (should fail)
        ts::next_tx(scenario, attacker);
        {
            // Verify the treasury was received by the attacker
            assert!(ts::has_most_recent_for_sender<Treasury::Treasury>(scenario), 0);
            
            let mut treasury = ts::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = ts::ctx(scenario);
            
            // This should fail with abort code 1
            Treasury::withdraw(&mut treasury, 500, ctx);
            
            ts::return_to_sender(scenario, treasury);
        };
        
        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Escrow)]
    public fun test_wager_tampering_fails() {
        let attacker = @0xA;
        let resolver = @0xB;
        let player = @0xC;
        
        let mut scenario_val = ts::begin(resolver);
        let scenario = &mut scenario_val;
        
        // Create wager
        ts::next_tx(scenario, resolver);
        {
            let ctx = ts::ctx(scenario);
            let wager = Escrow::lock_wager(
                player,
                player,
                500,
                resolver,
                ctx
            );
            transfer::public_transfer(wager, attacker);
        };
        
        // Attacker tries to release funds (should fail)
        ts::next_tx(scenario, attacker);
        {
            let mut wager = ts::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = ts::ctx(scenario);
            
            // This should fail with abort code 1
            Escrow::release_wager(attacker, &mut wager, attacker, ctx);
            
            ts::return_to_sender(scenario, wager);
        };
        
        ts::end(scenario_val);
    }
}
