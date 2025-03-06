// Unit test for Treasury funds management
module hetracoin::unit::TreasuryTest {
    use sui::signer;
    use sui::tx_context;
    use sui::test_scenario;
    use hetracoin::Treasury;

    public fun test_withdrawal_requires_treasury_access() {
        let user = test_scenario::new_signer();
        let treasury_account = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        let mut treasury = Treasury::Treasury { funds: 1000 };

        // User tries to withdraw from treasury (should fail)
        Treasury::withdraw(&mut treasury, 500, &user, &ctx);
    }
}
