// Unit test for HeTraFi service fees on the Hetrafi marketplace
module hetracoin::unit::HetrafiTest {
    use sui::coin;
    use sui::signer;
    use sui::tx_context;
    use sui::test_scenario;
    use hetracoin::Hetrafi;

    public fun test_fee_deduction() {
        let user = test_scenario::new_signer();
        let recipient = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        let coin = coin::mint<HetraCoin>(1000, &ctx);
        coin::deposit(&signer::address_of(&user), coin);

        // Transfer 1000 HETRA (5% should be deducted)
        let (transferred, fee) = Hetrafi::transfer_with_fee(&user, signer::address_of(&recipient), 1000);

        assert!(coin::value(&transferred) == 950, 1);
        assert!(coin::value(&fee) == 50, 2);
    }
}
