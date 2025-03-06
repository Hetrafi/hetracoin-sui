// Unit test for security & unauthorized access checks
module hetracoin::unit::SecurityTest {
    use sui::signer;
    use sui::test_scenario;
    use sui::tx_context;
    use hetracoin::{Governance, Treasury, Escrow};

    public fun test_unauthorized_minting_fails() {
        let attacker = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        // Unauthorized mint attempt should fail
        Governance::mint(&attacker, 100000, &ctx);
    }

    public fun test_unauthorized_treasury_withdrawal_fails() {
        let attacker = test_scenario::new_signer();
        let treasury_admin = test_scenario::new_signer();
        let ctx = test_scenario::new_tx_context();

        let mut treasury = Treasury::Treasury { funds: 5000 };

        // Unauthorized withdrawal should fail
        Treasury::withdraw(&mut treasury, 1000, &attacker, &ctx);
    }

    public fun test_wager_tampering_fails() {
        let attacker = test_scenario::new_signer(); 
        let ctx = test_scenario::new_tx_context();
        let mut wager = Escrow::WagerEscrow {
            wager_id: 1,
            player_one: signer::address_of(&attacker),
            player_two: signer::address_of(&attacker),
            amount: 500,
            status: 0,
            assigned_resolver: signer::address_of(&attacker),
            timestamp: 0,
            winner: none()
        };

        // Attacker tries to release funds without winning (should fail)
        Escrow::release_wager(&attacker, &mut wager, signer::address_of(&attacker), &ctx);
    }
}
