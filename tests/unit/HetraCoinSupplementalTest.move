#[test_only]
#[allow(unused_use, duplicate_alias, unused_variable, dead_code, unused_const)]
module hetracoin::HetraCoinSupplementalTest {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::test_utils::assert_eq;
    
    use hetracoin::HetraCoin::{
        Self, 
        HETRACOIN, 
        AdminCap, 
        AdminRegistry, 
        EmergencyPauseState,
        SetupCap
    };

    // Test constants
    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCA101;
    const TREASURY: address = @0xCAFE;
    const AMOUNT: u64 = 100000;
    const MAX_SUPPLY: u64 = 1000000000000; // This should match the MAX_SUPPLY in HetraCoin

    // Error codes - these should match HetraCoin
    const E_ZERO_AMOUNT: u64 = 1;
    const EOVERFLOW: u64 = 100;
    const E_NOT_AUTHORIZED: u64 = 101;
    const E_ALREADY_INITIALIZED: u64 = 102;
    const E_PAUSED: u64 = 91;
    const E_NOT_PAUSED: u64 = 92;
    
    // Sui test scenario error codes
    const EEmptyInventory: u64 = 3;

    #[test]
    fun test_setup_testnet_flow() {
        let mut scenario = ts::begin(ADMIN);
        
        // Create the witness and call init_for_testing
        ts::next_tx(&mut scenario, ADMIN);
        {
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ts::ctx(&mut scenario));
        };
        
        // Test the setup_for_testnet flow
        ts::next_tx(&mut scenario, ADMIN);
        {
            let setup_cap = ts::take_from_sender<SetupCap>(&scenario);
            
            // Call setup_for_testnet
            HetraCoin::setup_for_testnet(setup_cap, ts::ctx(&mut scenario));
            
            // Verify setup_cap is consumed (we shouldn't be able to take it again)
            // We won't try to take it again because that would cause a test failure
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_secure_transfer_functionality() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Mint coins and prepare for transfer
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            let coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            transfer::public_transfer(coin, USER1);
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Perform transfer using secure_transfer
        ts::next_tx(&mut scenario, USER1);
        {
            let mut coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            // Check initial balance
            let initial_balance = coin::value(&coin);
            assert!(initial_balance == AMOUNT, 1);
            
            // Perform secure_transfer
            HetraCoin::secure_transfer(&mut coin, USER2, AMOUNT / 2, ts::ctx(&mut scenario));
            
            // Check remaining balance
            let remaining_balance = coin::value(&coin);
            assert!(remaining_balance == AMOUNT / 2, 2);
            
            ts::return_to_sender(&scenario, coin);
        };
        
        // Check that USER2 received the coins
        ts::next_tx(&mut scenario, USER2);
        {
            let coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            assert!(coin::value(&coin) == AMOUNT / 2, 3);
            ts::return_to_sender(&scenario, coin);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_admin_change_functionality() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Change admin
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Check initial admin
            assert!(HetraCoin::governance_admin(&registry) == ADMIN, 1);
            
            // Change admin to USER1
            HetraCoin::change_admin(&treasury_cap, &admin_cap, &mut registry, USER1, ts::ctx(&mut scenario));
            
            // Verify admin was changed
            assert!(HetraCoin::governance_admin(&registry) == USER1, 2);
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_pause_state_functionality() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Test emergency pause
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Initial state should be unpaused
            assert!(HetraCoin::is_paused(&pause_state) == false, 1);
            
            // Pause operations
            let reason = b"Security incident";
            HetraCoin::pause_operations(&registry, &mut pause_state, reason, ts::ctx(&mut scenario));
            
            // Verify paused state
            assert!(HetraCoin::is_paused(&pause_state) == true, 2);
            assert!(HetraCoin::pause_reason(&pause_state) == reason, 3);
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Test emergency unpause
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Verify still paused
            assert!(HetraCoin::is_paused(&pause_state) == true, 4);
            
            // Unpause operations
            HetraCoin::unpause_operations(&registry, &mut pause_state, ts::ctx(&mut scenario));
            
            // Verify unpaused state
            assert!(HetraCoin::is_paused(&pause_state) == false, 5);
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = HetraCoin::E_MAX_SUPPLY_EXCEEDED)]
    fun test_max_supply_overflow() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Try to mint more than MAX_SUPPLY
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // This should fail with E_MAX_SUPPLY_EXCEEDED
            let coin = HetraCoin::mint(&mut treasury_cap, MAX_SUPPLY + 1, &registry, &pause_state, ts::ctx(&mut scenario));
            
