// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

/// @title HetraCoin Token Module
/// @notice Core implementation of the HETRA token on the Sui blockchain
/// @dev This module implements the HETRA token with the following features:
///      - One-time initialization with fixed decimals (9 decimals)
///      - Administrative controls for minting and burning with safety checks
///      - Two-step admin transfer process for enhanced security
///      - Emergency pause mechanism to protect against critical issues
///      - Comprehensive event emission for on-chain transparency and tracking
///      - Maximum supply cap of 1 trillion tokens
#[allow(duplicate_alias, unused_use)]
module hetracoin::HetraCoin {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::option::{Self, Option};
    use sui::object::{Self, UID}; // Import UID and object module
    use sui::url::{Self, Url};
    use sui::package;

    /// @notice One-time witness for HETRACOIN token creation
    /// @dev Used in the init function to create the token. The witness pattern
    ///      ensures the token can only be created once during module publication.
    public struct HETRACOIN has drop {}

    // Defines HetraCoin as a native fungible asset
    // No separate struct needed, HETRACOIN witness implies the type.

    // Error codes
    /// @notice Error when amount is zero
    const E_ZERO_AMOUNT: u64 = 1;
    /// @notice Error when caller is not authorized for an operation
    const E_NOT_AUTHORIZED: u64 = 101;
    #[allow(unused_const)] // Suppress warning for now
    /// @notice Error when trying to initialize already initialized state
    const E_ALREADY_INITIALIZED: u64 = 102; // Added error for setup
    /// @notice Error when system is in paused state and operation is not allowed
    const E_SYSTEM_PAUSED: u64 = 104; 
    #[allow(unused_const)]
    /// @notice Error when trying to unpause a system that is not paused
    const E_NOT_PAUSED: u64 = 105; 
    /// @notice Error when attempting to exceed maximum token supply
    const E_MAX_SUPPLY_EXCEEDED: u64 = 106; 

    /// @notice Event structure for tracking HETRA token transfers
    /// @dev Emitted whenever tokens are transferred between addresses
    public struct TransferEvent has copy, drop {
        /// @notice Sender address
        from: address,
        /// @notice Recipient address
        to: address,
        /// @notice Amount of tokens transferred
        amount: u64,
        /// @notice Timestamp of the transfer (epoch)
        timestamp: u64
    }
    
    /// @notice Event for tracking administrative changes
    /// @dev Emitted when the admin address is changed
    public struct AdminChangeEvent has copy, drop {
        /// @notice Previous admin address
        previous_admin: address,
        /// @notice New admin address
        new_admin: address,
        /// @notice Timestamp of the change (epoch)
        timestamp: u64
    }
    
    /// @notice Capability to ensure setup runs only once
    /// @dev Created during initialization and consumed during setup
    public struct SetupCap has key {
        id: UID
    }

    /// @notice Capability object that grants administrative privileges
    /// @dev Possession of this object is required for admin operations
    ///      This capability follows the object-capability pattern for security
    public struct AdminCap has key, store {
        id: UID
    }

    /// @notice Registry that tracks the current administrator address
    /// @dev Shared object containing the admin address for the protocol
    ///      Acts as a governance record visible to all network participants
    public struct AdminRegistry has key, store {
        id: UID,
        /// @notice Address of the current administrator
        admin: address
    }

    /// @notice State object that tracks whether the system is in emergency pause mode
    /// @dev When paused, various operations like minting are restricted
    ///      Provides safeguard against potential vulnerabilities or attacks
    public struct EmergencyPauseState has key, store {
        id: UID,
        /// @notice Whether the system is currently paused
        paused: bool,
        /// @notice Reason for the system being paused
        pause_reason: vector<u8>,
        /// @notice Timestamp when system was paused
        paused_at: u64,
        /// @notice Address that initiated the pause
        paused_by: address,
        /// @notice Last time the pause state was updated
        last_updated: u64
    }

    /// @notice Event emitted when emergency pause state changes
    /// @dev Useful for indexers and off-chain services to monitor system state
    public struct EmergencyPauseEvent has copy, drop {
        /// @notice New pause state (true = paused, false = active)
        paused: bool,
        /// @notice Administrator who changed the state
        admin: address,
        /// @notice Timestamp of the change (epoch)
        timestamp: u64
    }

    /// @notice Maximum total supply for the HETRA token (1 billion with 9 decimals)
    /// @dev Used to ensure the supply never exceeds this amount
    ///      Provides economic predictability for the token ecosystem
    const MAX_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1 billion tokens with 9 decimals

