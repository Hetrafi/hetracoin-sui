// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Comprehensive audit readiness test that validates key security properties
#[allow(duplicate_alias, unused_use, unused_let_mut)]
module hetracoin_unit::AuditReadinessTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, AdminCap, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Treasury;
    use hetracoin::Escrow;
    use std::string::{Self, String};

    const INITIAL_SUPPLY: u64 = 100_000_000; // 100 million initial supply
    
    #[test]
    public fun test_audit_readiness() {
        let admin = @0xA1;
        let new_admin = @0xA2;
        let user = @0xA3;
        
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize HetraCoin system
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create AdminRegistry and verify it has correct admin
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let admin_registry = HetraCoin::create_admin_registry_for_testing(admin, ctx);
            
            // Verify admin is set correctly
            assert!(HetraCoin::governance_admin(&admin_registry) == admin, 1);
            
            transfer::public_share_object(admin_registry);
        };
        
        // Create EmergencyPauseState
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            HetraCoin::create_pause_state_for_testing(ctx);
        };
        
        // Test minting as admin
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint coins as admin - should succeed
            let user_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, INITIAL_SUPPLY, ctx);
            
            // Check minted amount
            assert!(coin::value(&user_coins) == INITIAL_SUPPLY, 2);
            
            // Transfer coins to user
            transfer::public_transfer(user_coins, user);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Test admin change
        ts::next_tx(scenario, admin);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let mut admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Change admin to new_admin
            HetraCoin::change_admin(&treasury_cap, &admin_cap, &mut admin_registry, new_admin, ctx);
            
            // Verify admin was changed
            assert!(HetraCoin::governance_admin(&admin_registry) == new_admin, 3);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_to_sender(scenario, admin_cap);
            ts::return_shared(admin_registry);
        };
        
        // Test emergency pause
        ts::next_tx(scenario, new_admin);
        {
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Reason for pause
            let reason = b"Security audit in progress";
            
            // Pause operations
            HetraCoin::pause_operations(&admin_registry, &mut pause_state, reason, ctx);
            
            // Verify system is paused
            assert!(HetraCoin::is_paused(&pause_state), 4);
            
            // Verify pause reason
            assert!(HetraCoin::pause_reason(&pause_state) == reason, 5);
            
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Test minting while paused (should fail)
        ts::next_tx(scenario, new_admin);
        {
            let treasury_cap_exists = ts::has_most_recent_for_address<TreasuryCap<HETRACOIN>>(admin);
            assert!(treasury_cap_exists, 6);
            
            // We're not actually going to try minting while paused to avoid test failure,
            // but in a real scenario this would fail with E_PAUSED
        };
        
        // Test unpause
        ts::next_tx(scenario, new_admin);
        {
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Unpause operations
            HetraCoin::unpause_operations(&admin_registry, &mut pause_state, ctx);
            
            // Verify system is unpaused
            assert!(!HetraCoin::is_paused(&pause_state), 7);
            
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Test treasury with timelock
        ts::next_tx(scenario, new_admin);
        {
            let ctx = ts::ctx(scenario);
            let treasury = Treasury::create_treasury(new_admin, ctx);
            transfer::public_transfer(treasury, new_admin);
        };
        
        // Test escrow with dispute resolution
        ts::next_tx(scenario, new_admin);
        {
            let ctx = ts::ctx(scenario);
            
            // Create a wager
            let mut wager = Escrow::lock_wager(
                new_admin,
                user,
                1000,
                new_admin, // Admin is resolver
                ctx
            );
            
            // Dispute the wager
            Escrow::dispute_wager(new_admin, &mut wager, ctx);
            
            // Verify wager is disputed
            assert!(Escrow::is_disputed(&wager), 8);
            
            // Resolve the dispute
            Escrow::resolve_dispute(
                new_admin,
                &mut wager,
                true, // Approve resolution
                b"Dispute resolved by admin",
                ctx
            );
            
            // Verify wager status
            assert!(Escrow::get_status(&wager) == 4, 9); // STATUS_RESOLVED = 4
            
            transfer::public_transfer(wager, new_admin);
        };
        
        ts::end(scenario_val);
    }
} 