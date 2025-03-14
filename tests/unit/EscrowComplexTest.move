// Complex scenario tests for Escrow
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::EscrowComplexTest {
    use sui::test_scenario;
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Escrow;

    #[test]
    public fun test_multiple_wagers() {
        let player1 = @0xA;
        let player2 = @0xB;
        let resolver = @0xC;
        
        let mut scenario_val = test_scenario::begin(resolver);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create first wager and resolve it immediately
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
            let wager1 = Escrow::lock_wager(player1, player2, 500, resolver, ctx);
            
            // Resolve in favor of player1 immediately
            let mut wager1_mut = wager1;
            Escrow::release_wager(resolver, &mut wager1_mut, player1, ctx);
            
            // Clean up
            transfer::public_transfer(wager1_mut, resolver);
        };
        
        // Create second wager and resolve it
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
            let wager2 = Escrow::lock_wager(player2, player1, 1000, resolver, ctx);
            
            // Resolve in favor of player2 immediately
            let mut wager2_mut = wager2;
            Escrow::release_wager(resolver, &mut wager2_mut, player2, ctx);
            
            // Clean up
            transfer::public_transfer(wager2_mut, resolver);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = hetracoin::Escrow)]
    public fun test_double_resolution() {
        let player1 = @0xA;
        let player2 = @0xB;
        let resolver = @0xC;
        
        let mut scenario_val = test_scenario::begin(resolver);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create wager
        test_scenario::next_tx(scenario, resolver);
        {
            let ctx = test_scenario::ctx(scenario);
            let wager = Escrow::lock_wager(player1, player2, 500, resolver, ctx);
            transfer::public_transfer(wager, resolver);
        };
        
        // Resolve wager first time
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            Escrow::release_wager(resolver, &mut wager, player1, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        // Try to resolve wager again (should fail)
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // This should fail as wager is already completed
            Escrow::release_wager(resolver, &mut wager, player2, ctx);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        test_scenario::end(scenario_val);
    }
} 