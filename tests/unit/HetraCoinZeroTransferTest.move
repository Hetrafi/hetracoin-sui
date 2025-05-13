// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Test for zero amount transfer handling
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::HetraCoinZeroTransferTest {
    use sui::test_scenario;
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use hetracoin::HetraCoin::{Self, HETRACOIN, EmergencyPauseState};

    #[test]
    // Update the expected_failure to use a valid error code
    #[expected_failure(abort_code = 1, location = hetracoin::HetraCoin)]
    public fun test_zero_amount_transfer_fails() {
        let admin = @0xA;
        let recipient = @0xB;
        
        let mut scenario_val = test_scenario::begin(admin);
        let scenario = &mut scenario_val;
        
        // Initialize coin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ctx);
        };
        
        // Mint coins for admin
        test_scenario::next_tx(scenario, admin);
        {
            let ctx = test_scenario::ctx(scenario);
            let coin = coin::mint_for_testing<HETRACOIN>(100, ctx);
            transfer::public_transfer(coin, admin);
        };
        
        // Try to transfer zero amount (should fail)
        test_scenario::next_tx(scenario, admin);
        {
            let mut coin = test_scenario::take_from_sender<Coin<HETRACOIN>>(scenario);
            let pause_state = test_scenario::take_shared<EmergencyPauseState>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            // Based on the error message, secure_transfer takes 5 arguments now:
            // &mut Coin<HETRACOIN>, recipient: address, amount: u64, &EmergencyPauseState, ctx: &mut TxContext
            HetraCoin::secure_transfer(&mut coin, recipient, 0, &pause_state, ctx);
            
            test_scenario::return_to_sender(scenario, coin);
            test_scenario::return_shared(pause_state);
        };
        
        test_scenario::end(scenario_val);
    }
} 