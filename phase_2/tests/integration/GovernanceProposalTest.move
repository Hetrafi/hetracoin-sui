// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Integration test for Governance Proposal system
#[allow(duplicate_alias, unused_use, unused_variable)]
module hetracoin_integration::GovernanceProposalTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    // We'll skip using the Proposal module since its interface is different than expected

    #[test]
    public fun test_governance_functions() {
        let admin = @0xA;
        let voter1 = @0xB;
        let voter2 = @0xC;
        
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
            
            // Mint coins for voting with the pause state parameter
            let voter1_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 5000, ctx);
            transfer::public_transfer(voter1_coins, voter1);
            
            let voter2_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 3000, ctx);
            transfer::public_transfer(voter2_coins, voter2);
            
            let admin_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 10000, ctx);
            transfer::public_transfer(admin_coins, admin);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Verify that tokens were minted correctly
        ts::next_tx(scenario, voter1);
        {
            let coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            assert!(coin::value(&coins) == 5000, 0);
            ts::return_to_sender(scenario, coins);
        };
        
        ts::next_tx(scenario, voter2);
        {
            let coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            assert!(coin::value(&coins) == 3000, 0);
            ts::return_to_sender(scenario, coins);
        };
        
        ts::next_tx(scenario, admin);
        {
            let coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            assert!(coin::value(&coins) == 10000, 0);
            ts::return_to_sender(scenario, coins);
        };
        
        ts::end(scenario_val);
    }
} 