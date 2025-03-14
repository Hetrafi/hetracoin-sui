// Unit test for Governance permissions
module hetracoin_unit::GovernancePermissionTest {
    use sui::test_scenario::{Self};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;

    #[test]
    public fun test_governance_mint() {
        let admin = @0xA;
        
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
        
        // Admin mints coins through governance
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Mint coins using governance
            let minted_coin = Governance::mint(&mut treasury_cap, 500, ctx);
            assert_eq(coin::value(&minted_coin), 500);
            
            // Clean up
            transfer::public_transfer(minted_coin, admin);
            transfer::public_transfer(treasury_cap, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 