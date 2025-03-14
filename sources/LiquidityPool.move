// Liquidity Pool module for HetraCoin
#[allow(duplicate_alias, unused_use, unused_variable, unused_mut_parameter, unused_let_mut, unused_const)]
module hetracoin::LiquidityPool {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::event;
    use hetracoin::HetraCoin::HETRACOIN;
    use sui::sui::SUI;
    use std::vector;

    // Error codes
    const E_INSUFFICIENT_LIQUIDITY: u64 = 1;
    const E_INSUFFICIENT_OUTPUT: u64 = 2;
    const E_ZERO_AMOUNT: u64 = 3;
    const E_SLIPPAGE_EXCEEDED: u64 = 4;

    // Constants for precision in calculations
    const RATE_PRECISION: u64 = 1000000; // 6 decimal places
    const INITIAL_EXCHANGE_RATE: u64 = 1000000; // 1:1 initial rate

    // Optimize liquidity pool fee handling
    // Add a fee accumulator to reduce per-transaction overhead
    public struct LiquidityPool has key, store {
        id: UID,
        token_a_reserve: Balance<HETRACOIN>,
        token_b_reserve: Balance<SUI>,
        lp_token_supply: u64,
        fee_percent: u64,
        accumulated_fees_a: u64,  // Accumulated fees for token A
        accumulated_fees_b: u64,  // Accumulated fees for token B
        fee_processing_threshold: u64,  // Threshold for processing fees
        last_fee_processing_time: u64,  // Last time fees were processed
        admin: address
    }

    // LP token
    public struct LPToken has key, store {
        id: UID,
        amount: u64
    }

    // Events
    public struct LiquidityAddedEvent has copy, drop {
        provider: address,
        amount_a: u64,
        amount_b: u64,
        timestamp: u64
    }

    public struct SwapEvent has copy, drop {
        trader: address,
        amount_in: u64,
        amount_out: u64,
        timestamp: u64
    }

    // Event for fee processing
    public struct FeeProcessingEvent has copy, drop {
        pool_id: address,
        fees_a: u64,
        fees_b: u64,
        timestamp: u64
    }

    // Create a new liquidity pool
    public fun create_pool(
        initial_token: Coin<HETRACOIN>,
        initial_sui: Coin<SUI>,
        lp_fee: u64,
        ctx: &mut TxContext
    ) {
        let token_balance = coin::into_balance(initial_token);
        let sui_balance = coin::into_balance(initial_sui);

        let pool = LiquidityPool {
            id: object::new(ctx),
            token_a_reserve: token_balance,
            token_b_reserve: sui_balance,
            lp_token_supply: 0,
            fee_percent: lp_fee,
            accumulated_fees_a: 0,
            accumulated_fees_b: 0,
            fee_processing_threshold: 10000, // Process after accumulating 10000 tokens
            last_fee_processing_time: tx_context::epoch_timestamp_ms(ctx),
            admin: tx_context::sender(ctx)
        };
        
        transfer::share_object(pool);
    }

    // Add liquidity to the pool
    public fun add_liquidity(
        pool: &mut LiquidityPool,
        token_in: Coin<HETRACOIN>,
        sui_in: Coin<SUI>,
        ctx: &mut TxContext
    ): LPToken {
        let token_amount = coin::value(&token_in);
        let sui_amount = coin::value(&sui_in);

        // Ensure non-zero amounts
        assert!(token_amount > 0 && sui_amount > 0, E_ZERO_AMOUNT);

        // Add tokens to reserves
        balance::join(&mut pool.token_a_reserve, coin::into_balance(token_in));
        balance::join(&mut pool.token_b_reserve, coin::into_balance(sui_in));

        // Calculate LP tokens to mint
        let lp_tokens_to_mint = if (pool.lp_token_supply == 0) {
            // Initial liquidity - use geometric mean
            (token_amount * sui_amount) / 1000
        } else {
            // Subsequent liquidity - use proportional calculation
            let token_reserve = balance::value(&pool.token_a_reserve) - token_amount;
            let sui_reserve = balance::value(&pool.token_b_reserve) - sui_amount;
            
            let token_ratio = (token_amount * pool.lp_token_supply) / token_reserve;
            let sui_ratio = (sui_amount * pool.lp_token_supply) / sui_reserve;
            
            // Use the smaller ratio to prevent dilution
            if (token_ratio < sui_ratio) { token_ratio } else { sui_ratio }
        };

        // Update LP token supply
        pool.lp_token_supply = pool.lp_token_supply + lp_tokens_to_mint;

        // Create LP token
        let lp_token = LPToken {
            id: object::new(ctx),
            amount: lp_tokens_to_mint
        };

        // Emit event
        event::emit(LiquidityAddedEvent {
            provider: tx_context::sender(ctx),
            amount_a: token_amount,
            amount_b: sui_amount,
            timestamp: tx_context::epoch_timestamp_ms(ctx)
        });

        lp_token
    }

