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

    // Stores the treasury address for collecting fees
    public struct Hetrafi has key {
        id: UID,
        treasury: address,
    }

    // 5% HetraFi fee configuration
    const HETRAFI_FEE_PERCENT: u64 = 500;
    const FEE_DENOMINATOR: u64 = 10_000;

    // Create a new Hetrafi instance
    public fun create(treasury: address, ctx: &mut TxContext) {
        let hetrafi = Hetrafi {
            id: object::new(ctx),
            treasury
        };
        transfer::share_object(hetrafi);
    }

    // Transfers HetraCoin with automatic 5% fee deduction
    public fun transfer_with_fee(
        _hetrafi: &Hetrafi,
        mut coin_in: Coin<HETRACOIN>, 
        _recipient: address,
        ctx: &mut TxContext
    ): (Coin<HETRACOIN>, Coin<HETRACOIN>) {
        let amount = coin::value(&coin_in);
        let fee_amount = (amount * HETRAFI_FEE_PERCENT) / FEE_DENOMINATOR;
        
        let fee_coin = coin::split(&mut coin_in, fee_amount, ctx);
        
        // Return the remaining coin for the recipient and the fee coin
        (coin_in, fee_coin)
    }
}
