// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Test for batch processing of staking rewards
#[allow(duplicate_alias, unused_use, unused_variable, unused_let_mut)]
module hetracoin_unit::StakingBatchTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use std::vector;
    use sui::table;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Staking;

    #[test]
    public fun test_batch_staking() {
        let admin = @0xA;
        let user1 = @0xB;
        let user2 = @0xC;
        let user3 = @0xD;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create AdminRegistry
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let admin_registry = HetraCoin::create_admin_registry_for_testing(admin, ctx);
            transfer::public_share_object(admin_registry);
        };
        
        // Create EmergencyPauseState
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            HetraCoin::create_pause_state_for_testing(ctx);
        };
        
        // Create staking pool
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Staking::create_staking_pool(500, 30, ctx);
        };
        
        // Mint coins for users and stake them
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = test_scenario::take_shared<AdminRegistry>(scenario);
            let pause_state = test_scenario::take_shared<EmergencyPauseState>(scenario);
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Mint and stake for user1
            let coins1 = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 2000, ctx);
            transfer::public_transfer(coins1, user1);
            
            // Mint and stake for user2
            let coins2 = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 3000, ctx);
            transfer::public_transfer(coins2, user2);
            
            // Mint and stake for user3
            let coins3 = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 4000, ctx);
            transfer::public_transfer(coins3, user3);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
            test_scenario::return_shared(admin_registry);
            test_scenario::return_shared(pause_state);
            test_scenario::return_shared(pool);
        };
        
        // User1 stakes
        test_scenario::next_tx(scenario, user1);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Call stake function - it doesn't return anything, it transfers the Stake object directly
            Staking::stake(&mut pool, coins, 90, ctx);
            
            test_scenario::return_shared(pool);
        };
        
        // User2 stakes
        test_scenario::next_tx(scenario, user2);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Call stake function - it doesn't return anything, it transfers the Stake object directly
            Staking::stake(&mut pool, coins, 90, ctx);
            
            test_scenario::return_shared(pool);
        };
        
        // User3 stakes
        test_scenario::next_tx(scenario, user3);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Call stake function - it doesn't return anything, it transfers the Stake object directly
            Staking::stake(&mut pool, coins, 90, ctx);
            
            test_scenario::return_shared(pool);
        };
        
        // Process rewards
        test_scenario::next_tx(scenario, admin);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Process rewards for all stakers
            Staking::process_rewards(&mut pool, ctx);
            
            test_scenario::return_shared(pool);
        };
        
        // Check user1's stake
        test_scenario::next_tx(scenario, user1);
        {
            let stake = test_scenario::take_from_sender<Staking::Stake>(scenario);
            let staked_amount = Staking::get_stake_amount(&stake);
            test_scenario::return_to_sender(scenario, stake);
        };
        
        // Check user2's stake
        test_scenario::next_tx(scenario, user2);
        {
            let stake = test_scenario::take_from_sender<Staking::Stake>(scenario);
            let staked_amount = Staking::get_stake_amount(&stake);
            test_scenario::return_to_sender(scenario, stake);
        };
        
        // Check user3's stake
        test_scenario::next_tx(scenario, user3);
        {
            let stake = test_scenario::take_from_sender<Staking::Stake>(scenario);
            let staked_amount = Staking::get_stake_amount(&stake);
            test_scenario::return_to_sender(scenario, stake);
        };
        
        test_scenario::end(scenario_val);
    }
} 