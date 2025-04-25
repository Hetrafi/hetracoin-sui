// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for Escrow treasury arbitration
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::EscrowArbitrationTest {
    use sui::test_scenario;
    use sui::transfer;
    use hetracoin::HetraCoin;
    use hetracoin::Escrow;
    use std::vector;

    #[test]
    public fun test_treasury_arbitration() {
        let player1 = @0xA;
        let player2 = @0xB;
        let resolver = @0xC;
        let treasury_admin = @0xD;
        
        let mut scenario_val = test_scenario::begin(player1);
        let scenario = &mut scenario_val;
        
        // Initialize the coin
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create wager with a designated treasury arbitrator
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Use lock_wager_with_arbitrator to set a different treasury arbitrator than resolver
            let wager = Escrow::lock_wager_with_arbitrator(
                player1,
                player2,
                1000,
                resolver,
                treasury_admin, // Treasury admin is different from the resolver
                ctx
            );
            
            // Check that treasury_arbitrator is set correctly
            assert!(Escrow::get_treasury_arbitrator(&wager) == treasury_admin, 1);
            
            transfer::public_transfer(wager, resolver);
        };
        
        // Player files a dispute
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Player1 disputes the wager - we call from resolver to avoid back and forth transfers
            Escrow::dispute_wager(player1, &mut wager, ctx);
            
            // Verify the wager is now disputed
            assert!(Escrow::is_disputed(&wager), 2);
            assert!(Escrow::get_status(&wager) == 3, 3); // STATUS_DISPUTED = 3
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        // Treasury admin resolves the dispute
        test_scenario::next_tx(scenario, treasury_admin);
        {
            let mut wager = test_scenario::take_from_address<Escrow::WagerEscrow>(scenario, resolver);
            let ctx = test_scenario::ctx(scenario);
            
            // Create resolution notes
            let mut notes = vector::empty<u8>();
            vector::append(&mut notes, b"Treasury arbitration: approved wager");
            
            // Treasury admin resolves the dispute using the dedicated treasury_arbitrate function
            Escrow::treasury_arbitrate(treasury_admin, &mut wager, true, notes, ctx);
            
            // Verify the wager is now resolved
            assert!(Escrow::get_status(&wager) == 4, 4); // STATUS_RESOLVED = 4
            
            transfer::public_transfer(wager, resolver);
        };
        
        // Resolver can now release the funds to the winner based on arbitration
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Resolver releases funds to player2 based on the treasury arbitration
            Escrow::release_wager(resolver, &mut wager, player2, ctx);
            
            // Verify the wager is now completed
            assert!(Escrow::get_status(&wager) == 1, 5); // STATUS_COMPLETED = 1
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        test_scenario::end(scenario_val);
    }
    
    #[test]
    #[expected_failure(abort_code = Escrow::E_NOT_TREASURY_ARBITRATOR, location = hetracoin::Escrow)]
    public fun test_only_treasury_can_force_arbitrate() {
        let player1 = @0xA;
        let player2 = @0xB;
        let resolver = @0xC;
        let treasury_admin = @0xD;
        let impostor = @0xE;
        
        let mut scenario_val = test_scenario::begin(player1);
        let scenario = &mut scenario_val;
        
        // Initialize the coin
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create wager with a designated treasury arbitrator
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Create wager with treasury_admin as the arbitrator
            let wager = Escrow::lock_wager_with_arbitrator(
                player1,
                player2,
                1000,
                resolver,
                treasury_admin,
                ctx
            );
            
            transfer::public_transfer(wager, resolver);
        };
        
        // Player files a dispute
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Player1 disputes the wager
            Escrow::dispute_wager(player1, &mut wager, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        // Impostor tries to use treasury_arbitrate function
        test_scenario::next_tx(scenario, impostor);
        {
            let mut wager = test_scenario::take_from_address<Escrow::WagerEscrow>(scenario, resolver);
            let ctx = test_scenario::ctx(scenario);
            
            let mut notes = vector::empty<u8>();
            vector::append(&mut notes, b"Unauthorized arbitration attempt");
            
            // This should fail with E_NOT_TREASURY_ARBITRATOR
            Escrow::treasury_arbitrate(impostor, &mut wager, true, notes, ctx);
            
            transfer::public_transfer(wager, resolver);
        };
        
        test_scenario::end(scenario_val);
    }
    
    #[test]
    public fun test_legacy_lock_wager_compatibility() {
        let player1 = @0xA;
        let player2 = @0xB;
        let resolver = @0xC;
        
        let mut scenario_val = test_scenario::begin(player1);
        let scenario = &mut scenario_val;
        
        // Initialize the coin
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create wager using original lock_wager function
        test_scenario::next_tx(scenario, player1);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Use the backward-compatible lock_wager
            let wager = Escrow::lock_wager(
                player1,
                player2,
                1000,
                resolver,
                ctx
            );
            
            // Check that treasury_arbitrator is set to resolver for backward compatibility
            assert!(Escrow::get_treasury_arbitrator(&wager) == resolver, 1);
            
            transfer::public_transfer(wager, resolver);
        };
        
        // Test that the resolver can also act as treasury arbitrator
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Player1 disputes the wager
            Escrow::dispute_wager(player1, &mut wager, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        // Resolver (also the treasury arbitrator) resolves the dispute
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let mut notes = vector::empty<u8>();
            vector::append(&mut notes, b"Resolver acting as treasury arbitrator");
            
            // Resolver can use treasury_arbitrate since it's also the treasury arbitrator
            Escrow::treasury_arbitrate(resolver, &mut wager, true, notes, ctx);
            
            // Verify wager is resolved
            assert!(Escrow::get_status(&wager) == 4, 2); // STATUS_RESOLVED = 4
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        test_scenario::end(scenario_val);
    }
} 