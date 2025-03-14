// Comprehensive integration test for the HetraCoin ecosystem
#[allow(duplicate_alias)]
module hetracoin_integration::EcosystemIntegrationTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;
    use hetracoin::Treasury;
    use hetracoin::Hetrafi;
    use hetracoin::Staking;
    use hetracoin::Escrow;
    use hetracoin::Proposal;

    #[test]
    public fun test_full_ecosystem_integration() {
        let admin = @0xA;
        let user1 = @0xB;
        let user2 = @0xC;
        let treasury_addr = @0xD;
        
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
        
        // Create staking pool
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Staking::create_staking_pool(500, 30, ctx); // 5% APY, 30 day min lock
        };
        
        // Create governance system
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Proposal::create_governance_system(1000, 7, 2, ctx);
        };
        
        // Mint coins for users
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let user1_coins = Governance::mint(&mut treasury_cap, 5000, ctx);
            let user2_coins = Governance::mint(&mut treasury_cap, 3000, ctx);
            
            transfer::public_transfer(user1_coins, user1);
            transfer::public_transfer(user2_coins, user2);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // User1 stakes coins
        test_scenario::next_tx(scenario, user1);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let mut coins = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Split coins - 2000 for staking, 3000 remains
            let staking_coins = coin::split(&mut coins, 2000, ctx);
            
            // Stake coins
            Staking::stake(&mut pool, staking_coins, 90, ctx);
            
            // Return remaining coins
            transfer::public_transfer(coins, user1);
            test_scenario::return_shared(pool);
        };
        
        // User2 creates a wager with User1
        test_scenario::next_tx(scenario, user2);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Create wager for 1000 coins
            let wager = Escrow::lock_wager(user2, user1, 1000, admin, ctx);
            
            // Transfer wager to admin (resolver)
            transfer::public_transfer(wager, admin);
        };
        
        // User1 makes a purchase through Hetrafi
        test_scenario::next_tx(scenario, user1);
        {
            let hetrafi = test_scenario::take_shared<Hetrafi::Hetrafi>(scenario);
            let mut coins = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Split coins - 1000 for purchase, rest remains
            let purchase_coins = coin::split(&mut coins, 1000, ctx);
            
            // Transfer with fee
            let (payment, fee) = Hetrafi::transfer_with_fee(&hetrafi, purchase_coins, user2, ctx);
            
            // Transfer coins
            transfer::public_transfer(payment, user2);
            transfer::public_transfer(fee, treasury_addr);
            transfer::public_transfer(coins, user1);
            
            test_scenario::return_shared(hetrafi);
        };
        
        // Admin resolves the wager
        test_scenario::next_tx(scenario, admin);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Resolve in favor of user1
            Escrow::release_wager(admin, &mut wager, user1, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        // Treasury receives the fee
        test_scenario::next_tx(scenario, treasury_addr);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let fee_coin = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Deposit fee into treasury
            Treasury::deposit(&mut treasury, fee_coin, ctx);
            
            test_scenario::return_to_sender(scenario, treasury);
        };
        
        test_scenario::end(scenario_val);
    }
} 