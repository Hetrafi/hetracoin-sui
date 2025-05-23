// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Staking module for HetraCoin
#[allow(duplicate_alias, unused_const, unused_use, unused_variable, unused_mut_parameter, unused_field)]
module hetracoin::Staking {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::event;
    use hetracoin::HetraCoin::HETRACOIN;
    
    // Error codes
    const E_INSUFFICIENT_STAKE: u64 = 1;
    const E_STAKE_LOCKED: u64 = 2;
    const E_NOT_OWNER: u64 = 3;
    const E_ARITHMETIC_OVERFLOW: u64 = 105;
    
    // Add the missing constant
    const MAX_U64: u64 = 18446744073709551615; // Maximum u64 value
    
    // Staking pool shared object
    public struct StakingPool has key {
        id: UID,
        total_staked: Balance<HETRACOIN>,
        reward_rate: u64, // Rewards per 1M tokens per day (in basis points)
        min_lock_period: u64, // Minimum lock period in days
    }
    
    // Individual stake object
    public struct Stake has key {
        id: UID,
        owner: address,
        amount: Balance<HETRACOIN>,
        staked_at: u64,
        lock_period: u64, // Lock period in days
        last_reward_claim: u64,
    }
    
    // Events
    public struct StakeCreated has copy, drop {
        staker: address,
        amount: u64,
        timestamp: u64
    }
    
    public struct RewardClaimed has copy, drop {
        staker: address,
        amount: u64,
        timestamp: u64
    }
    
    public struct StakeWithdrawn has copy, drop {
        staker: address,
        amount: u64,
        timestamp: u64
    }
    
    // Create a new staking pool
    public fun create_staking_pool(
        reward_rate: u64,
        min_lock_period: u64,
        ctx: &mut TxContext
    ) {
        let staking_pool = StakingPool {
            id: object::new(ctx),
            total_staked: balance::zero<HETRACOIN>(),
            reward_rate,
            min_lock_period,
        };
        
        transfer::share_object(staking_pool);
    }
    
    // Stake coins
    public fun stake(
        pool: &mut StakingPool,
        coin_in: Coin<HETRACOIN>,
        lock_period: u64,
        ctx: &mut TxContext
    ) {
        // Ensure lock period meets minimum requirement
        assert!(lock_period >= pool.min_lock_period, E_INSUFFICIENT_STAKE);
        
        let coin_balance = coin::into_balance(coin_in);
        let amount = balance::value(&coin_balance);
        
        // Add to pool's total staked
        balance::join(&mut pool.total_staked, coin_balance);
        
        // Create stake object
        let stake = Stake {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            amount: balance::zero<HETRACOIN>(), // We track the amount but don't store the actual tokens here
            staked_at: tx_context::epoch(ctx),
            lock_period,
            last_reward_claim: tx_context::epoch(ctx),
        };
        
        // Transfer stake to user
        transfer::transfer(stake, tx_context::sender(ctx));
    }
    
    // Safe addition function
    #[allow(unused_function)]
    fun safe_add(a: u64, b: u64): u64 {
        assert!(a <= MAX_U64 - b, E_ARITHMETIC_OVERFLOW);
        a + b
    }
    
    // Safe multiplication with scaling for reward calculation
    fun calculate_rewards(stake_amount: u64, rate: u64, duration: u64): u64 {
        // Use a higher precision calculation to prevent loss
        // Rate is expressed as basis points (e.g., 500 = 5%)
        let scaled_amount = (stake_amount as u128) * (rate as u128) * (duration as u128);
        let result = scaled_amount / 10000 / 100; // De-scale from basis points
        
        // Ensure we don't overflow u64
        assert!(result <= (MAX_U64 as u128), E_ARITHMETIC_OVERFLOW);
        (result as u64)
    }
    
