// Edge case tests for HetraCoin
module hetracoin_unit::HetraCoinEdgeCaseTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    use hetracoin::HetraCoin::{Self, HETRACOIN};

    #[test]
    public fun test_zero_value_transfer() {
        let admin = @0xA;
        let recipient = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Mint a zero-value coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let zero_coin = coin::mint_for_testing<HETRACOIN>(0, ctx);
            
            // Verify zero value
            assert_eq(coin::value(&zero_coin), 0);
            
            // Transfer zero-value coin
            transfer::public_transfer(zero_coin, recipient);
        };
        
        // Verify recipient received the zero-value coin
        test_scenario::next_tx(scenario, recipient);
        {
            let received_coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            assert_eq(coin::value(&received_coin), 0);
            transfer::public_transfer(received_coin, recipient);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    public fun test_large_value_transfer() {
        let admin = @0xA;
        let recipient = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Mint a large-value coin (max u64 value)
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let large_coin = coin::mint_for_testing<HETRACOIN>(18446744073709551615, ctx);
            
            // Verify large value
            assert_eq(coin::value(&large_coin), 18446744073709551615);
            
            // Transfer large-value coin
            transfer::public_transfer(large_coin, recipient);
        };
        
        // Verify recipient received the large-value coin
        test_scenario::next_tx(scenario, recipient);
        {
            let received_coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            assert_eq(coin::value(&received_coin), 18446744073709551615);
            transfer::public_transfer(received_coin, recipient);
        };
        
        test_scenario::end(scenario_val);
    }
} 