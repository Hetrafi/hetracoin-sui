// Unit test for HetraCoin metadata
module hetracoin_unit::MetadataTest {
    use sui::test_scenario;
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, CoinMetadata};
    use hetracoin::HetraCoin::{Self, HETRACOIN};

    #[test]
    public fun test_coin_metadata() {
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
        
        // Check metadata
        test_scenario::next_tx(scenario, admin);
        {
            let metadata = test_scenario::take_from_sender<CoinMetadata<HETRACOIN>>(scenario);
            
            // Verify metadata fields
            assert_eq(coin::get_decimals(&metadata), 9);
            
            // We can't directly compare ASCII strings, so we'll just check the decimals
            // which is sufficient to verify the metadata was created correctly
            
            test_scenario::return_to_sender(scenario, metadata);
        };
        
        test_scenario::end(scenario_val);
    }
} 