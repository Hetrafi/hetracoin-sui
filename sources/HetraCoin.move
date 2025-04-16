// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Core HetraCoin token contract - Now with stronger security and event tracking
#[allow(duplicate_alias, unused_use)]
module hetracoin::HetraCoin {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::option;
    use sui::url;

    /// One-time witness type for coin initialization
    public struct HETRACOIN has drop {}

    // Defines HetraCoin as a native fungible asset
    public struct HetraCoin has drop {}

    // Error codes
    const E_ZERO_AMOUNT: u64 = 1;
    const EOVERFLOW: u64 = 100;
    const E_NOT_AUTHORIZED: u64 = 101;

    // Event structure for tracking transfers
    public struct TransferEvent has copy, drop {
        from: address,
        to: address,
        amount: u64,
        timestamp: u64
    }

    /// Initializes HetraCoin as a registered Sui-native asset
    fun init(witness: HETRACOIN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9, // 9 decimals
            b"HETRA",
            b"HetraCoin",
            b"Decentralized gaming token for HetraFi",
            option::none(),
            ctx
        );

        // Transfer treasury cap to module publisher
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(metadata, tx_context::sender(ctx));
    }

    /// Testing function to initialize the coin
    #[test_only]
    public fun init_for_testing(witness: HETRACOIN, ctx: &mut TxContext) {
        init(witness, ctx);
    }

    /// Secure token transfer with on-chain event logging
    public entry fun secure_transfer(
        coin: &mut Coin<HETRACOIN>, 
        recipient: address, 
        amount: u64, 
        ctx: &mut TxContext
    ) {
        // Add a check for zero amount
        assert!(amount > 0, E_ZERO_AMOUNT);
        
        let sender = tx_context::sender(ctx);
        let split_coin = coin::split(coin, amount, ctx);
        transfer::public_transfer(split_coin, recipient);

        // Emit a transparent on-chain event
        event::emit(TransferEvent {
            from: sender,
            to: recipient,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// Creates a HETRACOIN witness for testing
    #[test_only]
    public fun create_witness_for_testing(): HETRACOIN {
        HETRACOIN {}
    }

    // Add a constant for maximum supply
    const MAX_SUPPLY: u64 = 1000000000000; // 1 trillion coins

    // Get the current total supply of HetraCoin
    public fun total_supply(treasury_cap: &TreasuryCap<HETRACOIN>): u64 {
        coin::total_supply(treasury_cap)
    }

    public fun mint(treasury_cap: &mut TreasuryCap<HETRACOIN>, amount: u64, ctx: &mut TxContext): Coin<HETRACOIN> {
        // Check for potential overflow
        assert!(MAX_SUPPLY - total_supply(treasury_cap) >= amount, EOVERFLOW);
        
        // Add explicit authorization check
        assert!(tx_context::sender(ctx) == governance_admin(treasury_cap), E_NOT_AUTHORIZED);
        
        // Proceed with minting
        coin::mint(treasury_cap, amount, ctx)
    }

    // Helper function to get the admin
    public fun governance_admin(treasury_cap: &TreasuryCap<HETRACOIN>): address {
        // Get the owner of the treasury cap
        let cap_owner = coin::treasury_cap_owner(treasury_cap);
        
        // If the treasury cap has an owner (is not shared), return that address
        if (option::is_some(&cap_owner)) {
            option::destroy_some(cap_owner)
        } else {
            // If the treasury cap is shared, return a default admin address
            // In a production system, this should be properly configured
            @0x5a65726f5f6f6e655f636f6d6573 // Replace with a proper admin address
        }
    }
}
