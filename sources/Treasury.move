// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Treasury module - Securely manages HetraFi platform funds
#[allow(duplicate_alias, unused_use)]
module hetracoin::Treasury {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use hetracoin::HetraCoin::HETRACOIN;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INSUFFICIENT_FUNDS: u64 = 2;
    const E_REENTRANCY: u64 = 3;

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
}
