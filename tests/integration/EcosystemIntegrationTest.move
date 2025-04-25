// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Comprehensive integration test for the HetraCoin ecosystem
#[allow(duplicate_alias, unused_use)]
module hetracoin_integration::EcosystemIntegrationTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance;
    use hetracoin::Treasury;
    use hetracoin::Hetrafi;
    use hetracoin::Staking;
    use hetracoin::Escrow;
    use hetracoin::Proposal;

    #[test]
    public fun test_ecosystem_integration() {
        let admin = @0xA;
        let user1 = @0xB;
        let user2 = @0xC;
        let treasury_addr = @0xD;
        
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
        
        // Create Treasury
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            let treasury = Treasury::create_treasury(treasury_addr, ctx);
            transfer::public_transfer(treasury, treasury_addr);
        };
        
        // Create Hetrafi marketplace
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            Hetrafi::create(admin, ctx);
        };
        
        // Create staking pool
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            Staking::create_staking_pool(500, 30, ctx); // 5% APY, 30 day min lock
        };
        
        // Create governance system
        ts::next_tx(scenario, admin);
        {
            let ctx = ts::ctx(scenario);
            Proposal::create_governance_system(1000, 7, 2, ctx);
        };
        
        // Mint coins for users
        ts::next_tx(scenario, admin);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let admin_registry = ts::take_shared<AdminRegistry>(scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            let ctx = ts::ctx(scenario);
            
            let user1_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 5000, ctx);
            let user2_coins = Governance::mint(&mut treasury_cap, &admin_registry, &pause_state, 3000, ctx);
            
            transfer::public_transfer(user1_coins, user1);
            transfer::public_transfer(user2_coins, user2);
            
            ts::return_to_sender(scenario, treasury_cap);
            ts::return_shared(admin_registry);
            ts::return_shared(pause_state);
        };
        
        // User1 stakes coins
        ts::next_tx(scenario, user1);
        {
            let mut pool = ts::take_shared<Staking::StakingPool>(scenario);
            let mut coins = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Split coins - 2000 for staking, 3000 remains
            let staking_coins = coin::split(&mut coins, 2000, ctx);
            
            // Stake coins
            Staking::stake(&mut pool, staking_coins, 90, ctx);
            
            // Return remaining coins
            transfer::public_transfer(coins, user1);
            ts::return_shared(pool);
        };
        
        // User2 creates a wager with User1
        ts::next_tx(scenario, user2);
        {
            let ctx = ts::ctx(scenario);
            
            // Create wager for 1000 coins
            let wager = Escrow::lock_wager(user2, user1, 1000, admin, ctx);
            
            // Transfer wager to admin (resolver)
            transfer::public_transfer(wager, admin);
        };
        
        // User1 makes a purchase through Hetrafi
        ts::next_tx(scenario, user1);
        {
            let mut hetrafi = ts::take_shared<Hetrafi::Hetrafi>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Create purchase coins
            let purchase_coins = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            
            // Process payment with fee - now using &mut reference
            let (payment, fee) = Hetrafi::transfer_with_fee(&mut hetrafi, purchase_coins, user2, ctx);
            
            // Transfer coins
            transfer::public_transfer(payment, user2);
            transfer::public_transfer(fee, treasury_addr);
            
            ts::return_shared(hetrafi);
        };
        
        // Admin resolves the wager
        ts::next_tx(scenario, admin);
        {
            let mut wager = ts::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Resolve in favor of user1
            Escrow::release_wager(admin, &mut wager, user1, ctx);
            
            ts::return_to_sender(scenario, wager);
        };
        
        // Treasury receives the fee
        ts::next_tx(scenario, treasury_addr);
        {
            let mut treasury = ts::take_from_sender<Treasury::Treasury>(scenario);
            let fee_coin = ts::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = ts::ctx(scenario);
            
            // Deposit fee into treasury
            Treasury::deposit(&mut treasury, fee_coin, ctx);
            
            ts::return_to_sender(scenario, treasury);
        };
        
        ts::end(scenario_val);
    }
} 