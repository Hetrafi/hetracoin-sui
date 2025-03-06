// Unit test for HetraCoin core functionality
module hetracoin::unit::HetraCoinTest {
    use sui::coin;
    use sui::signer;
    use sui::tx_context;
    use sui::balance;
    use sui::test_scenario;
    use hetracoin::HetraCoin;

    public fun test_transfer() {
        let sender = test_scenario::new_signer();
        let recipient = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        // Mint some HetraCoin to sender
        let coin = coin::mint<HetraCoin>(1000, &ctx);
        coin::deposit(&signer::address_of(&sender), coin);

        // Transfer 500 HetraCoins
        HetraCoin::secure_transfer(&sender, signer::address_of(&recipient), 500, &ctx);

        // Verify balances
        assert!(balance::value<HetraCoin>(&signer::address_of(&sender)) == 500, 1);
        assert!(balance::value<HetraCoin>(&signer::address_of(&recipient)) == 500, 2);
    }
}
