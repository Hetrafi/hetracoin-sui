// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Marketplace module - Handles automatic 5% fee deductions
#[allow(duplicate_alias)]
module hetracoin::Hetrafi {
    use sui::object::{Self, UID};
    use sui::tx_context::TxContext;
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use hetracoin::HetraCoin::HETRACOIN;

    // Error codes
    const E_REENTRANCY: u64 = 1;
    const E_ZERO_AMOUNT: u64 = 2;

    // Stores the treasury address for collecting fees
    public struct Hetrafi has key {
        id: UID,
        treasury: address,
        in_execution: bool, // Reentrancy guard
    }

    // 5% HetraFi fee configuration
    const HETRAFI_FEE_PERCENT: u64 = 500;
    const FEE_DENOMINATOR: u64 = 10_000;

    // Create a new Hetrafi instance
    public fun create(treasury: address, ctx: &mut TxContext) {
        let hetrafi = Hetrafi {
            id: object::new(ctx),
            treasury,
            in_execution: false
        };
        transfer::share_object(hetrafi);
    }

    // Transfers HetraCoin with automatic 5% fee deduction
    public fun transfer_with_fee(
        hetrafi: &mut Hetrafi,
        mut coin_in: Coin<HETRACOIN>, 
        _recipient: address,  // Add underscore to indicate unused parameter
        ctx: &mut TxContext
    ): (Coin<HETRACOIN>, Coin<HETRACOIN>) {
        // Check for reentrancy
        assert!(!hetrafi.in_execution, E_REENTRANCY);
        
        // Set the guard
        hetrafi.in_execution = true;
        
        // Validate the coin is not zero
        let amount = coin::value(&coin_in);
        assert!(amount > 0, E_ZERO_AMOUNT);
        
        // Calculate fee
        let fee_amount = (amount * HETRAFI_FEE_PERCENT) / FEE_DENOMINATOR;
        
        // Split the fee
        let fee_coin = coin::split(&mut coin_in, fee_amount, ctx);
        
        // Reset the guard before returning
        hetrafi.in_execution = false;
        
        // Return the remaining coin for the recipient and the fee coin
        (coin_in, fee_coin)
    }
}
