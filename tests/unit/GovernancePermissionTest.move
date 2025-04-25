// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Tests for Governance permissions
#[allow(duplicate_alias, unused_use, unused_variable)]
module hetracoin_unit::GovernancePermissionTest {
    use sui::test_scenario::{Self as ts};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;

    const ADMIN: address = @0xA;
    const NON_ADMIN: address = @0xB;

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Governance)]
    public fun test_non_admin_cannot_mint() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create AdminRegistry with ADMIN as the admin
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            let admin_registry = HetraCoin::create_admin_registry_for_testing(ADMIN, ctx);
            transfer::public_share_object(admin_registry);
        };
        
        // Create EmergencyPauseState
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            HetraCoin::create_pause_state_for_testing(ctx);
        };
        
        // Transfer treasury cap to non-admin
        ts::next_tx(scenario, ADMIN);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, NON_ADMIN);
        };
        
        // Non-admin tries to mint (should fail)
        ts::next_tx(scenario, NON_ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // This should fail because NON_ADMIN is not authorized
            let minted_coin = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 500, ctx);
            
            // Should not reach here
            transfer::public_transfer(minted_coin, NON_ADMIN);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario_val);
    }
} 