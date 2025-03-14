// Simple integration test for HetraCoin
#[allow(duplicate_alias)]
module hetracoin_integration::SimpleIntegrationTest {
    use sui::test_scenario::{Self};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;
    use hetracoin::Treasury;

    #[test]
    public fun test_simple_integration() {
        let admin = @0xA;
        let user = @0xB;
        let treasury_addr = @0xC;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create Treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(treasury_addr, ctx);
            transfer::public_transfer(treasury, treasury_addr);
        };
        
        // Mint coins for user
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let user_coins = Governance::mint(&mut treasury_cap, 1000, ctx);
            
            // Add assertion to verify minted amount
            assert_eq(coin::value(&user_coins), 1000);
            
            transfer::public_transfer(user_coins, user);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Verify user received coins
        test_scenario::next_tx(scenario, user);
        {
            let user_coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            
            // Add assertion to verify user received the correct amount
            assert_eq(coin::value(&user_coins), 1000);
            
            // Comment out or fix the deliberately failing assertion
            // assert_eq(coin::value(&user_coins), 2000); // This should fail
            
            test_scenario::return_to_sender(scenario, user_coins);
        };
        
        test_scenario::end(scenario_val);
    }
} 