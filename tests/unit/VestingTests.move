#[test_only]
#[allow(duplicate_alias)]
module hetracoin::vesting_tests {
    use sui::test_scenario::{Self, Scenario};
    use sui::test_utils::assert_eq;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use std::vector;
    
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Vesting::{Self, VestingVault};

    // Test addresses
    const ADMIN: address = @0xA001;
    const BENEFICIARY1: address = @0xB001;
    const BENEFICIARY2: address = @0xB002;
    
    // Test constants
    const VAULT_INITIAL_FUND: u64 = 10_000_000; // 10M tokens
    const VESTING_AMOUNT: u64 = 1_000_000;      // 1M tokens
    const VESTING_DURATION: u64 = 100;          // 100 epochs
    const CLIFF_PERIOD: u64 = 20;               // 20 epochs
    
    // Helper function to advance multiple epochs
    fun advance_epochs(scenario: &mut Scenario, count: u64, addr: address) {
        let mut i = 0;
        while (i < count) {
            test_scenario::next_epoch(scenario, addr);
            i = i + 1;
        }
    }
    
    // Helper function to claim tokens and return them
    fun claim_and_return_tokens(
        scenario: &mut Scenario, 
        schedule_index: u64
    ): u64 {
        let mut vault = test_scenario::take_shared<VestingVault>(scenario);
        
        // Get the current epoch to calculate expected amount
        let current_epoch = test_scenario::ctx(scenario).epoch();
        
        // Get expected claimable amount before we claim
        let expected_amount = Vesting::get_claimable_amount(
            &vault, 
            test_scenario::ctx(scenario).sender(),
            schedule_index,
            current_epoch
        );
        
        // Claim the tokens
        Vesting::claim_vested_tokens(
            &mut vault,
            schedule_index,
            test_scenario::ctx(scenario)
        );
        
        // Return the vault
        test_scenario::return_shared(vault);
        
        // Return the expected amount
        expected_amount
    }
    
