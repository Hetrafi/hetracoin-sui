// Edge case tests for Treasury
module hetracoin_unit::TreasuryEdgeCaseTest {
    use sui::test_scenario;
    use sui::coin;
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Treasury;

    #[test]
    public fun test_zero_withdrawal() {
        let admin = @0xA;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, admin);
        };
        
        // Deposit zero-value coin
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let zero_coin = coin::mint_for_testing<HETRACOIN>(0, ctx);
            Treasury::deposit(&mut treasury, zero_coin, ctx);
            
            // Withdraw zero amount
            Treasury::withdraw(&mut treasury, 0, ctx);
            
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = 2, location = hetracoin::Treasury)]
    public fun test_excessive_withdrawal() {
        let admin = @0xA;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Create treasury
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let treasury = Treasury::create_treasury(admin, ctx);
            transfer::public_transfer(treasury, admin);
        };
        
        // Deposit and try to withdraw more than available
        test_scenario::next_tx(scenario, admin);
        {
            let mut treasury = test_scenario::take_from_sender<Treasury::Treasury>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            let coin = coin::mint_for_testing<HETRACOIN>(100, ctx);
            Treasury::deposit(&mut treasury, coin, ctx);
            
            // Try to withdraw more than deposited (should fail)
            Treasury::withdraw(&mut treasury, 200, ctx);
            
            transfer::public_transfer(treasury, admin);
        };
        
        test_scenario::end(scenario_val);
    }
} 