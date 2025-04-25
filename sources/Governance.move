// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Governance module - Manages HetraCoin minting and burning securely
#[allow(duplicate_alias, unused_variable, unused_use)]
module hetracoin::Governance {
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::object::{Self, UID};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminRegistry, AdminCap, EmergencyPauseState};
    
    #[test_only]
    use sui::test_scenario;

    // Maximum minting limit per transaction
    const MAX_MINT: u64 = 1_000_000_000; // 1 Billion HETRA max per mint

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_EXCEEDS_MAX_MINT: u64 = 2;
    const ENOT_RECIPIENT: u64 = 4;
    const EREQUEST_EXPIRED: u64 = 5;

    // Event for tracking minting
    public struct MintEvent has copy, drop {
        minter: address,
        amount: u64,
        timestamp: u64
    }

    // Event for tracking burning
    public struct BurnEvent has copy, drop {
        burner: address,
        amount: u64,
        timestamp: u64
    }

    // Add this capability for authorized governance
    public struct GovernanceCap has key, store {
        id: UID
    }

    // Use capability-based authorization
    public entry fun change_admin(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        governance_cap: &GovernanceCap, 
        registry: &mut AdminRegistry,
        admin_cap: &AdminCap,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        // Only the original admin can perform this operation
        let sender = tx_context::sender(ctx);
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Use the HetraCoin module to change the admin
        HetraCoin::change_admin(treasury_cap, admin_cap, registry, new_admin, ctx);
    }

    // Mint new HetraCoin tokens (admin only)
    public fun mint(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        registry: &AdminRegistry,
        pause_state: &EmergencyPauseState,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        let sender = tx_context::sender(ctx);
        
        // Only admin can mint
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Enforce maximum mint amount
        assert!(amount <= MAX_MINT, E_EXCEEDS_MAX_MINT);
        
        // Mint new coins with pause check
        let minted_coin = HetraCoin::mint(treasury_cap, amount, registry, pause_state, ctx);
        
        // Emit on-chain mint event
        event::emit(MintEvent {
            minter: sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
        
        minted_coin
    }

    // Burn HetraCoin tokens (admin only)
    public fun burn(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        registry: &AdminRegistry,
        coin_to_burn: Coin<HETRACOIN>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Only admin can burn
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        let amount = coin::value(&coin_to_burn);
        coin::burn(treasury_cap, coin_to_burn);

        // Emit on-chain burn event
        event::emit(BurnEvent {
            burner: sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    // Add a two-step transfer process
    public fun initiate_governance_transfer(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        registry: &AdminRegistry,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Create a transfer request that the new admin must accept
        let transfer_request = GovernanceTransferRequest {
            id: object::new(ctx),
            from: sender,
            to: new_admin,
            timestamp: tx_context::epoch_timestamp_ms(ctx)
        };
        
        transfer::transfer(transfer_request, new_admin);
    }

    // New admin must explicitly accept the transfer
    public fun accept_governance_transfer(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        transfer_request: GovernanceTransferRequest,
        registry: &mut AdminRegistry,
        admin_cap: &AdminCap,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == transfer_request.to, ENOT_RECIPIENT);
        
        // Check if the request is still valid (e.g., not expired)
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(current_time - transfer_request.timestamp < 86400000, EREQUEST_EXPIRED); // 24 hours
        
        // Transfer governance by updating admin in the AdminRegistry
        HetraCoin::change_admin(treasury_cap, admin_cap, registry, sender, ctx);
        
        // Destroy the request
        let GovernanceTransferRequest { id, from: _, to: _, timestamp: _ } = transfer_request;
        object::delete(id);
    }

    // New struct for transfer requests
    public struct GovernanceTransferRequest has key, store {
        id: UID,
        from: address,
        to: address,
        timestamp: u64
    }

    // Transfer the treasury cap to the new admin
    public fun transfer_treasury_cap(
        treasury_cap: &mut TreasuryCap<HETRACOIN>, 
        registry: &mut AdminRegistry,
        admin_cap: &AdminCap,
        new_admin: address, 
        ctx: &mut TxContext
    ) {
        // In a real implementation with a shared TreasuryCap, you would implement the transfer here
        // For this example, we just verify the current admin is calling this function
        let sender = tx_context::sender(ctx);
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Update the admin in the AdminRegistry
        HetraCoin::change_admin(treasury_cap, admin_cap, registry, new_admin, ctx);
    }
    
    // ========== TEST HELPERS ==========
    #[test_only]
    /// Create a GovernanceCap for testing
    public fun create_governance_cap_for_testing(ctx: &mut TxContext): GovernanceCap {
        GovernanceCap { id: object::new(ctx) }
    }

    #[test_only]
    /// Accessor for GovernanceTransferRequest from field (for testing)
    public fun get_transfer_request_from(request: &GovernanceTransferRequest): address {
        request.from
    }

    #[test_only]
    /// Accessor for GovernanceTransferRequest to field (for testing)
    public fun get_transfer_request_to(request: &GovernanceTransferRequest): address {
        request.to
    }

    #[test_only]
    /// Accessor for GovernanceTransferRequest timestamp field (for testing)
    public fun get_transfer_request_timestamp(request: &GovernanceTransferRequest): u64 {
        request.timestamp
    }

    #[test_only]
    /// Create a test transfer request directly (for testing)
    public fun create_test_transfer_request(
        from: address,
        to: address,
        timestamp: u64,
        ctx: &mut TxContext
    ): GovernanceTransferRequest {
        GovernanceTransferRequest {
            id: object::new(ctx),
            from,
            to,
            timestamp
        }
    }
}
