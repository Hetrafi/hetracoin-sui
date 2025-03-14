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
    public fun test_fee_deduction() {
        let admin = @0xA;
        let treasury = @0xB;
        let user = @0xC;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Create Hetrafi instance
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Hetrafi::create(treasury, ctx);
        };
        
        // Mint coins for user
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let coin = coin::mint_for_testing<HETRACOIN>(1000, ctx);
            transfer::public_transfer(coin, user);
        };
        
        // User transfers with fee
        test_scenario::next_tx(scenario, user);
        {
            let hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let (transferred, fee) = Hetrafi::transfer_with_fee(&hetrafi, coin, user, ctx);
            
            // Check amounts
            assert_eq(coin::value(&transferred), 950);
            assert_eq(coin::value(&fee), 50);
            
            // Return objects and transfer coins
            transfer::public_transfer(transferred, user);
            transfer::public_transfer(fee, treasury);
            test_scenario::return_shared(hetrafi);
        };
        
        test_scenario::end(scenario_val);
    }
}