    // Swap SUI for HETRACOIN
    public fun swap_sui_for_token(
        pool: &mut LiquidityPool,
        sui_in: Coin<SUI>,
        min_token_out: u64,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        let sui_amount = coin::value(&sui_in);
        assert!(sui_amount > 0, E_ZERO_AMOUNT);

        // Calculate output amount with fee
        let sui_reserve = balance::value(&pool.token_b_reserve);
        let token_reserve = balance::value(&pool.token_a_reserve);
        
        // Apply fee (e.g., 0.3% fee means 997/1000 of input)
        let sui_amount_with_fee = (sui_amount * (10000 - pool.fee_percent)) / 10000;
        
        // Calculate output based on constant product formula: x * y = k
        let numerator = sui_amount_with_fee * token_reserve;
        let denominator = sui_reserve + sui_amount_with_fee;
        let token_out = numerator / denominator;
        
        // Check minimum output
        assert!(token_out >= min_token_out, E_INSUFFICIENT_OUTPUT);
        
        // Update reserves
        balance::join(&mut pool.token_b_reserve, coin::into_balance(sui_in));
        
        // Track fees
        let fee_amount = (sui_amount * pool.fee_percent) / 10000;
        pool.accumulated_fees_b = pool.accumulated_fees_b + fee_amount;
        
        // Process accumulated fees if threshold reached
        if (pool.accumulated_fees_b >= pool.fee_processing_threshold) {
            process_fees(pool, ctx);
        };
        
        // Create output token
        let token_out_coin = coin::take(&mut pool.token_a_reserve, token_out, ctx);
        
        // Emit swap event
        event::emit(SwapEvent {
            trader: tx_context::sender(ctx),
            amount_in: sui_amount,
            amount_out: token_out,
            timestamp: tx_context::epoch_timestamp_ms(ctx)
        });
        
        token_out_coin
    }

    // Process accumulated fees
    fun process_fees(pool: &mut LiquidityPool, _ctx: &mut TxContext) {
        let fees_a = pool.accumulated_fees_a;
        let fees_b = pool.accumulated_fees_b;
        
        // Reset accumulators
        pool.accumulated_fees_a = 0;
        pool.accumulated_fees_b = 0;
        pool.last_fee_processing_time = tx_context::epoch_timestamp_ms(_ctx);
        
        // Emit fee processing event
        event::emit(FeeProcessingEvent {
            pool_id: object::uid_to_address(&pool.id),
            fees_a,
            fees_b,
            timestamp: tx_context::epoch_timestamp_ms(_ctx)
        });
    }

    // Get total liquidity in the pool
    public fun get_total_liquidity(pool: &LiquidityPool): u64 {
        balance::value(&pool.token_a_reserve) + balance::value(&pool.token_b_reserve)
    }

    // Get the current exchange rate
    public fun get_exchange_rate(
        pool: &LiquidityPool,
        _ctx: &TxContext
    ): u64 {
        // Calculate and return the current exchange rate
        if (balance::value(&pool.token_a_reserve) == 0) {
            // Default rate if no tokens in pool
            return INITIAL_EXCHANGE_RATE
        };
        
        // Calculate based on reserves
        (balance::value(&pool.token_b_reserve) * RATE_PRECISION) / balance::value(&pool.token_a_reserve)
    }

    // Swap HETRACOIN for SUI
    public fun swap_token_for_sui(
        pool: &mut LiquidityPool,
        token_in: Coin<HETRACOIN>,
        min_sui_out: u64,
        ctx: &mut TxContext
    ): Coin<SUI> {
        let token_amount = coin::value(&token_in);
        assert!(token_amount > 0, E_ZERO_AMOUNT);

        // Calculate output amount with fee
        let token_reserve = balance::value(&pool.token_a_reserve);
        let sui_reserve = balance::value(&pool.token_b_reserve);
        
        // Apply fee (e.g., 0.3% fee means 997/1000 of input)
        let token_amount_with_fee = (token_amount * (10000 - pool.fee_percent)) / 10000;
        
        // Calculate output based on constant product formula: x * y = k
        let numerator = token_amount_with_fee * sui_reserve;
        let denominator = token_reserve + token_amount_with_fee;
        let sui_out = numerator / denominator;
        
        // Check minimum output
        assert!(sui_out >= min_sui_out, E_INSUFFICIENT_OUTPUT);
        
        // Update reserves
        balance::join(&mut pool.token_a_reserve, coin::into_balance(token_in));
        
        // Track fees
        let fee_amount = (token_amount * pool.fee_percent) / 10000;
        pool.accumulated_fees_a = pool.accumulated_fees_a + fee_amount;
        
        // Process accumulated fees if threshold reached
        if (pool.accumulated_fees_a >= pool.fee_processing_threshold) {
            process_fees(pool, ctx);
        };
        
        // Create output token
        let sui_out_coin = coin::take(&mut pool.token_b_reserve, sui_out, ctx);
        
        // Emit swap event
        event::emit(SwapEvent {
            trader: tx_context::sender(ctx),
            amount_in: token_amount,
            amount_out: sui_out,
            timestamp: tx_context::epoch_timestamp_ms(ctx)
        });
        
        sui_out_coin
    }
} 