// Stress test for liquidity pool under heavy transaction load
#[allow(duplicate_alias, unused_use, unused_variable)]
module hetracoin_unit::LiquidityPoolStressTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::LiquidityPool;
    use sui::sui::SUI;

    #[test]
    public fun test_liquidity_pool_stress() {
        let admin = @0xA;
        let user1 = @0xB;
        let user2 = @0xC;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create liquidity pool
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Create initial tokens
            let hetra = coin::mint_for_testing<HETRACOIN>(100000, ctx);
            let sui = coin::mint_for_testing<SUI>(100000, ctx);
            
            // Create pool with 0.3% fee
            LiquidityPool::create_pool(hetra, sui, 30, ctx);
        };
        
        // Mint tokens for users
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            
            // Create tokens for user1
            let hetra = coin::mint_for_testing<HETRACOIN>(50000, ctx);
            let sui = coin::mint_for_testing<SUI>(50000, ctx);
            
            transfer::public_transfer(hetra, user1);
            transfer::public_transfer(sui, user1);
            
            // Create tokens for user2
            let hetra = coin::mint_for_testing<HETRACOIN>(50000, ctx);
            let sui = coin::mint_for_testing<SUI>(50000, ctx);
            
            transfer::public_transfer(hetra, user2);
            transfer::public_transfer(sui, user2);
        };
        
        // User1 adds liquidity
        test_scenario::next_tx(scenario, user1);
        {
            let mut pool = test_scenario::take_shared<LiquidityPool::LiquidityPool>(scenario);
            let mut hetra = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let mut sui = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let hetra_add = coin::split(&mut hetra, 10000, ctx);
            let sui_add = coin::split(&mut sui, 10000, ctx);
            
            let lp_token = LiquidityPool::add_liquidity(&mut pool, hetra_add, sui_add, ctx);
            
            transfer::public_transfer(lp_token, user1);
            test_scenario::return_to_sender(scenario, hetra);
            test_scenario::return_to_sender(scenario, sui);
            test_scenario::return_shared(pool);
        };
        
        // User2 adds liquidity
        test_scenario::next_tx(scenario, user2);
        {
            let mut pool = test_scenario::take_shared<LiquidityPool::LiquidityPool>(scenario);
            let mut hetra = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let mut sui = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let hetra_add = coin::split(&mut hetra, 20000, ctx);
            let sui_add = coin::split(&mut sui, 20000, ctx);
            
            let lp_token = LiquidityPool::add_liquidity(&mut pool, hetra_add, sui_add, ctx);
            
            transfer::public_transfer(lp_token, user2);
            test_scenario::return_to_sender(scenario, hetra);
            test_scenario::return_to_sender(scenario, sui);
            test_scenario::return_shared(pool);
        };
        
        // User1 swaps HETRA for SUI
        test_scenario::next_tx(scenario, user1);
        {
            let mut pool = test_scenario::take_shared<LiquidityPool::LiquidityPool>(scenario);
            let mut hetra = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let hetra_swap = coin::split(&mut hetra, 5000, ctx);
            
            let sui_out = LiquidityPool::swap_token_for_sui(&mut pool, hetra_swap, 4000, ctx);
            
            transfer::public_transfer(sui_out, user1);
            test_scenario::return_to_sender(scenario, hetra);
            test_scenario::return_shared(pool);
        };
        
        // User2 swaps SUI for HETRA
        test_scenario::next_tx(scenario, user2);
        {
            let mut pool = test_scenario::take_shared<LiquidityPool::LiquidityPool>(scenario);
            let mut sui = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let sui_swap = coin::split(&mut sui, 5000, ctx);
            
            let hetra_out = LiquidityPool::swap_sui_for_token(&mut pool, sui_swap, 4000, ctx);
            
            transfer::public_transfer(hetra_out, user2);
            test_scenario::return_to_sender(scenario, sui);
            test_scenario::return_shared(pool);
        };
        
        test_scenario::end(scenario_val);
    }
} 