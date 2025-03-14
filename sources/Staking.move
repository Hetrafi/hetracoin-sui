// Staking module for HetraCoin
module hetracoin::Staking {
    use sui::object::{Self, UID};
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
    
    // Stake tokens
    public fun stake(
        pool: &mut StakingPool,
        coin_in: Coin<HETRACOIN>,
        lock_period: u64,
        ctx: &mut TxContext
    ) {
        // Ensure lock period meets minimum
        assert!(lock_period >= pool.min_lock_period, E_INSUFFICIENT_STAKE);
        
        let owner = tx_context::sender(ctx);
        let amount = coin::value(&coin_in);
        let coin_balance = coin::into_balance(coin_in);
        
        // Add to pool's total staked
        balance::join(&mut pool.total_staked, coin_balance);
        
        // Create stake object
        let stake = Stake {
            id: object::new(ctx),
            owner,
            amount: balance::zero<HETRACOIN>(), // Will be filled when withdrawing
            staked_at: tx_context::epoch_timestamp_ms(ctx) / 86400000, // Convert to days
            lock_period,
            last_reward_claim: tx_context::epoch_timestamp_ms(ctx) / 86400000,
        };
        
        // Emit event
        event::emit(StakeCreated {
            staker: owner,
            amount,
            timestamp: tx_context::epoch_timestamp_ms(ctx) / 86400000,
        });
        
        // Transfer stake object to user
        transfer::transfer(stake, owner);
    }
    
    // Calculate rewards
    public fun calculate_rewards(
        pool: &StakingPool,
        stake: &Stake,
        current_time: u64
    ): u64 {
        let stake_amount = balance::value(&stake.amount);
        let days_staked = current_time - stake.last_reward_claim;
        
        // Calculate rewards: amount * rate * days / 10000 (basis points)
        // This is a simplified calculation
        (stake_amount * pool.reward_rate * days_staked) / 10000
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
        let reward_amount = calculate_rewards(pool, stake, current_time);
        
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
    
    // Getters
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
} 