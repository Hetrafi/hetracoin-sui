// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for HeTraFi service fees on the Hetrafi marketplace
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::HetrafiTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Hetrafi;

    #[test]
    public fun test_hetrafi_fee_calculation() {
        let admin = @0xA;
        let user = @0xB;
        let treasury = @0xC;
        
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
        
        // Create Hetrafi marketplace
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Hetrafi::create(treasury, ctx);
        };
        
        // Test fee calculation
        test_scenario::next_tx(scenario, admin);
        {
            let mut hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Create a coin to transfer
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            
            // Transfer with fee - now using &mut reference
            let (transferred, fee) = Hetrafi::transfer_with_fee(&mut hetrafi, coin, user, ctx);
            
            // Verify fee is 5% (50 tokens)
            assert!(coin::value(&fee) == 50, 0);
            
            // Verify remaining amount is 95% (950 tokens)
            assert!(coin::value(&transferred) == 950, 0);
            
            // Clean up
            transfer::public_transfer(transferred, user);
            transfer::public_transfer(fee, treasury);
            test_scenario::return_shared(hetrafi);
        };
        
        test_scenario::end(scenario_val);
    }
}
