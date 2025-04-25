// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Treasury module - Securely manages HetraFi platform funds
#[allow(duplicate_alias, unused_use)]
module hetracoin::Treasury {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use sui::transfer;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INSUFFICIENT_FUNDS: u64 = 2;
    const E_REENTRANCY: u64 = 3;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 4;

    // Treasury struct storing funds
    public struct Treasury has key, store {
        id: UID,
        funds: Balance<HETRACOIN>,
        admin: address,
        in_execution: bool // Reentrancy guard
    }

    // Event logging for deposits and withdrawals
    public struct DepositEvent has copy, drop {
        sender: address,
        amount: u64,
        timestamp: u64
    }
    
    public struct WithdrawalEvent has copy, drop {
        recipient: address,
        amount: u64,
        timestamp: u64
    }

    // Add timelock functionality
    public struct WithdrawalRequest has key, store {
        id: UID,
        amount: u64,
        recipient: address,
        expiration_epoch: u64
    }

    // Define the missing event
    public struct WithdrawalRequestedEvent has copy, drop {
        amount: u64,
        recipient: address,
        expiration_epoch: u64
    }

    // Create a new treasury
    public fun create_treasury(admin: address, ctx: &mut TxContext): Treasury {
        Treasury {
            id: object::new(ctx),
            funds: balance::zero<HETRACOIN>(),
            admin,
            in_execution: false
        }
    }

    // Deposit funds into treasury
    public entry fun deposit(
        treasury: &mut Treasury, 
        coin_in: Coin<HETRACOIN>, 
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!treasury.in_execution, E_REENTRANCY);
        
        // Set the guard
        treasury.in_execution = true;
        
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&coin_in);
        
        // Add funds to treasury by extracting the balance from the coin
        let coin_balance = coin::into_balance(coin_in);
        balance::join(&mut treasury.funds, coin_balance);

        event::emit(DepositEvent {
            sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Reset the guard
        treasury.in_execution = false;
    }

    // Allows withdrawal (only authorized accounts)
    public entry fun withdraw(
        treasury: &mut Treasury, 
        amount: u64, 
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!treasury.in_execution, E_REENTRANCY);
        
        // Set the guard
        treasury.in_execution = true;
        
        let sender = tx_context::sender(ctx);
        assert!(sender == treasury.admin, E_NOT_AUTHORIZED); // Only treasury admin can withdraw
        assert!(balance::value(&treasury.funds) >= amount, E_INSUFFICIENT_FUNDS); // Prevent over-withdrawals

        // Create a coin from the treasury balance and transfer it to the sender
        let withdrawn_balance = balance::split(&mut treasury.funds, amount);
        let withdrawn_coin = coin::from_balance(withdrawn_balance, ctx);
        transfer::public_transfer(withdrawn_coin, sender);

        event::emit(WithdrawalEvent {
            recipient: sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Reset the guard
        treasury.in_execution = false;
    }

    // Get the current treasury balance
    public fun get_balance(treasury: &Treasury): u64 {
        balance::value(&treasury.funds)
    }

    // Two-step withdrawal with timelock
    public entry fun request_withdrawal(
        treasury: &mut Treasury, 
        amount: u64, 
        recipient: address,
        ctx: &mut TxContext
    ) {
        // Authorization check
        assert!(tx_context::sender(ctx) == treasury.admin, E_NOT_AUTHORIZED);
        
        // Create withdrawal request with 1-hour timelock
        let expiration = tx_context::epoch(ctx) + 60; // ~1 hour at 1 min epochs
        let request = WithdrawalRequest {
            id: object::new(ctx),
            amount,
            recipient,
            expiration_epoch: expiration
        };
        
        // Transfer request to admin
        transfer::transfer(request, tx_context::sender(ctx));
        
        // Emit event for transparency
        event::emit(WithdrawalRequestedEvent { 
            amount,
            recipient,
            expiration_epoch: expiration
        });
    }

    // Execute after timelock expires
    public entry fun execute_withdrawal(
        treasury: &mut Treasury,
        request: WithdrawalRequest,
        ctx: &mut TxContext
    ) {
        // Verify timelock has passed
        assert!(tx_context::epoch(ctx) >= request.expiration_epoch, E_TIMELOCK_NOT_EXPIRED);
        
        // Execute withdrawal logic
        withdraw(treasury, request.amount, ctx);
        
        // Destroy the request
        let WithdrawalRequest { id, amount: _, recipient: _, expiration_epoch: _ } = request;
        object::delete(id);
    }

    // ========== TEST HELPERS ==========
    #[test_only]
    /// Helper for tests: Create a WithdrawalRequest directly
    public fun create_test_withdrawal_request(
        amount: u64,
        recipient: address,
        expiration_epoch: u64,
        ctx: &mut TxContext
    ): WithdrawalRequest {
        WithdrawalRequest {
            id: object::new(ctx),
            amount,
            recipient,
            expiration_epoch
        }
    }

    #[test_only]
    /// Accessor for WithdrawalRequest amount field (for testing)
    public fun get_withdrawal_request_amount(request: &WithdrawalRequest): u64 {
        request.amount
    }

    #[test_only]
    /// Accessor for WithdrawalRequest recipient field (for testing)
    public fun get_withdrawal_request_recipient(request: &WithdrawalRequest): address {
        request.recipient
    }

    #[test_only]
    /// Accessor for WithdrawalRequest expiration field (for testing)
    public fun get_withdrawal_request_expiration(request: &WithdrawalRequest): u64 {
        request.expiration_epoch
    }

    #[test_only]
    /// Mock the timelock for testing by setting a specific expiration
    public fun set_withdrawal_request_expiration_for_testing(request: &mut WithdrawalRequest, expiration: u64) {
        request.expiration_epoch = expiration;
    }

    #[test_only]
    /// Create a test treasury with initial funds
    public fun create_test_treasury_with_funds(
        admin: address,
        initial_funds: Coin<HETRACOIN>,
        ctx: &mut TxContext
    ): Treasury {
        let mut treasury = create_treasury(admin, ctx);
        let funds = coin::into_balance(initial_funds);
        balance::join(&mut treasury.funds, funds);
        treasury
    }
}
