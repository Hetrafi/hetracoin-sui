// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Simple integration test for Proposal module
#[allow(duplicate_alias, unused_use)]
module hetracoin_integration::ProposalIntegrationTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;
    use hetracoin::Proposal;
    use std::string;

    #[test]
    public fun test_proposal_simple() {
        let admin = @0xA;
        let voter = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create governance system
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Proposal::create_governance_system(1000, 7, 2, ctx); // 1000 min voting power, 7 day voting, 2 day delay
        };
        
        // Mint coins for voter and admin
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let voter_coins = Governance::mint(&mut treasury_cap, 5000, ctx);
            let admin_coins = Governance::mint(&mut treasury_cap, 2000, ctx);
            
            transfer::public_transfer(voter_coins, voter);
            transfer::public_transfer(admin_coins, admin);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Create proposal
        test_scenario::next_tx(scenario, admin);
        {
            let mut governance = test_scenario::take_shared<Proposal::GovernanceSystem>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let title = b"Test Proposal";
            let description = b"This is a test proposal";
            
            Proposal::create_proposal(
                &mut governance,
                &coins,
                title,
                description,
                ctx
            );
            
            test_scenario::return_to_sender(scenario, coins);
            test_scenario::return_shared(governance);
        };
        
        // Voter votes yes
        test_scenario::next_tx(scenario, voter);
        {
            let mut governance = test_scenario::take_shared<Proposal::GovernanceSystem>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            Proposal::vote(&mut governance, 1, coins, true, ctx);
            
            test_scenario::return_shared(governance);
        };
        
        test_scenario::end(scenario_val);
    }
} 