// Integration test for Hetrafi marketplace with Treasury integration
module hetracoin_integration::MarketplaceIntegrationTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Hetrafi;
    use hetracoin::Treasury;
    use hetracoin::Governance;

    #[test]
    public fun test_marketplace_with_treasury_integration() {
        let admin = @0xA;
        let treasury_addr = @0xB;
        let seller = @0xC;
        let buyer = @0xD;
        
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
        
        // Create Hetrafi marketplace
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Hetrafi::create(treasury_addr, ctx);
        };
        
        // Mint coins for buyer
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let buyer_coins = Governance::mint(&mut treasury_cap, 1000, ctx);
            transfer::public_transfer(buyer_coins, buyer);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Buyer makes a purchase through Hetrafi
        test_scenario::next_tx(scenario, buyer);
        {
            let hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Transfer with fee
            let (payment, fee) = Hetrafi::transfer_with_fee(&hetrafi, coins, seller, ctx);
            
            // Verify amounts
            assert_eq(coin::value(&payment), 950); // 95% to seller
            assert_eq(coin::value(&fee), 50);      // 5% fee
            
            // Transfer coins
            transfer::public_transfer(payment, seller);
            transfer::public_transfer(fee, treasury_addr);
            
            test_scenario::return_shared(hetrafi);
        };
        
        // Treasury receives the fee
        test_scenario::next_tx(scenario, treasury_addr);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let fee_coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Deposit fee into treasury
            Treasury::deposit(&mut treasury, fee_coin, ctx);
            
            test_scenario::return_to_sender(scenario, treasury);
        };
        
        test_scenario::end(scenario_val);
    }
} 