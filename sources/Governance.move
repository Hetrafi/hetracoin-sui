// Governance module - Manages HetraCoin minting and burning securely
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
}