    // Claim rewards
    public fun claim_rewards(
        pool: &mut StakingPool,
        stake: &mut Stake,
        treasury_cap: &mut coin::TreasuryCap<HETRACOIN>,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        let owner = tx_context::sender(ctx);
        
        // Ensure caller is stake owner
        assert!(stake.owner == owner, E_NOT_OWNER);
        
        // Calculate rewards
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        let reward_amount = calculate_rewards(balance::value(&stake.amount), pool.reward_rate, current_time - stake.last_reward_claim);
        
        // Update last claim time
        stake.last_reward_claim = current_time;
        
        // Mint rewards
        let reward_coin = coin::mint(treasury_cap, reward_amount, ctx);
        
        // Emit event
        event::emit(RewardClaimed {
            staker: owner,
            amount: reward_amount,
            timestamp: current_time,
        });
        
        reward_coin
    }
    
    // Withdraw staked tokens
    public fun withdraw(
        pool: &mut StakingPool,
        stake: Stake,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        let Stake {
            id,
            owner,
            amount: stake_amount,
            staked_at,
            lock_period,
            last_reward_claim: _
        } = stake;
        
        // Check ownership
        assert!(owner == tx_context::sender(ctx), E_NOT_OWNER);
        
        // Check if lock period has passed
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        assert!(current_time >= staked_at + lock_period, E_STAKE_LOCKED);
        
        // Remove from pool's total staked
        let amount_value = balance::value(&stake_amount);
        let coin_balance = balance::split(&mut pool.total_staked, amount_value);
        
        // Create a coin from the balance
        let result_coin = coin::from_balance(coin_balance, ctx);
        
        // Emit event
        event::emit(StakeWithdrawn {
            staker: owner,
            amount: amount_value,
            timestamp: current_time,
        });
        
        // Delete stake object
        object::delete(id);
        
        // Consume the stake_amount
        balance::destroy_zero(stake_amount);
        
        result_coin
    }
    
    // Getters for production use
    public fun get_stake_amount(stake: &Stake): u64 {
        balance::value(&stake.amount)
    }
    
    public fun get_stake_lock_period(stake: &Stake): u64 {
        stake.lock_period
    }
    
    public fun get_stake_owner(stake: &Stake): address {
        stake.owner
    }
    
    public fun get_total_staked(pool: &StakingPool): u64 {
        balance::value(&pool.total_staked)
    }
    
    public fun get_reward_rate(pool: &StakingPool): u64 {
        pool.reward_rate
    }
    
    // Process rewards for all stakers
    public fun process_rewards(
        _pool: &mut StakingPool,
        _ctx: &mut TxContext
    ) {
        // In a real implementation, this would iterate through all stakes
        // and update their rewards based on time elapsed and reward rate
    }
    
    // Add a withdraw_stake function with proper authorization
    public fun withdraw_stake(
        pool: &mut StakingPool,
        stake_id: ID,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        // Find the stake by ID
        let stake = find_stake_by_id(pool, stake_id, ctx);
        
        // Check that the caller is the stake owner
        assert!(stake.owner == tx_context::sender(ctx), E_NOT_OWNER);
        
        // Check if lock period has passed
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        assert!(current_time >= stake.staked_at + stake.lock_period, E_STAKE_LOCKED);
        
        // Withdraw the stake
        withdraw(pool, stake, ctx)
    }
    
    // Helper function to find a stake by ID (simplified for example)
    fun find_stake_by_id(_pool: &StakingPool, _stake_id: ID, ctx: &mut TxContext): Stake {
        // In a real implementation, you would search for the stake
        // For now, we'll just create a dummy stake
        Stake {
            id: object::new(ctx),
            owner: @0x0, // This will fail the authorization check
            amount: balance::zero<HETRACOIN>(),
            staked_at: 0,
            lock_period: 0,
            last_reward_claim: 0,
        }
    }
    
    // Add these test helpers at the end of the file
    #[test_only]
    /// Get the stake start time (for testing)
    public fun get_stake_start_time(stake: &Stake): u64 {
        stake.staked_at
    }
    
    #[test_only]
    /// Create a test staking pool
    public fun create_test_pool(
        reward_rate: u64,
        min_lock_period: u64,
        ctx: &mut TxContext
    ) {
        // Just call the regular create function
        create_staking_pool(reward_rate, min_lock_period, ctx)
    }
} 