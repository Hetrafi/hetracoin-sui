// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Integration test for Treasury and Escrow arbitration
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::TreasuryArbitrationTest {
    use sui::test_scenario::{Self as ts, next_tx, ctx};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use sui::coin::{Self};
    use std::vector;
    
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Treasury;
    use hetracoin::Escrow::{Self, WagerEscrow};

    #[test]
    fun test_treasury_arbitration_integration() {
        // Set up test accounts
        let admin = @0xA;
        let player1 = @0xB;
        let player2 = @0xC;
        let treasury_admin = @0xD;
        
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize HetraCoin and create the Treasury
        next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
            
            // Create a treasury with the admin as the treasury_admin
            let treasury = Treasury::create_treasury(treasury_admin, ctx);
            
            // Transfer the treasury to the treasury_admin
            transfer::public_transfer(treasury, treasury_admin);
        };
        
        // Create a wager with treasury_admin as arbitrator
        next_tx(scenario, player1);
        {
            let ctx = ts::ctx(scenario);
            
            // Create a wager with treasury_admin as the designated arbitrator
            let wager = Escrow::lock_wager_with_arbitrator(
                player1,  // Player 1
                player2,  // Player 2
                1000,     // Amount
                admin,    // Regular resolver
                treasury_admin, // Treasury admin as arbitrator
                ctx
            );
            
            // Verify treasury_arbitrator is set correctly
            assert_eq(Escrow::get_treasury_arbitrator(&wager), treasury_admin);
            
            transfer::public_transfer(wager, admin);
        };
        
        // Player 1 disputes the wager
        next_tx(scenario, admin);
        {
            let mut wager = ts::take_from_sender<WagerEscrow>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Player 1 disputes the wager
            Escrow::dispute_wager(player1, &mut wager, ctx);
            
            // Verify the wager is now in disputed state
            assert_eq(Escrow::get_status(&wager), 3); // STATUS_DISPUTED = 3
            assert_eq(Escrow::is_disputed(&wager), true);
            
            transfer::public_transfer(wager, admin);
        };
        
        // Treasury admin resolves the dispute
        next_tx(scenario, treasury_admin);
        {
            let mut wager = ts::take_from_address<WagerEscrow>(scenario, admin);
            let ctx = ts::ctx(scenario);
            
            // Create detailed resolution notes
            let mut notes = vector::empty<u8>();
            vector::append(&mut notes, b"Treasury arbitration: Evidence reviewed. Player2 wins.");
            
            // Treasury admin resolves the dispute in favor of player2
            Escrow::treasury_arbitrate(treasury_admin, &mut wager, true, notes, ctx);
            
            // Verify the wager is now resolved
            assert_eq(Escrow::get_status(&wager), 4); // STATUS_RESOLVED = 4
            
            // Verify that resolution notes are properly set
            let resolution_notes = Escrow::get_resolution_notes(&wager);
            assert!(vector::length(&resolution_notes) > 0, 0);
            
            transfer::public_transfer(wager, admin);
        };
        
        // Resolver can now release funds to the winner
        next_tx(scenario, admin);
        {
            let mut wager = ts::take_from_sender<WagerEscrow>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Resolver releases funds to player2 based on treasury arbitration
            Escrow::release_wager(admin, &mut wager, player2, ctx);
            
            // Verify the wager is now completed
            assert_eq(Escrow::get_status(&wager), 1); // STATUS_COMPLETED = 1
            
            ts::return_to_sender(scenario, wager);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_treasury_admin_can_use_regular_resolve() {
        // Set up test accounts
        let admin = @0xA;
        let player1 = @0xB;
        let player2 = @0xC;
        let treasury_admin = @0xD;
        
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize HetraCoin
        next_tx(scenario, admin);
        {
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx(scenario));
        };
        
        // Create a wager with treasury_admin as arbitrator
        next_tx(scenario, player1);
        {
            let ctx = ts::ctx(scenario);
            
            // Create a wager with treasury_admin as the designated arbitrator
            let wager = Escrow::lock_wager_with_arbitrator(
                player1,
                player2,
                1000,
                admin,
                treasury_admin,
                ctx
            );
            
            transfer::public_transfer(wager, admin);
        };
        
        // Player files a dispute
        next_tx(scenario, admin);
        {
            let mut wager = ts::take_from_sender<WagerEscrow>(scenario);
            let ctx = ts::ctx(scenario);
            
            Escrow::dispute_wager(player1, &mut wager, ctx);
            
            transfer::public_transfer(wager, admin);
        };
        
        // Treasury admin resolves using regular resolve_dispute
        next_tx(scenario, treasury_admin);
        {
            let mut wager = ts::take_from_address<WagerEscrow>(scenario, admin);
            let ctx = ts::ctx(scenario);
            
            let _notes = b"Treasury using regular resolve method";
            
            // Treasury admin can also use the standard resolve_dispute function
            Escrow::resolve_dispute(treasury_admin, &mut wager, true, vector::empty<u8>(), ctx);
            
            // Verify the wager is now resolved
            assert_eq(Escrow::get_status(&wager), 4); // STATUS_RESOLVED = 4
            
            transfer::public_transfer(wager, admin);
        };
        
        ts::end(scenario_val);
    }
} 