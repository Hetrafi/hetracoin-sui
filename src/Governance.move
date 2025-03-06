// Governance module - Manages HetraCoin minting and burning securely
module hetracoin::Governance {
    use sui::coin;
    use sui::signer;
    use sui::tx_context;
    use sui::event;

    // Ensures only authorized accounts can mint/burn HetraCoin
    struct HetraCoin has store, key {}

    // Maximum minting limit per transaction
    const MAX_MINT: u64 = 1_000_000_000; // 1 Billion HETRA max per mint

    // Event structure for minting & burning
    struct MintEvent has copy, drop {
        minter: address,
        amount: u64,
        timestamp: u64
    }
    struct BurnEvent has copy, drop {
        burner: address,
        amount: u64,
        timestamp: u64
    }

    // Minting function (only callable by governance)
    public entry fun mint(
        governance: &signer, 
        amount: u64, 
        ctx: &mut tx_context::TxContext
    ): coin::Coin<HetraCoin> {
        assert!(signer::address_of(governance) == 0xADMIN_ADDRESS, 1); // Only governance can mint
        assert!(amount <= MAX_MINT, 2); // Prevent inflationary abuse

        // Emit on-chain mint event
        event::emit<MintEvent>(MintEvent {
            minter: signer::address_of(governance),
            amount,
            timestamp: tx_context::timestamp(ctx)
        });

        coin::mint<HetraCoin>(amount, ctx)
    }

    // Burning function (only callable by governance)
    public entry fun burn(governance: &signer, token: coin::Coin<HetraCoin>, ctx: &mut tx_context::TxContext) {
        assert!(signer::address_of(governance) == 0xADMIN_ADDRESS, 3);

        let amount = coin::value(&token);
        coin::burn(token);

        // Emit on-chain burn event
        event::emit<BurnEvent>(BurnEvent {
            burner: signer::address_of(governance),
            amount,
            timestamp: tx_context::timestamp(ctx)
        });
    }
}
