#[test_only]
#[allow(duplicate_alias)]
module hetracoin::additional_vesting_tests {
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
    const ATTACKER: address = @0xC001;
    
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
    fun test_multiple_schedules_for_same_beneficiary() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create first vesting schedule for BENEFICIARY1
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
            test_scenario::return_shared(vault);
        };
        
        // Create second vesting schedule for BENEFICIARY1
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT * 2, // 2M tokens
                VESTING_DURATION * 2, // 200 epochs
                CLIFF_PERIOD * 2, // 40 epochs
                test_scenario::ctx(&mut scenario)
            );
            
            // Check that we now have 2 schedules
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY1), 2);
            
            // Total allocated now should be 3M tokens
            assert_eq(Vesting::get_total_allocated(&vault), VESTING_AMOUNT * 3);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_claim_from_multiple_schedules() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create two vesting schedules with different parameters
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Schedule 1: 1M tokens, 100 epochs, 20 epoch cliff
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            // Schedule 2: 2M tokens, 200 epochs, 0 epoch cliff (immediate vesting)
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT * 2,
                VESTING_DURATION * 2,
                0, // No cliff
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Advance to epoch 30 (after first cliff, 30% of first schedule, 15% of second schedule)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1);
        {
            // Claim from first schedule
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Get expected amount for schedule 0
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let expected_claim_1 = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                0, // First schedule
                current_epoch
            );
            
            // Formula: (1M * 30) / 100 = 300,000
            assert_eq(expected_claim_1, 300_000);
            
            // Perform the claim
            Vesting::claim_vested_tokens(
                &mut vault,
                0, // First schedule
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Now claim from the second schedule
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Get expected amount for schedule 1
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let expected_claim_2 = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                1, // Second schedule
                current_epoch
            );
            
            // Formula: (2M * 30) / 200 = 300,000
            assert_eq(expected_claim_2, 300_000);
            
            // Perform the claim
            Vesting::claim_vested_tokens(
                &mut vault,
                1, // Second schedule
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Check total claimed amounts
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Total claimed should be 600,000
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - 600_000);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_ZERO_AMOUNT)]
    fun test_create_schedule_zero_amount() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Try to create a schedule with zero amount
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                0, // Zero amount
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INVALID_SCHEDULE)]
    fun test_create_schedule_zero_duration() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Try to create a schedule with zero duration
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                0, // Zero duration
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INVALID_SCHEDULE)]
    fun test_create_schedule_cliff_greater_than_duration() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Try to create a schedule with cliff > duration
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                50, // 50 epochs duration
                100, // 100 epochs cliff (greater than duration)
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_ZERO_AMOUNT)]
    fun test_claim_zero_amount() {
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
            
            test_scenario::return_shared(vault);
        };
        
        // Advance just past cliff
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 21, BENEFICIARY1); // Just past cliff
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Claim first tokens
            Vesting::claim_vested_tokens(
                &mut vault,
                0,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Try to claim immediately again (should fail with zero amount)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_view_functions() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create vesting schedules
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Create for first beneficiary
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                VESTING_AMOUNT,
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            // Create for second beneficiary
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY2,
                VESTING_AMOUNT * 2,
                VESTING_DURATION * 2,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Check view functions
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // 1. Check schedule counts
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY1), 1);
            assert_eq(Vesting::get_schedule_count(&vault, BENEFICIARY2), 1);
            assert_eq(Vesting::get_schedule_count(&vault, ATTACKER), 0); // Non-beneficiary
            
            // 2. Check vault balance
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND);
            
            // 3. Check total allocated
            assert_eq(Vesting::get_total_allocated(&vault), VESTING_AMOUNT * 3);
            
            // 4. Check available amount
            assert_eq(Vesting::get_available_amount(&vault), VAULT_INITIAL_FUND - (VESTING_AMOUNT * 3));
            
            // 5. Check claimable amount at start
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable1 = Vesting::get_claimable_amount(&vault, BENEFICIARY1, 0, current_epoch);
            assert_eq(claimable1, 0); // Still in cliff period
            
            test_scenario::return_shared(vault);
        };
        
        // Advance to past cliff
        test_scenario::next_tx(&mut scenario, ADMIN);
        advance_epochs(&mut scenario, 25, ADMIN); // 25 > cliff_period (20)
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Check claimable amount after cliff
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable1 = Vesting::get_claimable_amount(&vault, BENEFICIARY1, 0, current_epoch);
            
            // Formula: (1M * 25) / 100 = 250,000
            assert_eq(claimable1, 250_000);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_NOT_AUTHORIZED)]
    fun test_revoke_unauthorized() {
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
        
        // Non-admin tries to revoke schedule
        test_scenario::next_tx(&mut scenario, ATTACKER);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::revoke_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                0, // schedule index
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INVALID_SCHEDULE)]
    fun test_revoke_twice() {
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
        
        // Admin revokes schedule
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::revoke_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                0, // schedule index
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Try to revoke again (should fail)
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::revoke_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                0, // schedule index
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INSUFFICIENT_FUNDS)]
    fun test_withdraw_more_than_available() {
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
                VESTING_AMOUNT * 5, // Allocate 5M tokens
                VESTING_DURATION,
                CLIFF_PERIOD,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Try to withdraw more than available
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // Available: 10M - 5M = 5M
            // Try to withdraw more than available
            Vesting::withdraw_unused(
                &mut vault,
                6_000_000, // 6M > 5M available
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    fun test_rounding_in_vesting() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create vesting schedule with amount that doesn't divide evenly
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            // 1,000,003 tokens over 3 epochs
            Vesting::create_vesting_schedule(
                &mut vault,
                BENEFICIARY1,
                1_000_003, // Doesn't divide evenly by 3
                3, // 3 epochs duration
                0, // No cliff
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Claim after 1 epoch (should get 1/3 of tokens)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 1, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                0,
                current_epoch
            );
            
            // Formula: (1,000,003 * 1) / 3 = 333,334 integer division
            assert_eq(claimable, 333_334);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Claim after another epoch (should get another 1/3)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 1, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                0,
                current_epoch
            );
            
            // Formula: (1,000,003 * 2) / 3 - 333,334 = 333,334
            assert_eq(claimable, 333_334);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Claim after final epoch (should get remaining tokens)
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 1, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                0,
                current_epoch
            );
            
            // Remaining tokens: 1,000,003 - 333,334 - 333,334 = 333,335
            assert_eq(claimable, 333_335);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        // Verify total claimed equals original amount
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let current_epoch = test_scenario::ctx(&mut scenario).epoch();
            let claimable = Vesting::get_claimable_amount(
                &vault, 
                BENEFICIARY1,
                0,
                current_epoch
            );
            
            // Nothing left to claim
            assert_eq(claimable, 0);
            
            // Check vault balance (should be reduced by exactly 1,000,003)
            assert_eq(Vesting::get_vault_balance(&vault), VAULT_INITIAL_FUND - 1_000_003);
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_VECTOR_MISMATCH)]
    fun test_batch_create_with_mismatched_vectors() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Attempt batch create with mismatched vectors
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            let mut beneficiaries = vector::empty<address>();
            vector::push_back(&mut beneficiaries, BENEFICIARY1);
            vector::push_back(&mut beneficiaries, BENEFICIARY2);
            
            let mut amounts = vector::empty<u64>();
            vector::push_back(&mut amounts, VESTING_AMOUNT);
            // Missing one amount
            
            let mut durations = vector::empty<u64>();
            vector::push_back(&mut durations, VESTING_DURATION);
            vector::push_back(&mut durations, VESTING_DURATION * 2);
            
            let mut cliff_periods = vector::empty<u64>();
            vector::push_back(&mut cliff_periods, CLIFF_PERIOD);
            vector::push_back(&mut cliff_periods, CLIFF_PERIOD * 2);
            
            Vesting::batch_create_schedules(
                &mut vault,
                beneficiaries,
                amounts, // This is short by one element
                durations,
                cliff_periods,
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_NO_VESTING_SCHEDULE)]
    fun test_claim_nonexistent_schedule() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Try to claim without having a schedule
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                0, // Nonexistent schedule
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = hetracoin::Vesting::E_INVALID_SCHEDULE)]
    fun test_claim_invalid_schedule_index() {
        let mut scenario = setup_test();
        
        // Fund vault with tokens
        test_scenario::next_tx(&mut scenario, ADMIN);
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            let coins = test_scenario::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            Vesting::fund_vault(&mut vault, coins, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(vault);
        };
        
        // Create a schedule
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
            
            test_scenario::return_shared(vault);
        };
        
        // Try to claim with invalid index
        test_scenario::next_tx(&mut scenario, BENEFICIARY1);
        advance_epochs(&mut scenario, 30, BENEFICIARY1); // Past cliff
        {
            let mut vault = test_scenario::take_shared<VestingVault>(&scenario);
            
            Vesting::claim_vested_tokens(
                &mut vault,
                1, // Invalid index (only have index 0)
                test_scenario::ctx(&mut scenario)
            );
            
            test_scenario::return_shared(vault);
        };
        
        test_scenario::end(scenario);
    }
} 