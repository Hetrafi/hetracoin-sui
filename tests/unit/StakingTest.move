// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for Staking module
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::StakingTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Staking;

    #[test]
    public fun test_staking_basic() {
        let admin = @0xA;
        let staker = @0xB;
        
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
        
        // Create staking pool
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            // Create with 5% APR and 30 day lock period
            Staking::create_staking_pool(500, 30, ctx);
        };
        
        // Mint coins for staker
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Mint coins for staking
            let staker_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 10000, ctx);
            transfer::public_transfer(staker_coins, staker);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // Staker stakes coins
        ts::next_tx(scenario, staker);
        {
            let mut pool = ts::take_shared<Staking::StakingPool>(scenario);
            let coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Pass coins directly, not a reference
            Staking::stake(&mut pool, coins, 30, ctx);
            
            ts::return_shared(pool);
        };
        
        // Advance time (30 days)
        ts::next_tx(scenario, admin);
        {
            // Advance block time (simulated in tests)
            ts::next_epoch(scenario, admin);
        };
        
        // Staker processes rewards
        ts::next_tx(scenario, staker);
        {
            let mut pool = ts::take_shared<Staking::StakingPool>(scenario);
            let ctx = ts::ctx(scenario);
            
            Staking::process_rewards(&mut pool, ctx);
            
            ts::return_shared(pool);
        };
        
        ts::end(scenario_val);
    }
} 