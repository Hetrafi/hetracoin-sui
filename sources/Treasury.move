// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

/// @title Treasury Module
/// @notice Securely manages HetraFi platform funds with safeguards
/// @dev Implements secure fund management with the following features:
///      - Secure deposit and withdrawal functions
///      - Reentrancy protection for all financial operations
///      - Time-locked withdrawals for enhanced security
///      - Event logging for on-chain transparency
///      - Admin-controlled access to critical operations
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
    /// @notice Error when caller is not authorized for operation
    const E_NOT_AUTHORIZED: u64 = 1;
    /// @notice Error when treasury has insufficient funds for withdrawal
    const E_INSUFFICIENT_FUNDS: u64 = 2;
    /// @notice Error when reentrancy is detected in a function call
    const E_REENTRANCY: u64 = 3;
    /// @notice Error when trying to execute a withdrawal before timelock expires
    const E_TIMELOCK_NOT_EXPIRED: u64 = 4;

    /// @notice Treasury struct that securely stores HETRA tokens
    /// @dev Core storage struct with reentrancy protection
    public struct Treasury has key, store {
        id: UID,
        /// @notice Balance of HETRA tokens held by the treasury
        funds: Balance<HETRACOIN>,
        /// @notice Address of the administrator with withdrawal permissions
        admin: address,
        /// @notice Flag to prevent reentrancy attacks
        in_execution: bool // Reentrancy guard
    }

    /// @notice Event emitted when funds are deposited to the treasury
    /// @dev Used for tracking and auditing purposes
    public struct DepositEvent has copy, drop {
        /// @notice Address that deposited funds
        sender: address,
        /// @notice Amount of tokens deposited
        amount: u64,
        /// @notice Timestamp of the deposit (epoch)
        timestamp: u64
    }
    
    /// @notice Event emitted when funds are withdrawn from the treasury
    /// @dev Used for tracking and auditing purposes
    public struct WithdrawalEvent has copy, drop {
        /// @notice Address that received the withdrawn funds
        recipient: address,
        /// @notice Amount of tokens withdrawn
        amount: u64,
        /// @notice Timestamp of the withdrawal (epoch)
        timestamp: u64
    }

    /// @notice Request object for time-locked withdrawals
    /// @dev Implements a timelock pattern for enhanced security
    public struct WithdrawalRequest has key, store {
        id: UID,
        /// @notice Amount of tokens requested for withdrawal
        amount: u64,
        /// @notice Address that will receive the funds
        recipient: address,
        /// @notice Epoch after which withdrawal can be executed
        expiration_epoch: u64
    }

    /// @notice Event emitted when a withdrawal request is created
    /// @dev Used for tracking pending withdrawals
    public struct WithdrawalRequestedEvent has copy, drop {
        /// @notice Amount of tokens requested for withdrawal
        amount: u64,
        /// @notice Address that will receive the funds
        recipient: address,
        /// @notice Epoch after which withdrawal can be executed
        expiration_epoch: u64
    }

    /// @notice Creates a new treasury with the specified admin
    /// @dev Factory function for treasury creation
    /// @param admin Address that will have administrative control
    /// @param ctx Transaction context for object creation
    /// @return Newly created Treasury object
    public fun create_treasury(admin: address, ctx: &mut TxContext): Treasury {
        Treasury {
            id: object::new(ctx),
            funds: balance::zero<HETRACOIN>(),
            admin,
            in_execution: false
        }
    }

    /// @notice Deposits HETRA tokens into the treasury
    /// @dev Entry function with reentrancy protection
    /// @param treasury The treasury object to deposit into
    /// @param coin_in The HETRA tokens to deposit
    /// @param ctx Transaction context for events
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

    /// @notice Withdraws HETRA tokens from the treasury
    /// @dev Entry function with authorization and reentrancy checks
    /// @param treasury The treasury object to withdraw from
    /// @param amount Amount of tokens to withdraw
    /// @param ctx Transaction context for authorization and events
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

    /// @notice Gets the current balance of the treasury
    /// @dev Accessor function for treasury balance
    /// @param treasury The treasury to check
    /// @return Current HETRA token balance
    public fun get_balance(treasury: &Treasury): u64 {
        balance::value(&treasury.funds)
    }

    /// @notice Creates a time-locked withdrawal request
    /// @dev Implements the first step of two-step withdrawal process
    /// @param treasury The treasury the withdrawal is requested from
    /// @param amount Amount of tokens to withdraw
    /// @param recipient Address that will receive the funds
    /// @param ctx Transaction context for authorization and object creation
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

    /// @notice Executes a time-locked withdrawal after timelock expires
    /// @dev Second step of the two-step withdrawal process
    /// @param treasury The treasury to withdraw from
    /// @param request The withdrawal request object
    /// @param ctx Transaction context for authorization and timing checks
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
    /// @notice Creates a withdrawal request for testing purposes
    /// @dev Test utility to create requests directly without authorization
    /// @param amount Amount of tokens to withdraw
    /// @param recipient Recipient address
    /// @param expiration_epoch Epoch when request becomes executable
    /// @param ctx Transaction context for object creation
    /// @return WithdrawalRequest object
    #[test_only]
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

    /// @notice Gets the amount from a withdrawal request
    /// @dev Test utility accessor function
    /// @param request The withdrawal request to inspect
    /// @return Amount of tokens requested
    #[test_only]
    public fun get_withdrawal_request_amount(request: &WithdrawalRequest): u64 {
        request.amount
    }

    /// @notice Gets the recipient from a withdrawal request
    /// @dev Test utility accessor function
    /// @param request The withdrawal request to inspect
    /// @return Recipient address
    #[test_only]
    public fun get_withdrawal_request_recipient(request: &WithdrawalRequest): address {
        request.recipient
    }

    /// @notice Gets the expiration epoch from a withdrawal request
    /// @dev Test utility accessor function
    /// @param request The withdrawal request to inspect
    /// @return Expiration epoch
    #[test_only]
    public fun get_withdrawal_request_expiration(request: &WithdrawalRequest): u64 {
        request.expiration_epoch
    }

    /// @notice Sets the expiration time for a withdrawal request in tests
    /// @dev Test utility to modify timelock expiration
    /// @param request The withdrawal request to modify
    /// @param expiration New expiration epoch
    #[test_only]
    public fun set_withdrawal_request_expiration_for_testing(request: &mut WithdrawalRequest, expiration: u64) {
        request.expiration_epoch = expiration;
    }

    /// @notice Creates a test treasury with initial funds
    /// @dev Test utility to create pre-funded treasury
    /// @param admin Administrator address for the treasury
    /// @param initial_funds Initial HETRA tokens to fund the treasury
    /// @param ctx Transaction context for object creation
    /// @return Pre-funded Treasury object
    #[test_only]
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

    /// @notice Sets the reentrancy flag for testing purposes
    /// @dev Test utility to simulate reentrancy conditions
    /// @param treasury The treasury to modify
    /// @param flag New value for the reentrancy flag
    #[test_only]
    public fun set_reentrancy_flag_for_testing(treasury: &mut Treasury, flag: bool) {
        treasury.in_execution = flag;
    }
}