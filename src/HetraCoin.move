// Core HetraCoin token contract - Now with stronger security and event tracking
module hetracoin::HetraCoin {
    use sui::coin;
    use sui::object;
    use sui::signer;
    use sui::tx_context;
    use sui::balance;
    use sui::transfer;
    use sui::event;

    // Defines HetraCoin as a native fungible asset
    struct HetraCoin has store, key {}

    // Event structure for tracking transfers
    struct TransferEvent has copy, drop {
        from: address,
        to: address,
        amount: u64,
        timestamp: u64
    }

    // Initializes HetraCoin as a registered Sui-native asset
    public entry fun init(creator: &signer, ctx: &mut tx_context::TxContext) {
        coin::register<HetraCoin>(ctx);
    }

    // Secure token transfer with on-chain event logging
    public entry fun secure_transfer(
        sender: &signer, 
        recipient: address, 
        amount: u64, 
        ctx: &mut tx_context::TxContext
    ) {
        let transferred = coin::withdraw<HetraCoin>(&signer::address_of(sender), amount);
        transfer::public_transfer(transferred, recipient);

        // Emit a transparent on-chain event
        event::emit<TransferEvent>(TransferEvent {
            from: signer::address_of(sender),
            to: recipient,
            amount,
            timestamp: tx_context::timestamp(ctx)
        });
    }
}
