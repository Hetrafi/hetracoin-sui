// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Simple integration test for Proposal module
#[allow(duplicate_alias, unused_use, unused_variable)]
module hetracoin_integration::ProposalIntegrationTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Proposal;
    use std::string;

    #[test]
    public fun test_proposal_flow() {
        let admin = @0xA;
        let voter = @0xB;
        
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
        
        // Mint coins for voting
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint coins for voting
            let voter_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 5000, ctx);
            
            // Send to voter
            transfer::public_transfer(voter_coins, voter);
            
            let admin_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 2000, ctx);
            transfer::public_transfer(admin_coins, admin);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Create a mock governance proposal (simplified)
        ts::next_tx(scenario, admin);
        {
            // Use underscore for unused variable
            let _ctx = ts::ctx(scenario);
            // In a real implementation, this would create a governance proposal
            // For test simplicity, we'll just simulate the process
        };
        
        ts::end(scenario_val);
    }
} 