    // Test with existing pre-minted tokens
    fun setup_test(): Scenario {
        let mut scenario = test_scenario::begin(ADMIN);
        
        // Initialize with admin
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            // Create HetraCoin for testing
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, test_scenario::ctx(&mut scenario));
        };
        
        // Init vesting vault
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            Vesting::init_vesting_vault(ADMIN, test_scenario::ctx(&mut scenario));
        };
        
        // Mint tokens to admin (simulating already minted tokens)
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let coins = coin::mint(&mut treasury_cap, VAULT_INITIAL_FUND, test_scenario::ctx(&mut scenario));
            transfer::public_transfer(coins, ADMIN);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };
        
        scenario
    }
    
    #[test]
    fun test_create_vesting_vault() {
        let mut scenario = setup_test();
        
        // Verify vault exists and is properly set up
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            assert_eq(Vesting::get_vault_balance(&vault), 0);
            assert_eq(Vesting::get_total_allocated(&vault), 0);
            assert_eq(Vesting::get_available_amount(&vault), 0);
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_fund_vault() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND);
            assert_eq(Vesting::get_total_allocated(&vault), 0);
            assert_eq(Vesting::get_available_amount(&vault), VAULT_INITIAL_FUND);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_create_vesting_schedule() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create vesting schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY1), 1);
            assert_eq(Vesting::get_total_allocated(&vault), VESTING_AMOUNT);
            assert_eq(Vesting::get_available_amount(&vault), VAULT_INITIAL_FUND - VESTING_AMOUNT);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_NOT_AUTHORIZED)]
    fun test_create_vesting_schedule_unauthorized() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens from admin
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Non-admin tries to create a vesting schedule
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INSUFFICIENT_FUNDS)]
    fun test_create_vesting_schedule_insufficient_funds() {
        let mut scenario = setup_test();
        
        // Fund vault with small amount
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            
            // Mint only 100 tokens
            let small_coins = coin::mint(&mut treasury_cap, 100, test_scenario::ctx(&mut scenario));
            Vesting::fund_vault(&mut vault, small_coins, test_scenario::ctx(&mut scenario));
            
            test_scenario::return_shared(vault);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };
        
        // Try to create schedule with more tokens than available
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                1000, // more than available
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_batch_create_schedules() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create batch vesting schedules
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let mut beneficiaries = vector::empty<address>();
            vector::push_back(&mut beneficiaries, BENEFICIARY1);
            vector::push_back(&mut beneficiaries, BENEFICIARY2);
            
            let mut amounts = vector::empty<u64>();
            vector::push_back(&mut amounts, VESTING_AMOUNT);
            vector::push_back(&mut amounts, VESTING_AMOUNT * 2);
            
            let mut durations = vector::empty<u64>();
            vector::push_back(&mut durations, VESTING_DURATION);
            vector::push_back(&mut durations, VESTING_DURATION * 2);
            
            let mut cliff_periods = vector::empty<u64>();
            vector::push_back(&mut cliff_periods, CLIFF_PERIOD);
            vector::push_back(&mut cliff_periods, CLIFF_PERIOD * 2);
            
            Vesting::batch_create_schedules(
                &mut vault,
                beneficiaries,
                amounts,
                durations,
                cliff_periods,
                test_scenario::ctx(&mut scenario)
            );
            
            // Verify schedules were created
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY1), 1);
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY2), 1);
            
            // Total allocated: 1M + 2M = 3M
            assert_eq(Vesting::get_total_allocated(&vault), VESTING_AMOUNT * 3);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_CLIFF_NOT_PASSED)]
    fun test_claim_before_cliff() {
        let mut scenario = setup_test();
        
        // Fund vault and create schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Try to claim before cliff
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 10, BENEFICIARY1); // 10 < cliff_period (20)
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0, // schedule index
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_claim_after_cliff() {
        let mut scenario = setup_test();
        
        // Fund vault and create schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Claim after cliff
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1); // 30 > cliff_period (20)
        
        // Use our helper function to claim and get the expected amount
        let expected_claim = claim_and_return_tokens(&mut scenario, 0);
        
        // Formula: (1,000,000 * 30) / 100 = 300,000
        assert_eq(expected_claim, 300_000);
        
        // Check vault balances (we need to take the vault again to check)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - expected_claim);
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_claim_after_full_vesting() {
        let mut scenario = setup_test();
        
        // Fund vault and create schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Claim after full vesting
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 150, BENEFICIARY1); // 150 > duration (100)
        
        // Use our helper function to claim and get the expected amount
        let expected_claim = claim_and_return_tokens(&mut scenario, 0);
        
        // Should receive full amount
        assert_eq(expected_claim, VESTING_AMOUNT);
        
        // Check vault balances
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - VESTING_AMOUNT);
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_multiple_claims() {
        let mut scenario = setup_test();
        
        // Fund vault and create schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // First claim at epoch 30
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1); // 30% vested
        
        // Use our helper function to claim and get the expected amount
        let first_claim = claim_and_return_tokens(&mut scenario, 0);
        
        // Formula: (1,000,000 * 30) / 100 = 300,000
        assert_eq(first_claim, 300_000);
        
        // Second claim at epoch 60
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1); // Advance 30 more epochs to 60
        
        // Use our helper function to claim and get the expected amount
        let second_claim = claim_and_return_tokens(&mut scenario, 0);
        
        // Formula: (1,000,000 * 60) / 100 - 300,000 = 300,000
        assert_eq(second_claim, 300_000);
        
        // Check vault balances
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - first_claim - second_claim);
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_revoke_vesting_schedule() {
        let mut scenario = setup_test();
        
        // Fund vault and create schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // First claim after cliff
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1); // 30% vested
        
        // Use our helper function to claim and get the expected amount
        let claimed_amount = claim_and_return_tokens(&mut scenario, 0);
        
        // Admin revokes the schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Before revocation
            let initial_allocated = Vesting::get_total_allocated(&vault);
            
            Vesting::revoke_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                0, // schedule index
                test_scenario::ctx(&mut scenario)
            );
            
            // After revocation - allocated amount should decrease by remaining unvested tokens
            let expected_decrease = VESTING_AMOUNT - claimed_amount; // 700,000
            assert_eq(initial_allocated - Vesting::get_total_allocated(&vault), expected_decrease);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_withdraw_unused() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            
            // Create schedule that allocates only part of the funds
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT, // 1M tokens
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Withdraw unused funds
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // 10M - 1M = 9M available
            let available = VAULT_INITIAL_FUND - VESTING_AMOUNT;
            
            // Withdraw 5M tokens
            let withdraw_amount = 5_000_000;
            
            Vesting::withdraw_unused(
                &mut vault,
                withdraw_amount,
                test_scenario::ctx(&mut scenario)
            );
            
            // Check balances
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - withdraw_amount);
            assert_eq(Vesting::get_available_amount(&vault), available - withdraw_amount);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
} 