// Escrow module - Locks wagered HetraCoin and securely releases to the winner
module hetracoin::Escrow {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;

    // Status constants
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_COMPLETED: u8 = 1;
    const STATUS_CANCELLED: u8 = 2;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_STATUS: u64 = 2;

    // Wager escrow object
    public struct WagerEscrow has key, store {
        id: UID,
        player_one: address,
        player_two: address,
        amount: u64,
        resolver: address,
        status: u8
    }

    // Event for tracking wager outcomes
    public struct WagerResolutionEvent has copy, drop {
        wager_id: address,
        winner: address,
        amount: u64,
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
            status: STATUS_ACTIVE
        }
    }

    // Release wager funds to the winner
    public fun release_wager(
        caller: address,
        wager: &mut WagerEscrow,
        winner: address,
        ctx: &mut TxContext
    ) {
        // Only the designated resolver can release funds
        assert!(caller == wager.resolver, E_NOT_AUTHORIZED);
        
        // Wager must be active
        assert!(wager.status == STATUS_ACTIVE, E_INVALID_STATUS);
        
        // Update wager status
        wager.status = STATUS_COMPLETED;
        
        // Emit wager resolution event
        event::emit(WagerResolutionEvent {
            wager_id: object::uid_to_address(&wager.id),
            winner,
            amount: wager.amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    // Cancel a wager (only callable by resolver)
    public fun cancel_wager(
        caller: address,
        wager: &mut WagerEscrow,
        ctx: &mut TxContext
    ) {
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
    }

    // Get the current status of a wager
    public fun get_status(wager: &WagerEscrow): u8 {
        wager.status
    }
}
