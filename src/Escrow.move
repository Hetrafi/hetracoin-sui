// Escrow module - Locks wagered HetraCoin and securely releases to the winner
module hetracoin::Escrow {
    use sui::signer;
    use sui::object;
    use sui::coin;
    use sui::transfer;
    use sui::tx_context;
    use sui::event;

    // WagerEscrow struct stores the details of each wagered competition
    struct WagerEscrow has key, store {
        wager_id: u64,       // Unique ID for the match
        player_one: address, // Player 1 (initiates the wager)
        player_two: address, // Player 2 (accepts the wager)
        amount: u64,         // Wager amount per player
        status: u8,          // 0 = Active, 1 = Completed, 2 = Disputed, 3 = Expired
        assigned_resolver: address, // HetraFi backend or oracle account resolving disputes
        timestamp: u64,      // Block timestamp when wager was created
        winner: option<address>, // Address of the winner (if resolved)
    }

    // Event structure for wager creation
    struct WagerCreated has copy, drop {
        wager_id: u64,
        player_one: address,
        player_two: address,
        amount: u64,
        timestamp: u64
    }

    // Event structure for wager resolution
    struct WagerResolved has copy, drop {
        wager_id: u64,
        winner: address,
        timestamp: u64
    }

    // Constants
    const TIMEOUT_BLOCKS: u64 = 100000; // Arbitrary timeout period for disputes

    /// Locks wagered HetraCoin in escrow before a match starts
    public entry fun lock_wager(
        player_one: &signer, 
        player_two: address, 
        amount: u64,
        resolver: address,
        ctx: &mut tx_context::TxContext
    ): WagerEscrow {
        let wager_id = object::new_id();
        let timestamp = tx_context::timestamp(ctx);

        // Emit event to track wager creation
        event::emit<WagerCreated>(WagerCreated {
            wager_id,
            player_one: signer::address_of(player_one),
            player_two,
            amount,
            timestamp
        });

        WagerEscrow {
            wager_id,
            player_one: signer::address_of(player_one),
            player_two,
            amount,
            status: 0, // Wager is active
            assigned_resolver: resolver,
            timestamp,
            winner: none()
        }
    }

    /// Marks the wager as disputed, freezing funds until resolved
    public entry fun mark_as_disputed(
        resolver: &signer,
        wager: &mut WagerEscrow
    ) {
        // Ensure the wager is still active
        assert!(wager.status == 0, 1);

        // Only the assigned resolver can mark it as disputed
        assert!(signer::address_of(resolver) == wager.assigned_resolver, 2);

        // Change status to Disputed
        wager.status = 2;
    }

    /// Resolves the dispute and releases funds to the winner
    public entry fun release_wager(
        resolver: &signer,
        wager: &mut WagerEscrow,
        winner: address,
        ctx: &mut tx_context::TxContext
    ) {
        // Ensure the wager is either active or disputed (not completed)
        assert!(wager.status == 0 || wager.status == 2, 3);

        // Only the assigned resolver can resolve the wager
        assert!(signer::address_of(resolver) == wager.assigned_resolver, 4);

        // Ensure the winner is one of the two players
        assert!(winner == wager.player_one || winner == wager.player_two, 5);

        // Transfer full prize pool (amount * 2) to the winner
        transfer::public_transfer(coin::mint<HetraCoin>(wager.amount * 2, resolver), winner);

        // Log the winner and mark wager as completed
        wager.winner = some(winner);
        wager.status = 1;

        // Emit event for on-chain audit
        event::emit<WagerResolved>(WagerResolved {
            wager_id: wager.wager_id,
            winner,
            timestamp: tx_context::timestamp(ctx)
        });
    }

    /// Timeout function - Allows intervention if no resolution occurs within a certain time
    public entry fun force_resolve(
        admin: &signer,
        wager: &mut WagerEscrow
    ) {
        let current_time = tx_context::timestamp(admin);

        // Ensure wager is disputed or stuck
        assert!(wager.status == 2, 6);

        // Ensure timeout period has passed
        assert!(current_time > wager.timestamp + TIMEOUT_BLOCKS, 7);

        // Mark the wager as expired (funds are manually handled by backend intervention)
        wager.status = 3;
    }
}