    /// @notice Internal: Core logic to create currency, cap, and metadata
    /// @dev Requires the witness instance to ensure single initialization
    /// @param witness The one-time HETRACOIN witness instance
    /// @param ctx Transaction context for obtaining sender and creating objects
    /// @return Tuple containing treasury cap and coin metadata
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
            option::some(url::new_unsafe_from_bytes(b"https://cyan-careful-badger-476.mypinata.cloud/ipfs/bafkreic3li5r3gt3wqrbkepq23ru5nckeoxfpbzelondeix3usfdvqmbii")), // 6. Icon URL
            ctx            // 7. Context
        )
    }

    /// @notice Initializes the HetraCoin module and creates the HETRACOIN token
    /// @dev Called once during deployment to set up the token and administrative objects
    /// @param witness One-time witness for token initialization
    /// @param ctx Transaction context
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
        
        // Create EmergencyPauseState (initially not paused)
        let pause_state = EmergencyPauseState {
            id: object::new(ctx),
            paused: false,
            pause_reason: b"",
            paused_at: 0,
            paused_by: @0x0,
            last_updated: tx_context::epoch(ctx)
        };
        
        // Transfer created items to the publisher
        transfer::public_transfer(treasury_cap, admin);
        transfer::public_transfer(metadata, admin);
        transfer::public_transfer(admin_cap, admin);
        transfer::share_object(admin_registry);
        transfer::share_object(pause_state);
        
        // Transfer the SetupCap to the publisher (needed to call setup_for_testnet)
        transfer::transfer(SetupCap { id: object::new(ctx) }, admin);
        // Witness is consumed by being passed into create_currency_internal
    }
    
    /// @notice Public entry function potentially used for post-publish setup
    /// @dev Requires the SetupCap created during module initialization
    /// @param setup_cap The setup capability that ensures this runs only once
    /// @param _ctx Transaction context for obtaining sender info
    public entry fun setup_for_testnet(setup_cap: SetupCap, _ctx: &mut TxContext) {
        // Consume the SetupCap to ensure this part of the setup runs only once.
        let SetupCap { id } = setup_cap;
        object::delete(id);
        // We assume create_currency was handled successfully by the main `init` function.
        // If separate creation logic was needed here, it couldn't use the real witness.
    }

    /// @notice Testing function to initialize the coin
    /// @dev For test environments only, not used in production
    /// @param witness HETRACOIN witness for initialization
    /// @param ctx Transaction context
    #[test_only]
    public fun init_for_testing(witness: HETRACOIN, ctx: &mut TxContext) {
        // Calls the real init logic for testing purposes
        init(witness, ctx);
    }

    /// @notice Secure token transfer with on-chain event logging
    /// @dev Public entry point for transferring HETRA tokens with event emission
    /// @param coin The coin object containing tokens to transfer
    /// @param recipient Address of the recipient
    /// @param amount Amount of tokens to transfer
    /// @param ctx Transaction context for authorization and event data
    public entry fun secure_transfer(
        coin: &mut Coin<HETRACOIN>, 
        recipient: address, 
        amount: u64, 
        pause_state: &EmergencyPauseState,
        ctx: &mut TxContext
    ) {
        // Check that operations are not paused
        assert!(!pause_state.paused, E_SYSTEM_PAUSED);

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

    /// @notice Creates a HETRACOIN witness for testing purposes
    /// @dev Only available in testing environments
    /// @return A new HETRACOIN witness instance
    #[test_only]
    public fun create_witness_for_testing(): HETRACOIN {
        HETRACOIN {}
    }

    /// @notice Gets the total supply of HETRA tokens
    /// @dev Wrapper around the coin module's total_supply function
    /// @param treasury_cap The treasury capability
    /// @return Current total supply
    public fun total_supply(treasury_cap: &TreasuryCap<HETRACOIN>): u64 {
        coin::total_supply(treasury_cap)
    }

    /// @notice Mints new HETRA tokens
    /// @dev Only callable by authorized parties, checks for system pause and max supply
    /// @param treasury_cap The treasury capability for minting
    /// @param amount Amount of tokens to mint
    /// @param registry Admin registry to verify authorization
    /// @param pause_state Emergency pause state to check if system is paused
    /// @param ctx Transaction context
    /// @return Newly minted HETRA tokens
    public fun mint(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        amount: u64,
        registry: &AdminRegistry,
        pause_state: &EmergencyPauseState,
        ctx: &mut TxContext
    ): Coin<HETRACOIN> {
        // Verify caller is admin
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        
        // Check that system is not paused
        assert!(!pause_state.paused, E_SYSTEM_PAUSED);
        
        // Check that we won't exceed max supply
        let supply = coin::total_supply(treasury_cap);
        assert!(supply + amount <= MAX_SUPPLY, E_MAX_SUPPLY_EXCEEDED);
        
        // Mint the coins
        coin::mint(treasury_cap, amount, ctx)
    }

    /// @notice Burns HETRA tokens, reducing total supply
    /// @dev Only requires treasury capability for authorization
    /// @param treasury_cap The treasury capability for burning
    /// @param pause_state Emergency pause state to check if system is paused
    /// @param coin_to_burn The tokens to burn
    public fun burn(
        treasury_cap: &mut TreasuryCap<HETRACOIN>,
        pause_state: &EmergencyPauseState,
        coin_to_burn: Coin<HETRACOIN>
    ) {
        // Check that system is not paused
        assert!(!pause_state.paused, E_SYSTEM_PAUSED);
        
        coin::burn(treasury_cap, coin_to_burn);
    }

    /// @notice Changes the admin address in the registry
    /// @dev Requires admin cap for authorization
    /// @param treasury_cap The treasury capability (not mutated but required for verification)
    /// @param admin_cap The admin capability
    /// @param registry Registry to update
    /// @param new_admin New admin address
    /// @param ctx Transaction context for authorization
    #[allow(unused_variable)]
    public fun change_admin(
        treasury_cap: &TreasuryCap<HETRACOIN>,
        admin_cap: &AdminCap,
        registry: &mut AdminRegistry,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        // Verify the caller is the current admin
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        
        // Update the admin in the registry
        let previous_admin = registry.admin;
        registry.admin = new_admin;
        
        // Emit an event to track the admin change
        event::emit(AdminChangeEvent {
            previous_admin,
            new_admin,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// @notice Gets the current admin address from the registry
    /// @dev Read-only function to retrieve current governance admin
    /// @param registry The admin registry
    /// @return The current admin address
    public fun governance_admin(registry: &AdminRegistry): address {
        registry.admin
    }

    /// @notice Checks if the system is currently in emergency pause state
    /// @dev Read-only function to check pause status
    /// @param pause_state The emergency pause state
    /// @return Boolean indicating if system is paused
    public fun is_paused(pause_state: &EmergencyPauseState): bool {
        pause_state.paused
    }

    /// @notice Toggles the emergency pause state
    /// @dev Only callable by admin, emits event when state changes
    /// @param pause_state The pause state to modify
    /// @param registry Admin registry for authorization
    /// @param ctx Transaction context
    public entry fun pause(
        pause_state: &mut EmergencyPauseState,
        registry: &AdminRegistry,
        ctx: &mut TxContext
    ) {
        // Verify caller is admin
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        
        // Toggle the pause state
        pause_state.paused = !pause_state.paused;
        
        // Emit event for transparency
        event::emit(EmergencyPauseEvent {
            paused: pause_state.paused,
            admin: registry.admin,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// @notice Pauses operations with a specific reason
    /// @dev Only callable by admin, sets reason and timestamps for the pause
    /// @param registry Admin registry for authorization
    /// @param pause_state The pause state to modify
    /// @param reason Reason for pausing operations
    /// @param ctx Transaction context
    public entry fun pause_operations(
        registry: &AdminRegistry,
        pause_state: &mut EmergencyPauseState,
        reason: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Verify caller is admin
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        
        // Update pause state
        pause_state.paused = true;
        pause_state.pause_reason = reason;
        pause_state.paused_at = tx_context::epoch(ctx);
        pause_state.paused_by = tx_context::sender(ctx);
        pause_state.last_updated = tx_context::epoch(ctx);
        
        // Emit pause event
        event::emit(EmergencyPauseEvent {
            paused: true,
            admin: registry.admin,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// @notice Unpauses operations
    /// @dev Only callable by admin, requires system to be in paused state
    /// @param registry Admin registry for authorization
    /// @param pause_state The pause state to modify
    /// @param ctx Transaction context
    public entry fun unpause_operations(
        registry: &AdminRegistry,
        pause_state: &mut EmergencyPauseState,
        ctx: &mut TxContext
    ) {
        // Verify caller is admin
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_AUTHORIZED);
        assert!(pause_state.paused, E_NOT_PAUSED);
        
        // Update pause state
        pause_state.paused = false;
        pause_state.pause_reason = b"";
        pause_state.last_updated = tx_context::epoch(ctx);
        
        // Emit unpause event
        event::emit(EmergencyPauseEvent {
            paused: false,
            admin: registry.admin,
            timestamp: tx_context::epoch(ctx)
        });
    }

    /// @notice Gets the reason for the current system pause
    /// @dev Read-only function to retrieve pause explanation
    /// @param pause_state The emergency pause state
    /// @return Reason for the pause as byte vector
    public fun pause_reason(pause_state: &EmergencyPauseState): vector<u8> {
        pause_state.pause_reason
    }

    // ========== TEST HELPERS ==========
    
    /// @notice Creates an admin registry for testing
    /// @dev Testing utility function, not used in production
    /// @param admin Initial admin address
    /// @param ctx Transaction context
    /// @return Admin registry object
    #[test_only]
    public fun create_admin_registry_for_testing(admin: address, ctx: &mut TxContext): AdminRegistry {
        AdminRegistry {
            id: object::new(ctx),
            admin
        }
    }

    /// @notice Creates emergency pause state for testing
    /// @dev Testing utility function that creates and shares a pause state
    /// @param ctx Transaction context
    #[test_only]
    public fun create_pause_state_for_testing(ctx: &mut TxContext) {
        transfer::public_share_object(EmergencyPauseState {
            id: object::new(ctx),
            paused: false,
            pause_reason: b"",
            paused_at: 0,
            paused_by: @0x0,
            last_updated: tx_context::epoch(ctx)
        });
    }

    /// @notice Updates admin in registry for testing purposes
    /// @dev Direct update bypassing normal governance for tests
    /// @param registry Registry to modify
    /// @param new_admin New admin address
    #[test_only]
    public fun set_admin_for_testing(registry: &mut AdminRegistry, new_admin: address) {
        registry.admin = new_admin;
    }
}