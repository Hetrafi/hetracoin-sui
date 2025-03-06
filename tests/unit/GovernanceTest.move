// Unit test for Governance-controlled minting and burning
module hetracoin::unit::GovernanceTest {
    use sui::coin;
    use sui::signer;
    use sui::tx_context;
    use sui::test_scenario;
    use hetracoin::Governance;

    public fun test_minting_requires_governance() {
        let unauthorized_user = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        // Try minting as unauthorized user (should fail)
        Governance::mint(&unauthorized_user, 1000, &ctx);
    }
}
