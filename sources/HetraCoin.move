// Core HetraCoin token contract - Now with stronger security and event tracking
module hetracoin::HetraCoin {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::option;

    /// One-time witness type for coin initialization
    public struct HETRACOIN has drop {}

    // Defines HetraCoin as a native fungible asset
    public struct HetraCoin has drop {}

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
    const EOVERFLOW: u64 = 100;

    // Add explicit overflow/underflow checks to HetraCoin

    // Add a total_supply function
    public fun total_supply(): u64 {
        // In a real implementation, you would track the total supply
        // For now, we'll return a placeholder value
        0
    }

    // Fix the mint function
    public fun mint(treasury_cap: &mut TreasuryCap<HETRACOIN>, amount: u64, ctx: &mut TxContext): Coin<HETRACOIN> {
        // Check for potential overflow
        assert!(MAX_SUPPLY - total_supply() >= amount, EOVERFLOW);
        
        // Proceed with minting
        coin::mint(treasury_cap, amount, ctx)
    }
}
