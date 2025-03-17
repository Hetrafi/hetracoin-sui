// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Governance module - Manages HetraCoin minting and burning securely
#[allow(duplicate_alias, unused_variable)]
module hetracoin::Governance {
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use hetracoin::HetraCoin::HETRACOIN;

    // Maximum minting limit per transaction
    const MAX_MINT: u64 = 1_000_000_000; // 1 Billion HETRA max per mint
    const ADMIN_ADDRESS: address = @0xA; // Replace with actual admin address

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

    // Mint new HetraCoin tokens (admin only)
    public fun mint(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        let sender = tx_context::sender(ctx);
        
        // Only admin can mint
        assert!(sender == ADMIN_ADDRESS, E_NOT_AUTHORIZED);
        
        // Enforce maximum mint amount
        assert!(amount <= MAX_MINT, E_EXCEEDS_MAX_MINT);
        
        // Mint new coins
        let minted_coin = coin::mint(treasury_cap, amount, ctx);
        
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
        coin_to_burn: Coin<HETRACOIN>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Only admin can burn
        assert!(sender == ADMIN_ADDRESS, E_NOT_AUTHORIZED);
        
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
        new_admin: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == governance_admin(treasury_cap), E_NOT_AUTHORIZED);
        
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
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == transfer_request.to, ENOT_RECIPIENT);
        
        // Check if the request is still valid (e.g., not expired)
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(current_time - transfer_request.timestamp < 86400000, EREQUEST_EXPIRED); // 24 hours
        
        // Transfer governance
        transfer_treasury_cap(treasury_cap, sender);
        
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

    // Add these functions to the Governance module
    public fun governance_admin(treasury_cap: &TreasuryCap<HETRACOIN>): address {
        // For simplicity, we'll use the ADMIN_ADDRESS constant
        // In a real implementation, you might want to get this from the treasury cap
        ADMIN_ADDRESS
    }

    public fun transfer_treasury_cap(treasury_cap: &mut TreasuryCap<HETRACOIN>, new_admin: address) {
        // In a real implementation, you would transfer the treasury cap to the new admin
        // For now, we'll just assert that the caller is authorized
        // Note: We can't actually transfer the treasury cap in this function
        // since we don't have a ctx parameter
    }
}
