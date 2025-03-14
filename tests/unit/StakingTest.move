// Unit test for Staking module
#[allow(duplicate_alias)]
module hetracoin_unit::StakingTest {
    use sui::test_scenario;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Governance;
    use hetracoin::Staking;

    #[test]
    public fun test_staking_basic_flow() {
        let admin = @0xA;
        let staker = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create staking pool
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            Staking::create_staking_pool(500, 30, ctx); // 5% APY, 30 day min lock
        };
        
        // Mint coins for staker
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let staker_coins = Governance::mint(&mut treasury_cap, 10000, ctx);
            transfer::public_transfer(staker_coins, staker);
            
            test_scenario::return_to_sender(scenario, treasury_cap);
        };
        
        // Staker stakes coins
        test_scenario::next_tx(scenario, staker);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let coins = test_scenario::take_from_sender<coin::Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            Staking::stake(&mut pool, coins, 90, ctx); // 90 day lock
            
            test_scenario::return_shared(pool);
        };
        
        // Fast forward time and claim rewards
        test_scenario::next_tx(scenario, staker);
        {
            let mut pool = test_scenario::take_shared<Staking::StakingPool>(scenario);
            let mut stake = test_scenario::take_from_sender<Staking::Stake>(scenario);
            let mut treasury_cap = test_scenario::take_from_address<TreasuryCap<HETRACOIN>>(scenario, admin);
            let ctx = test_scenario::ctx(scenario);
            
            // Claim rewards
            let rewards = Staking::claim_rewards(&mut pool, &mut stake, &mut treasury_cap, ctx);
            transfer::public_transfer(rewards, staker);
            
            test_scenario::return_to_sender(scenario, stake);
            test_scenario::return_to_address(admin, treasury_cap);
            test_scenario::return_shared(pool);
        };
        
        test_scenario::end(scenario_val);
    }
} 