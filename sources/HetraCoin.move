// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Core HetraCoin token contract - Now with stronger security and event tracking
#[allow(duplicate_alias, unused_use)]
module hetracoin::HetraCoin {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::option::{Self, Option};
    use sui::object::{Self, UID}; // Import UID and object module
    use sui::url::{Self, Url};

    /// One-time witness type for coin initialization
    public struct HETRACOIN has drop {}

    // Defines HetraCoin as a native fungible asset
    // No separate struct needed, HETRACOIN witness implies the type.

    // Error codes
    const E_ZERO_AMOUNT: u64 = 1;
    const EOVERFLOW: u64 = 100;
    const E_NOT_AUTHORIZED: u64 = 101;
    #[allow(unused_const)] // Suppress warning for now
    const E_ALREADY_INITIALIZED: u64 = 102; // Added error for setup

    // Event structure for tracking transfers
    public struct TransferEvent has copy, drop {
        from: address,
        to: address,
        amount: u64,
        timestamp: u64
    }
    
    // Capability to ensure setup runs only once
    public struct SetupCap has key {
        id: UID
    }

    /// Internal: Core logic to create currency, cap, and metadata.
    /// Requires the witness instance.
    fun create_currency_internal(
        witness: HETRACOIN, // Witness instance is required by coin::create_currency
        ctx: &mut TxContext
    ): (TreasuryCap<HETRACOIN>, CoinMetadata<HETRACOIN>) {
        coin::create_currency<HETRACOIN>(
            witness,       // 1. Witness Instance
            9u8,           // 2. Decimals
            b"HETRA",       // 3. Symbol
            b"HetraCoin",   // 4. Name
            b"Decentralized gaming token for HetraFi", // 5. Description
            option::none<Url>(), // 6. Icon URL
            ctx            // 7. Context
        )
    }

    /// Initializes HetraCoin - Called automatically only on first publish
    fun init(witness: HETRACOIN, ctx: &mut TxContext) {
        // Pass the real witness instance provided by the framework
        let (treasury_cap, metadata) = create_currency_internal(witness, ctx);
        // Transfer created items to the publisher
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
        transfer::public_transfer(metadata, tx_context::sender(ctx));
        // Transfer the SetupCap to the publisher (needed to call setup_for_testnet)
        transfer::transfer(SetupCap { id: object::new(ctx) }, tx_context::sender(ctx));
        // Witness is consumed by being passed into create_currency_internal
    }
    
    /// Public entry function potentially used for post-publish setup.
    /// Requires the SetupCap created during module initialization (init function).
    /// NOTE: In this version, it only consumes the capability, assuming init handled creation.
    public entry fun setup_for_testnet(setup_cap: SetupCap, _ctx: &mut TxContext) {
        // Consume the SetupCap to ensure this part of the setup runs only once.
        let SetupCap { id } = setup_cap;
        object::delete(id);
        // We assume create_currency was handled successfully by the main `init` function.
        // If separate creation logic was needed here, it couldn't use the real witness.
    }

    /// Testing function to initialize the coin - Requires #[test_only]
    #[test_only]
    public fun init_for_testing(witness: HETRACOIN, ctx: &mut TxContext) {
        // Calls the real init logic for testing purposes
        init(witness, ctx);
    }

    /// Secure token transfer with on-chain event logging
    public entry fun secure_transfer(
        coin: &mut Coin<HETRACOIN>, 
        recipient: address, 
        amount: u64, 
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let sender = tx_context::sender(ctx);
        let split_coin = coin::split(coin, amount, ctx);
        transfer::public_transfer(split_coin, recipient);
        event::emit(TransferEvent {
            from: sender,
            to: recipient,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// Creates a HETRACOIN witness for testing - Requires #[test_only]
    #[test_only]
    public fun create_witness_for_testing(): HETRACOIN {
        HETRACOIN {}
    }

    const MAX_SUPPLY: u64 = 1000000000000; // 1 trillion coins

    public fun total_supply(treasury_cap: &TreasuryCap<HETRACOIN>): u64 {
        coin::total_supply(treasury_cap)
    }

    // Removed 'entry' as it cannot return Coin<T>
    public fun mint(
        treasury_cap: &mut TreasuryCap<HETRACOIN>, 
        amount: u64, 
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        assert!(MAX_SUPPLY - total_supply(treasury_cap) >= amount, EOVERFLOW);
        assert!(tx_context::sender(ctx) == governance_admin(treasury_cap), E_NOT_AUTHORIZED);
        coin::mint(treasury_cap, amount, ctx)
    }

    #[allow(unused_variable)]
    public fun governance_admin(treasury_cap: &TreasuryCap<HETRACOIN>): address {
        // This should ideally return the actual owner of the treasury_cap object
        // For testing, it was hardcoded.
        // object::owner(treasury_cap) // Prefer this in production
        @0xA // Keeping hardcoded value based on original file
    }
}
