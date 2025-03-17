// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for security & unauthorized access checks
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::SecurityTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;
    use hetracoin::Treasury;
    use hetracoin::Escrow;

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Governance)]
    public fun test_unauthorized_minting_fails() {
        let admin = @0xA;
        let attacker = @0xB;
        
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
        
        // Transfer treasury cap to attacker
        test_scenario::next_tx(scenario, admin);
        {
            // Verify the treasury cap was created and sent to admin
            assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, attacker);
        };
        
        // Attacker tries to mint (should fail)
        test_scenario::next_tx(scenario, attacker);
        {
            // Verify the treasury cap was received by the attacker
            assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with abort code 1
            let minted_coin = Governance::mint(&mut treasury_cap, 100000, ctx);
            transfer::public_transfer(minted_coin, attacker);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Treasury)]
    public fun test_unauthorized_treasury_withdrawal_fails() {
        let admin = @0xA;
        let attacker = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, attacker);
        };
        
        // Attacker tries to withdraw (should fail)
        test_scenario::next_tx(scenario, attacker);
        {
            // Verify the treasury was received by the attacker
            assert!(test_scenario::has_most_recent_for_sender<Treasury::Treasury>(scenario), 0);
            
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with abort code 1
            Treasury::withdraw(&mut treasury, 500, ctx);
            
            test_scenario::return_to_sender(scenario, treasury);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Escrow)]
    public fun test_wager_tampering_fails() {
        let attacker = @0xA;
        let resolver = @0xB;
        let player = @0xC;
        
        let mut scenario_val = test_scenario::begin(resolver);
        let scenario = &mut scenario_val;
        
        // Create wager
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
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
        test_scenario::next_tx(scenario, attacker);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with abort code 1
            Escrow::release_wager(attacker, &mut wager, attacker, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        test_scenario::end(scenario_val);
    }
}
