// Unit test for Peer-to-Peer Wager Escrow
module hetracoin::unit::EscrowTest {
    use sui::signer;
    use sui::test_scenario;
    use sui::tx_context;
    use hetracoin::Escrow;

    public fun test_wager_lock_and_release() {
        let player_one = test_scenario::new_signer();
        let player_two = test_scenario::new_signer();
        let resolver = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        // Lock wager
        let mut wager = Escrow::lock_wager(&player_one, signer::address_of(&player_two), 500, signer::address_of(&resolver), &ctx);

        // Ensure wager is locked
        assert!(wager.status == 0, 1);

        // Resolve and release funds to player one
        Escrow::release_wager(&resolver, &mut wager, signer::address_of(&player_one), &ctx);

        // Ensure wager is completed
        assert!(wager.status == 1, 2);
    }
}
