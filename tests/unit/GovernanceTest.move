// Unit test for Governance-controlled minting and burning
module hetracoin_unit::GovernanceTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;

    #[test]
    #[expected_failure(abort_code = 1, location = hetracoin::Governance)]
    public fun test_minting_requires_governance() {
        let admin = @0xA;
        let unauthorized_user = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // First transaction to publish the module and initialize the coin
        test_scenario::next_tx(scenario, admin);
        {
            // Create the coin with the one-time witness
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Transfer treasury cap to unauthorized user
        test_scenario::next_tx(scenario, admin);
        {
            // Verify the treasury cap was created and sent to admin
            assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            transfer::public_transfer(treasury_cap, unauthorized_user);
        };
        
        // Unauthorized user tries to mint (should fail)
        test_scenario::next_tx(scenario, unauthorized_user);
        {
            // Verify the treasury cap was received by the unauthorized user
            assert!(test_scenario::has_most_recent_for_sender<TreasuryCap<HETRACOIN>>(scenario), 0);
            
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail with abort code 1
            let minted_coin = Governance::mint(&mut treasury_cap, 1000, ctx);
            transfer::public_transfer(minted_coin, unauthorized_user);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        test_scenario::end(scenario_val);
    }
}
