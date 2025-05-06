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
    const E_PAUSED: u64 = 91;
    const E_NOT_PAUSED: u64 = 92;

    // Event structure for tracking transfers
    public struct TransferEvent has copy, drop {
        from: address,
        to: address,
        amount: u64,
        timestamp: u64
    }
    
    // Event for admin changes
    public struct AdminChangeEvent has copy, drop {
        previous_admin: address,
        new_admin: address,
        timestamp: u64
    }
    
    // Capability to ensure setup runs only once
    public struct SetupCap has key {
        id: UID
    }

    // Admin capability - only the admin has this
    public struct AdminCap has key, store {
        id: UID
    }

    // Registry to track the current admin address
    public struct AdminRegistry has key, store {
        id: UID,
        admin: address
    }

    /// Emergency pause capability for critical operations
    public struct EmergencyPauseState has key, store {
        id: UID,
        paused: bool,
        pause_reason: vector<u8>,
        paused_at: u64,
        paused_by: address,
        last_updated: u64
    }

    // Event for pause state changes
    public struct EmergencyPauseEvent has copy, drop {
        paused: bool,
        reason: vector<u8>,
        timestamp: u64,
        admin: address
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
        
        let admin = tx_context::sender(ctx);
        
        // Create admin capability and registry
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };
        
        let admin_registry = AdminRegistry {
            id: object::new(ctx),
            admin
        };
        
        // Transfer created items to the publisher
        transfer::public_transfer(treasury_cap, admin);
        transfer::public_transfer(metadata, admin);
        transfer::public_transfer(admin_cap, admin);
        transfer::share_object(admin_registry);
        
        // Transfer the SetupCap to the publisher (needed to call setup_for_testnet)
        transfer::transfer(SetupCap { id: object::new(ctx) }, admin);
        // Witness is consumed by being passed into create_currency_internal
        
        // Initialize the pause state
        init_pause_state(ctx);
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
        pause_state: &EmergencyPauseState,
        ctx: &mut TxContext
    ) {
        // Check that operations are not paused
        assert!(!pause_state.paused, E_PAUSED);

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

    /// Creates and shares the EmergencyPauseState during initialization
    fun init_pause_state(ctx: &mut TxContext) {
        let pause_state = EmergencyPauseState {
            id: object::new(ctx),
            paused: false,
            pause_reason: b"",
            paused_at: 0,
            paused_by: @0x0,
            last_updated: tx_context::epoch(ctx)
        };
        
        transfer::share_object(pause_state);
    }
    
    /// Pause critical operations (admin only)
    public fun pause_operations(
        registry: &AdminRegistry, 
        pause_state: &mut EmergencyPauseState,
        reason: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Only admin can pause operations
        assert!(tx_context::sender(ctx) == governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Verify system is not already paused
        assert!(!pause_state.paused, E_NOT_PAUSED);
        
        // Update pause state
        pause_state.paused = true;
        pause_state.pause_reason = reason;
        pause_state.paused_at = tx_context::epoch(ctx);
        pause_state.paused_by = tx_context::sender(ctx);
        pause_state.last_updated = tx_context::epoch(ctx);
        
        // Emit pause event for transparency
        event::emit(EmergencyPauseEvent {
            paused: true,
            reason,
            timestamp: tx_context::epoch(ctx),
            admin: tx_context::sender(ctx)
        });
    }
    
    /// Unpause operations (admin only)
    public fun unpause_operations(
        registry: &AdminRegistry, 
        pause_state: &mut EmergencyPauseState,
        ctx: &mut TxContext
    ) {
        // Only admin can unpause operations
        assert!(tx_context::sender(ctx) == governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Verify system is paused
        assert!(pause_state.paused, E_PAUSED);
        
        // Update pause state
        pause_state.paused = false;
        pause_state.last_updated = tx_context::epoch(ctx);
        
        // Emit unpause event for transparency
        event::emit(EmergencyPauseEvent {
            paused: false,
            reason: b"Operations resumed",
            timestamp: tx_context::epoch(ctx),
            admin: tx_context::sender(ctx)
        });
    }
    
    /// Check if operations are paused
    public fun is_paused(pause_state: &EmergencyPauseState): bool {
        pause_state.paused
    }
    
    /// Get pause reason
    public fun pause_reason(pause_state: &EmergencyPauseState): vector<u8> {
        pause_state.pause_reason
    }

    /// Mint new HetraCoin with pause check
    public fun mint(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        amount: u64,
        registry: &AdminRegistry,
        pause_state: &EmergencyPauseState,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        // Check that operations are not paused
        assert!(!pause_state.paused, E_PAUSED);
        
        assert!(MAX_SUPPLY - total_supply(treasury_cap) >= amount, EOVERFLOW);
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        coin::mint(treasury_cap, amount, ctx)
    }

    // Get the current governance admin from the AdminRegistry
    public fun governance_admin(registry: &AdminRegistry): address {
        registry.admin
    }

    // Change the admin - requires admin capability
    public fun change_admin(
        _treasury_cap: &TreasuryCap<HETRACOIN>, 
        _admin_cap: &AdminCap,
        registry: &mut AdminRegistry,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_admin = registry.admin;
        
        // Authorization check - only current admin with admin cap can change admin
        assert!(sender == current_admin, E_NOT_AUTHORIZED);
        
        // Update the admin in the registry
        registry.admin = new_admin;
        
        // Emit an event to track the admin change
        event::emit(AdminChangeEvent {
            previous_admin: current_admin,
            new_admin,
            timestamp: tx_context::epoch(ctx)
        });
    }

    // Set admin for testing purposes
    #[test_only]
    public fun set_admin_for_testing(registry: &mut AdminRegistry, admin: address) {
        registry.admin = admin;
    }
    
    // Create AdminCap for testing
    #[test_only]
    public fun create_admin_cap_for_testing(ctx: &mut TxContext): AdminCap {
        AdminCap { id: object::new(ctx) }
    }
    
    // Create AdminRegistry for testing
    #[test_only]
    public fun create_admin_registry_for_testing(admin: address, ctx: &mut TxContext): AdminRegistry {
        AdminRegistry { 
            id: object::new(ctx),
            admin
        }
    }

    #[test_only]
    /// Create pause state for testing
    public fun create_pause_state_for_testing(ctx: &mut TxContext) {
        init_pause_state(ctx);
    }
}
