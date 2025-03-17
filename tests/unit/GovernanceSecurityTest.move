// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Security tests for Governance
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::GovernanceSecurityTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;

    #[test]
    public fun test_governance_transfer() {
        let admin = @0xA;
        let new_admin = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Transfer governance to new admin
        test_scenario::next_tx(scenario, admin);
        {
            let treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, new_admin);
        };
        
        // Verify new admin received the treasury cap
        test_scenario::next_tx(scenario, new_admin);
        {
            let treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            // Just verify the treasury cap was received, don't try to mint
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        test_scenario::end(scenario_val);
    }
} 