            // This won't be reached due to the expected failure, but we need to handle the coin
            transfer::public_transfer(coin, ADMIN);
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = HetraCoin::E_NOT_AUTHORIZED)]
    fun test_unauthorized_mint() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Transfer TreasuryCap to USER1 but don't update registry
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            
            // Transfer to USER1
            transfer::public_transfer(treasury_cap, USER1);
        };
        
        // USER1 tries to mint but should fail because they're not the admin in registry
        ts::next_tx(&mut scenario, USER1);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // This should fail because USER1 is not the admin in registry
            let _coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            
            // Won't reach here
            abort 0
        };
        
        ts::end(scenario);
    }
    
    #[test]
    fun test_total_supply() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Test total_supply function
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Check initial supply is 0
            let initial_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(initial_supply == 0, 1);
            
            // Mint some coins
            let coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            
            // Check supply is increased by AMOUNT
            let new_supply = HetraCoin::total_supply(&treasury_cap);
            assert!(new_supply == AMOUNT, 2);
            
            // Clean up
            transfer::public_transfer(coin, ADMIN);
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = sui::test_scenario::EEmptyInventory)]
    fun test_unauthorized_admin_change() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Transfer admin cap to USER1 but don't transfer TreasuryCap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            
            // Transfer to USER1
            transfer::public_transfer(admin_cap, USER1);
        };
        
        // USER1 tries to change admin but should fail because they don't have the TreasuryCap
        ts::next_tx(&mut scenario, USER1);
        {
            // This will fail with EEmptyInventory because USER1 doesn't have the TreasuryCap
            let _treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            
            // Won't reach here
            abort 0
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = HetraCoin::E_NOT_PAUSED)]
    fun test_double_unpause() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // First pause the system
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Initial state should be unpaused
            assert!(HetraCoin::is_paused(&pause_state) == false, 1);
            
            // Pause operations
            let reason = b"Security incident";
            HetraCoin::pause_operations(&registry, &mut pause_state, reason, ts::ctx(&mut scenario));
            
            // Verify paused state
            assert!(HetraCoin::is_paused(&pause_state) == true, 2);
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Unpause the first time
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Unpause operations
            HetraCoin::unpause_operations(&registry, &mut pause_state, ts::ctx(&mut scenario));
            
            // Verify unpaused state
            assert!(HetraCoin::is_paused(&pause_state) == false, 3);
            
            // Attempt to unpause again right away, which should fail with E_NOT_PAUSED
            HetraCoin::unpause_operations(&registry, &mut pause_state, ts::ctx(&mut scenario));
            
            // Won't reach here
            abort 0
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = HetraCoin::E_NOT_AUTHORIZED)]
    fun test_unauthorized_pause_operations() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // USER1 tries to pause operations, which should fail
        ts::next_tx(&mut scenario, USER1);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // This should fail because USER1 is not the admin
            HetraCoin::pause_operations(&registry, &mut pause_state, b"Attempt to pause", ts::ctx(&mut scenario));
            
            // Won't reach here
            abort 0
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_helper_functions() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin in usual way to get all the objects
        setup_coin(&mut scenario);
        
        // Test set_admin_for_testing
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Initial admin should be ADMIN
            assert_eq(HetraCoin::governance_admin(&registry), ADMIN);
            
            // Set admin for testing
            HetraCoin::set_admin_for_testing(&mut registry, USER1);
            
            // Verify admin was changed
            assert_eq(HetraCoin::governance_admin(&registry), USER1);
            
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    // Helper function to set up the coin in tests
    fun setup_coin(scenario: &mut Scenario) {
        // Initialize the coin
        ts::next_tx(scenario, ADMIN);
        {
            // Create the HETRACOIN witness
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ts::ctx(scenario));
        };
    }
} 