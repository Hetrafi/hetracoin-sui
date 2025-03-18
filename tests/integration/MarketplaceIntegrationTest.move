// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Integration test for Hetrafi marketplace with Treasury integration
#[allow(duplicate_alias, unused_use)]
module hetracoin_integration::MarketplaceIntegrationTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Hetrafi;
    use hetracoin::Treasury;

    #[test]
    public fun test_marketplace_integration() {
        let admin = @0xA;
        let seller = @0xB;
        let buyer = @0xC;
        
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
        
        // Create Treasury and Hetrafi marketplace
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, admin);
            
            // Create Hetrafi marketplace with treasury address
            Hetrafi::create(admin, ctx);
        };
        
        // Buyer purchases from seller
        test_scenario::next_tx(scenario, buyer);
        {
            let mut hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Create coins for purchase
            let coins = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            
            // Process payment with fee - now using &mut reference
            let (payment, fee) = Hetrafi::transfer_with_fee(&mut hetrafi, coins, seller, ctx);
            
            // Verify fee is 5% (50 tokens)
            assert!(coin::value(&fee) == 50, 0);
            
            // Verify payment is 95% (950 tokens)
            assert!(coin::value(&payment) == 950, 0);
            
            // Transfer payment to seller
            transfer::public_transfer(payment, seller);
            
            // Return the shared object before changing transaction context
            test_scenario::return_shared(hetrafi);
            
            // Switch to admin to access treasury
            test_scenario::next_tx(scenario, admin);
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Deposit fee into treasury
            Treasury::deposit(&mut treasury, fee, ctx);
            
            // Verify treasury balance
            assert!(Treasury::get_balance(&treasury) == 50, 0);
            
            // Clean up
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 