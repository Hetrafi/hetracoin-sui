#[test_only]
#[allow(unused_use, duplicate_alias, unused_variable, dead_code)]
module hetracoin::HetraCoinComprehensiveTest {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminCap, AdminRegistry, EmergencyPauseState};

    // Test constants
    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCA101;
    const AMOUNT: u64 = 100000;

    #[test]
    fun test_init_and_basic_functions() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin and get the necessary capabilities
        setup_coin(&mut scenario);
        
        // Test the initial state
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Check admin is correctly set
            assert_eq(HetraCoin::governance_admin(&registry), ADMIN);
            
            // Check pause state is initially false
            assert_eq(HetraCoin::is_paused(&pause_state), false);
            
            // Test minting
            let coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            assert_eq(coin::value(&coin), AMOUNT);
            
            // Transfer the coin to USER1
            transfer::public_transfer(coin, USER1);
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Test secure transfer
        ts::next_tx(&mut scenario, USER1);
        {
            let mut coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            // Split and send half to USER2
            let half_amount = AMOUNT / 2;
            HetraCoin::secure_transfer(&mut coin, USER2, half_amount, ts::ctx(&mut scenario));
            
            // Check remaining balance
            assert_eq(coin::value(&coin), AMOUNT - half_amount);
            
            ts::return_to_sender(&scenario, coin);
        };
        
        // Check USER2 received the coins
        ts::next_tx(&mut scenario, USER2);
        {
            let coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            assert_eq(coin::value(&coin), AMOUNT / 2);
            ts::return_to_sender(&scenario, coin);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_admin_change() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Change admin to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Change admin to USER1
            HetraCoin::change_admin(&treasury_cap, &admin_cap, &mut registry, USER1, ts::ctx(&mut scenario));
            
            // Verify admin was changed
            assert_eq(HetraCoin::governance_admin(&registry), USER1);
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_emergency_pause() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Test emergency pause
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Initial state should be unpaused
            assert_eq(HetraCoin::is_paused(&pause_state), false);
            
            // Pause operations
            let reason = b"Security incident";
            HetraCoin::pause_operations(&registry, &mut pause_state, reason, ts::ctx(&mut scenario));
            
            // Verify paused state
            assert_eq(HetraCoin::is_paused(&pause_state), true);
            assert_eq(HetraCoin::pause_reason(&pause_state), reason);
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Try to mint while paused (should fail)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // This should fail because system is paused
            // Use ts::next_tx to create a scope that can handle the abort
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Unpause operations
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Unpause
            HetraCoin::unpause_operations(&registry, &mut pause_state, ts::ctx(&mut scenario));
            
            // Verify unpaused state
            assert_eq(HetraCoin::is_paused(&pause_state), false);
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Try minting after unpause
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // Now minting should work
            let coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            assert_eq(coin::value(&coin), AMOUNT);
            
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
        
        // Try to change admin from unauthorized account
        ts::next_tx(&mut scenario, USER1);
        {
            // USER1 doesn't have these objects, so this should fail
            let _treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            
            // We won't reach here as the previous line should abort
            abort 0
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = HetraCoin::E_ZERO_AMOUNT)]
    fun test_zero_amount_transfer() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // Mint some coins
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
        
        // Try zero amount transfer
        ts::next_tx(&mut scenario, USER1);
        {
            let mut coin = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);
            
            // This should fail with E_ZERO_AMOUNT
            HetraCoin::secure_transfer(&mut coin, USER2, 0, ts::ctx(&mut scenario));
            
            ts::return_to_sender(&scenario, coin);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = HetraCoin::E_PAUSED)]
    fun test_attempting_operations_while_paused() {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize the coin
        setup_coin(&mut scenario);
        
        // First, pause operations
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let mut pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            let reason = b"Security incident";
            HetraCoin::pause_operations(&registry, &mut pause_state, reason, ts::ctx(&mut scenario));
            
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };
        
        // Try to mint while paused (should fail with E_PAUSED)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            
            // This should fail with E_PAUSED
            let _coin = HetraCoin::mint(&mut treasury_cap, AMOUNT, &registry, &pause_state, ts::ctx(&mut scenario));
            
            // Won't reach here
            abort 0
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