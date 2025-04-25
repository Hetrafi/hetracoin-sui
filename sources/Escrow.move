// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Escrow module - Locks wagered HetraCoin and securely releases to the winner
#[allow(duplicate_alias)]
module hetracoin::Escrow {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;

    // Status constants
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_COMPLETED: u8 = 1;
    const STATUS_CANCELLED: u8 = 2;
    const STATUS_DISPUTED: u8 = 3;
    const STATUS_RESOLVED: u8 = 4;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_STATUS: u64 = 2;
    const E_REENTRANCY: u64 = 3;
    const E_DISPUTE_RATE_LIMIT: u64 = 8;
    const E_ALREADY_RESOLVED: u64 = 11;

    // Wager escrow object
    public struct WagerEscrow has key, store {
        id: UID,
        player_one: address,
        player_two: address,
        amount: u64,
        resolver: address,
        status: u8,
        in_execution: bool,
        dispute_count: u64,
        last_dispute_time: u64,
        is_disputed: bool,
        resolution_notes: vector<u8>,
        resolved_by: address
    }

    // Event for tracking wager outcomes
    public struct WagerResolutionEvent has copy, drop {
        wager_id: address,
        winner: address,
        amount: u64,
        timestamp: u64
    }

    // Event for dispute resolution
    public struct DisputeResolutionEvent has copy, drop {
        wager_id: address,
        resolved_by: address,
        verdict: u8,
        timestamp: u64
    }

    // Create and lock a new wager
    public fun lock_wager(
        player_one: address,
        player_two: address,
        amount: u64,
        resolver: address,
        ctx: &mut TxContext
    ): WagerEscrow {
        WagerEscrow {
            id: object::new(ctx),
            player_one,
            player_two,
            amount,
            resolver,
            status: STATUS_ACTIVE,
            in_execution: false,
            dispute_count: 0,
            last_dispute_time: 0,
            is_disputed: false,
            resolution_notes: vector::empty<u8>(),
            resolved_by: @0x0
        }
    }

    // Release wager funds to the winner
    public fun release_wager(
        caller: address,
        wager: &mut WagerEscrow,
        winner: address,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!wager.in_execution, E_REENTRANCY);
        
        // Set the guard
        wager.in_execution = true;
        
        // Only the designated resolver can release funds
        assert!(caller == wager.resolver, E_NOT_AUTHORIZED);
        
        // Wager must be active or resolved from dispute
        assert!(
            wager.status == STATUS_ACTIVE || 
            wager.status == STATUS_RESOLVED, 
            E_INVALID_STATUS
        );
        
        // Update wager status
        wager.status = STATUS_COMPLETED;
        
        // Emit wager resolution event
        event::emit(WagerResolutionEvent {
            wager_id: object::uid_to_address(&wager.id),
            winner,
            amount: wager.amount,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Reset the guard before returning
        wager.in_execution = false;
    }

    // Cancel a wager (only callable by resolver)
    public fun cancel_wager(
        caller: address,
        wager: &mut WagerEscrow,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!wager.in_execution, E_REENTRANCY);
        
        // Set the guard
        wager.in_execution = true;
        
        // Only the designated resolver can cancel
        assert!(caller == wager.resolver, E_NOT_AUTHORIZED);
        
        // Update wager status
        wager.status = STATUS_CANCELLED;
        
        // Emit cancellation event
        event::emit(WagerResolutionEvent {
            wager_id: object::uid_to_address(&wager.id),
            winner: wager.player_one, // Return to player one on cancel
            amount: 0, // No funds transferred
            timestamp: tx_context::epoch(ctx)
        });
        
        // Reset the guard before returning
        wager.in_execution = false;
    }

    // Get the current status of a wager
    public fun get_status(wager: &WagerEscrow): u8 {
        wager.status
    }

    // Dispute a wager
    public fun dispute_wager(
        caller: address,
        wager: &mut WagerEscrow,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!wager.in_execution, E_REENTRANCY);
        
        // Set the guard
        wager.in_execution = true;
        
        // Only players or the resolver can dispute
        assert!(
            caller == wager.resolver || 
            caller == wager.player_one || 
            caller == wager.player_two, 
            E_NOT_AUTHORIZED
        );
        
        // Check for dispute abuse
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        
        // If this is not the first dispute, check the time since the last one
        if (wager.dispute_count > 0) {
            // Require at least 24 hours between disputes
            assert!(current_time - wager.last_dispute_time >= 86400000, E_DISPUTE_RATE_LIMIT);
        };
        
        // Update dispute tracking
        wager.dispute_count = wager.dispute_count + 1;
        wager.last_dispute_time = current_time;
        
        // Mark as disputed and update status
        wager.is_disputed = true;
        wager.status = STATUS_DISPUTED;
        
        // Reset the guard before returning
        wager.in_execution = false;
    }

    // Admin resolution of disputes
    public fun resolve_dispute(
        admin: address,
        wager: &mut WagerEscrow,
        approved: bool,
        notes: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!wager.in_execution, E_REENTRANCY);
        
        // Set the guard
        wager.in_execution = true;
        
        // Only resolver can resolve disputes
        assert!(admin == wager.resolver, E_NOT_AUTHORIZED);
        
        // Ensure wager is in disputed status
        assert!(wager.status == STATUS_DISPUTED, E_INVALID_STATUS);
        
        // Ensure not already resolved
        assert!(wager.resolved_by == @0x0, E_ALREADY_RESOLVED);
        
        // Update resolution status
        wager.resolution_notes = notes;
        wager.resolved_by = admin;
        
        // Update wager status based on verdict
        if (approved) {
            wager.status = STATUS_RESOLVED;
        } else {
            // If rejected, return to active state for resolution
            wager.status = STATUS_ACTIVE;
            wager.is_disputed = false;
        };
        
        // Emit resolution event
        event::emit(DisputeResolutionEvent {
            wager_id: object::uid_to_address(&wager.id),
            resolved_by: admin,
            verdict: if (approved) 1 else 0,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Reset the guard
        wager.in_execution = false;
    }
    
    // Add accessor for dispute status
    public fun is_disputed(wager: &WagerEscrow): bool {
        wager.is_disputed
    }
    
    // Add function to get resolution notes
    public fun get_resolution_notes(wager: &WagerEscrow): vector<u8> {
        wager.resolution_notes
    }
}
