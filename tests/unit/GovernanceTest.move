// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for Governance-controlled minting and burning
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::GovernanceTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Governance)]
    public fun test_minting_requires_governance() {
        let admin = @0xA;
        let unauthorized_user = @0xB;
        
        let mut scenario_val = ts::begin(admin);
        let scenario = &mut scenario_val;
        
        // First transaction to publish the module and initialize the coin
        ts::next_tx(scenario, admin);
        {
            // Create the coin with the one-time witness
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create AdminRegistry with admin as the admin
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
        
        // Transfer treasury cap to unauthorized user
        ts::next_tx(scenario, admin);
        {
            // Verify the treasury cap was created and sent to admin
            assert!(ts::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, unauthorized_user);
        };
        
        // Unauthorized user tries to mint (should fail)
        ts::next_tx(scenario, unauthorized_user);
        {
            // Verify the treasury cap was received by the unauthorized user
            assert!(ts::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // This should fail with abort code 1
            let minted_coin = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 1000, ctx);
            transfer::public_transfer(minted_coin, unauthorized_user);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario_val);
    }
}
