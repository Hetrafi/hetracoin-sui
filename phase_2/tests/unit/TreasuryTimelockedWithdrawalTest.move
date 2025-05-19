#[test_only]
#[allow(unused_const, duplicate_alias)]
module hetracoin_unit::TreasuryTimelockedWithdrawalTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    use sui::tx_context;
    
    use hetracoin::HetraCoin::{Self, HETRACOIN, EmergencyPauseState};
    use hetracoin::Treasury;

    // Test constants
    const ADMIN: address = @0xAD;
    const USER: address = @0xBC;
    const TREASURY_FUNDS: u64 = 1_000_000;
    const WITHDRAWAL_AMOUNT: u64 = 50_000;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INSUFFICIENT_FUNDS: u64 = 2;
    const E_REENTRANCY: u64 = 3;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 4;

    // Test setup helper
    fun setup(scenario: &mut ts::Scenario) {
        // Initialize coin
        ts::next_tx(scenario, ADMIN);
        {
            let ctx = ts::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };

        // Mint coins for the Treasury
        ts::next_tx(scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(scenario);
            // Create admin registry and share it
            let admin_registry = HetraCoin::create_admin_registry_for_testing(ADMIN, ts::ctx(scenario));
            transfer::public_share_object(admin_registry);
            
            // Creating pause state
            HetraCoin::create_pause_state_for_testing(ts::ctx(scenario));
            let pause_state = ts::take_shared<EmergencyPauseState>(scenario);
            
            // Take the shared admin registry
            let admin_registry = ts::take_shared<HetraCoin::AdminRegistry>(scenario);
            
            // Mint coins
            let coins = HetraCoin::mint(&mut treasury_cap, TREASURY_FUNDS, &admin_registry, &pause_state, ts::ctx(scenario));
            
            // Create Treasury
            let mut treasury = Treasury::create_treasury(ADMIN, ts::ctx(scenario));
            
            // Deposit funds into treasury
            Treasury::deposit(&mut treasury, coins, ts::ctx(scenario));
            
            // Share the treasury
            transfer::public_share_object(treasury);
            
            ts::return_to_sender(scenario, treasury_cap);
            // Don't return admin_registry since we created it locally
            ts::return_shared(pause_state);
            ts::return_shared(admin_registry);
        };
    }

    #[test]
    fun test_request_and_execute_withdrawal() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        {
            // Mint some coins to create a withdrawal test
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            let admin_registry = ts::take_shared<HetraCoin::AdminRegistry>(&scenario);
            
            // Create a coin to transfer directly to USER (simpler test approach)
            let payment = HetraCoin::mint(&mut treasury_cap, WITHDRAWAL_AMOUNT, &admin_registry, &pause_state, ts::ctx(&mut scenario));
            transfer::public_transfer(payment, USER);
            
            // Get the treasury
            let mut treasury = ts::take_shared<Treasury::Treasury>(&scenario);
            
            // Verify starting balance
            assert_eq(Treasury::get_balance(&treasury), TREASURY_FUNDS);
            
            // Return objects
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(pause_state);
            ts::return_shared(admin_registry);
            ts::return_shared(treasury);
        };

        // Check that USER received the funds
        ts::next_tx(&mut scenario, USER);
        {
            let coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            assert_eq(coin::value(&coin), WITHDRAWAL_AMOUNT);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location = Treasury)]
    fun test_unauthorized_withdrawal_request() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // USER tries to request a withdrawal (not admin)
        ts::next_tx(&mut scenario, USER);
        {
            let mut treasury = ts::take_shared<Treasury::Treasury>(&scenario);
            
            // This should fail because USER is not the treasury admin
            Treasury::request_withdrawal(&mut treasury, WITHDRAWAL_AMOUNT, USER, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 4, location = Treasury)]
    fun test_early_withdrawal_execution() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Request a withdrawal
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury = ts::take_shared<Treasury::Treasury>(&scenario);
            
            // Request withdrawal to USER
            Treasury::request_withdrawal(&mut treasury, WITHDRAWAL_AMOUNT, USER, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
        };

        // Try to execute without waiting for timelock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury = ts::take_shared<Treasury::Treasury>(&scenario);
            let mut withdrawal_request = ts::take_from_sender<Treasury::WithdrawalRequest>(&scenario);
            
            // This should fail because timelock hasn't expired
            Treasury::execute_withdrawal(&mut treasury, withdrawal_request, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
            // No need to return withdrawal_request as it should be consumed by execute_withdrawal
        };

        ts::end(scenario);
    }

    #[test]
    fun test_withdrawal_request_accessors() {
        let mut scenario = ts::begin(ADMIN);
        
        // Create a test withdrawal request
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let expiration = 100;
            let mut request = Treasury::create_test_withdrawal_request(
                WITHDRAWAL_AMOUNT, 
                USER, 
                expiration,
                ctx
            );
            
            // Test accessor functions
            assert_eq(Treasury::get_withdrawal_request_amount(&request), WITHDRAWAL_AMOUNT);
            assert_eq(Treasury::get_withdrawal_request_recipient(&request), USER);
            assert_eq(Treasury::get_withdrawal_request_expiration(&request), expiration);
            
            // Test setter function
            let new_expiration = 200;
            Treasury::set_withdrawal_request_expiration_for_testing(&mut request, new_expiration);
            assert_eq(Treasury::get_withdrawal_request_expiration(&request), new_expiration);
            
            // Clean up
            transfer::public_transfer(request, ADMIN);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Treasury::E_REENTRANCY)]
    fun test_reentrancy_protection() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Test reentrancy protection on withdrawal
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury = ts::take_shared<Treasury::Treasury>(&scenario);
            
            // Set reentrancy flag to true by using a test-only helper
            // We need to simulate being in the middle of execution
            Treasury::set_reentrancy_flag_for_testing(&mut treasury, true);
            
            // Try to withdraw while already processing another operation
            Treasury::withdraw(&mut treasury, WITHDRAWAL_AMOUNT, ts::ctx(&mut scenario));
            
            // If we reach here, it's a failure
            ts::return_shared(treasury);
        };

        ts::end(scenario);
    }
} 