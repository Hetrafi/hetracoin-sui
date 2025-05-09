// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

/// @title Governance Module
/// @notice Manages HetraCoin minting, burning, and administrative functions
/// @dev Implements governance functionality for the HETRA ecosystem:
///      - Controlled token minting with maximum limits per transaction
///      - Secure token burning with appropriate authorization checks
///      - Two-step governance transfer process to prevent admin mistakes
///      - Event emission for transparency and auditability
///      - Capability-based authorization for enhanced security
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

    /// @notice Maximum tokens that can be minted in a single transaction
    /// @dev Limits risk exposure from any single mint operation
    const MAX_MINT: u64 = 1_000_000_000; // 1 Billion HETRA max per mint

    // Error codes
    /// @notice Error when caller is not authorized for an operation
    const E_NOT_AUTHORIZED: u64 = 1;
    /// @notice Error when mint amount exceeds the per-transaction limit
    const E_EXCEEDS_MAX_MINT: u64 = 2;
    /// @notice Error when trying to accept a transfer meant for another address
    const ENOT_RECIPIENT: u64 = 4;
    /// @notice Error when a governance transfer request has expired
    const EREQUEST_EXPIRED: u64 = 5;
    const E_PAUSED: u64 = 6;
    const E_ZERO_AMOUNT: u64 = 7;

    /// @notice Event emitted when new tokens are minted
    /// @dev Used for tracking token supply increases
    public struct MintEvent has copy, drop {
        /// @notice Address of the authorized minter
        minter: address,
        /// @notice Amount of tokens minted
        amount: u64,
        /// @notice Timestamp of the mint operation
        timestamp: u64
    }

    /// @notice Event emitted when tokens are burned
    /// @dev Used for tracking token supply decreases
    public struct BurnEvent has copy, drop {
        /// @notice Address that initiated the burn
        burner: address,
        /// @notice Amount of tokens burned
        amount: u64,
        /// @notice Timestamp of the burn operation
        timestamp: u64
    }

    // Event for tracking admin transfer
    public struct AdminTransferEvent has copy, drop {
        previous_admin: address,
        new_admin: address,
        timestamp: u64
    }

    // Event for tracking treasury cap transfer
    public struct TreasuryCapTransferEvent has copy, drop {
        from: address,
        to: address,
        timestamp: u64
    }

    /// @notice Capability object that grants governance authority
    /// @dev Used for capability-based authorization of governance actions
    public struct GovernanceCap has key, store {
        id: UID
    }

    /// @notice Changes the admin address in the HetraCoin module
    /// @dev Requires both governance and admin capabilities for authorization
    /// @param treasury_cap Treasury capability of the HETRA token
    /// @param governance_cap Governance capability object
    /// @param registry Admin registry to update
    /// @param admin_cap Admin capability confirming authority
    /// @param new_admin Address of the new administrator
    /// @param ctx Transaction context for authorization
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

    /// @notice Mints new HetraCoin tokens with appropriate authorization
    /// @dev Only callable by the current admin, respects maximum mint limits
    /// @param treasury_cap Treasury capability for minting
    /// @param registry Admin registry for authorization
    /// @param pause_state Emergency pause state to prevent minting when paused
    /// @param amount Amount of tokens to mint
    /// @param ctx Transaction context for authorization and events
    /// @return Newly minted HETRA tokens
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
        
        // Ensure amount is greater than zero
        assert!(amount > 0, E_ZERO_AMOUNT);
        
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

    /// @notice Burns HetraCoin tokens, reducing total supply
    /// @dev Only callable by the current admin
    /// @param treasury_cap Treasury capability for burning
    /// @param registry Admin registry for authorization
    /// @param coin_to_burn Tokens to be permanently removed from circulation
    /// @param ctx Transaction context for authorization and events
    public fun burn(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        registry: &AdminRegistry,
        pause_state: &EmergencyPauseState,
        coin_to_burn: Coin<HETRACOIN>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Check that operations are not paused
        assert!(!pause_state.paused, E_PAUSED);
        
        // Only admin can burn
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        let amount = coin::value(&coin_to_burn);
        
        // Ensure amount is greater than zero
        assert!(amount > 0, E_ZERO_AMOUNT);
        
        coin::burn(treasury_cap, coin_to_burn);

        // Emit on-chain burn event
        event::emit(BurnEvent {
            burner: sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// @notice Initiates the first step of governance transfer
    /// @dev Creates a transfer request that must be accepted by recipient
    /// @param treasury_cap Treasury capability for verification
    /// @param registry Admin registry for authorization
    /// @param new_admin Address of the proposed new administrator
    /// @param ctx Transaction context for authorization
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

    /// @notice Completes the governance transfer process
    /// @dev Second step where new admin accepts responsibility
    /// @param treasury_cap Treasury capability for the admin change
    /// @param transfer_request Transfer request object created in first step
    /// @param registry Admin registry to update
    /// @param admin_cap Admin capability confirming authority
    /// @param ctx Transaction context for authorization and timing
    public fun accept_governance_transfer(
        transfer_request: GovernanceTransferRequest,
        registry: &mut AdminRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == transfer_request.to, ENOT_RECIPIENT);
        
        // Check if the request is still valid (e.g., not expired)
        let current_time = tx_context::epoch_timestamp_ms(ctx);
        assert!(current_time - transfer_request.timestamp < 86400000, EREQUEST_EXPIRED); // 24 hours
        
        // Update admin in the AdminRegistry only - don't need caps for this step
        registry.admin = sender;
        
        // Emit an event to track the admin change for transparency
        event::emit(AdminTransferEvent {
            previous_admin: transfer_request.from,
            new_admin: sender,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Destroy the request
        let GovernanceTransferRequest { id, from: _, to: _, timestamp: _ } = transfer_request;
        object::delete(id);
    }

    /// @notice Request object for the two-step governance transfer
    /// @dev Contains the necessary information for a pending transfer
    public struct GovernanceTransferRequest has key, store {
        id: UID,
        /// @notice Current admin initiating the transfer
        from: address,
        /// @notice Proposed new admin that must accept
        to: address,
        /// @notice Creation timestamp for expiration calculation
        timestamp: u64
    }

    /// @notice Transfers treasury cap to a new administrator
    /// @dev Alternative admin change mechanism
    /// @param treasury_cap Treasury capability to transfer
    /// @param registry Admin registry to update
    /// @param admin_cap Admin capability confirming authority
    /// @param new_admin Address of the new administrator
    /// @param ctx Transaction context for authorization
    public entry fun transfer_treasury_cap(
        treasury_cap: TreasuryCap<HETRACOIN>, 
        admin_cap: AdminCap,
        registry: &AdminRegistry,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        // Verify the current admin is calling this function
        let sender = tx_context::sender(ctx);
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Transfer capabilities to the specified new admin
        transfer::public_transfer(treasury_cap, new_admin);
        transfer::public_transfer(admin_cap, new_admin);
        
        // Emit an event for transparency
        event::emit(TreasuryCapTransferEvent {
            from: sender,
            to: new_admin,
            timestamp: tx_context::epoch(ctx)
        });
    }
    
    // ========== TEST HELPERS ==========
    /// @notice Creates a governance capability for testing
    /// @dev Testing utility function, not used in production
    /// @param ctx Transaction context for object creation
    /// @return GovernanceCap object
    #[test_only]
    public fun create_governance_cap_for_testing(ctx: &mut TxContext): GovernanceCap {
        GovernanceCap { id: object::new(ctx) }
    }

    /// @notice Gets the sender address from a transfer request
    /// @dev Test utility accessor function
    /// @param request The transfer request to inspect
    /// @return Address that initiated the transfer
    #[test_only]
    public fun get_transfer_request_from(request: &GovernanceTransferRequest): address {
        request.from
    }

    /// @notice Gets the recipient address from a transfer request
    /// @dev Test utility accessor function
    /// @param request The transfer request to inspect
    /// @return Intended recipient address
    #[test_only]
    public fun get_transfer_request_to(request: &GovernanceTransferRequest): address {
        request.to
    }

    /// @notice Gets the timestamp from a transfer request
    /// @dev Test utility accessor function
    /// @param request The transfer request to inspect
    /// @return Creation timestamp
    #[test_only]
    public fun get_transfer_request_timestamp(request: &GovernanceTransferRequest): u64 {
        request.timestamp
    }

    /// @notice Creates a test transfer request directly
    /// @dev Test utility to create requests without normal flow
    /// @param from Address initiating the transfer
    /// @param to Intended recipient address
    /// @param timestamp Creation timestamp
    /// @param ctx Transaction context for object creation
    /// @return GovernanceTransferRequest object
    #[test_only]
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

    /// @notice Initiates the first step of treasury cap transfer
    /// @dev Creates a transfer request that must be accepted
    /// @param treasury_cap Treasury capability to transfer
    /// @param registry Admin registry to update
    /// @param new_admin Address of the proposed new administrator
    /// @param ctx Transaction context for authorization
    public entry fun initiate_treasury_cap_transfer(
        treasury_cap: &TreasuryCap<HETRACOIN>,  // Not consumed, just referenced
        registry: &AdminRegistry,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == HetraCoin::governance_admin(registry), E_NOT_AUTHORIZED);
        
        // Create a request that must be accepted
        let transfer_request = TreasuryCapTransferRequest {
            id: object::new(ctx),
            from: sender,
            to: new_admin,
            timestamp: tx_context::epoch_timestamp_ms(ctx)
        };
        
        transfer::transfer(transfer_request, new_admin);
    }

    /// @notice Completes the treasury cap transfer process
    /// @dev Second step where new admin accepts responsibility
    /// @param treasury_cap Treasury capability to transfer
    /// @param admin_cap Admin capability confirming authority
    /// @param registry Admin registry to update
    /// @param transfer_request Transfer request object created in first step
    /// @param ctx Transaction context for authorization and timing
    public entry fun accept_treasury_cap_transfer(
        treasury_cap: TreasuryCap<HETRACOIN>, 
        admin_cap: AdminCap,
        registry: &mut AdminRegistry,
        transfer_request: TreasuryCapTransferRequest,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == transfer_request.to, ENOT_RECIPIENT);
        assert!(tx_context::epoch_timestamp_ms(ctx) - transfer_request.timestamp < 86400000, EREQUEST_EXPIRED);
        
        // Update registry to recognize the new admin
        let previous_admin = registry.admin;
        registry.admin = sender;
        
        // No need to transfer capabilities as they are already owned by the sender
        // who called this function with them as parameters
        
        // Emit event to track the admin change
        event::emit(AdminTransferEvent {
            previous_admin,
            new_admin: sender,
            timestamp: tx_context::epoch(ctx)
        });
        
        // Destroy the request
        let TreasuryCapTransferRequest { id, from: _, to: _, timestamp: _ } = transfer_request;
        object::delete(id);
    }

    /// @notice Request object for the two-step treasury cap transfer
    /// @dev Contains the necessary information for a pending transfer
    public struct TreasuryCapTransferRequest has key, store {
        id: UID,
        /// @notice Current admin initiating the transfer
        from: address,
        /// @notice Proposed new admin that must accept
        to: address,
        /// @notice Creation timestamp for expiration calculation
        timestamp: u64
    }
}