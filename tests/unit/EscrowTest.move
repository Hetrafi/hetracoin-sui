// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Unit test for Peer-to-Peer Wager Escrow
#[allow(duplicate_alias, unused_use)]
module hetracoin_unit::EscrowTest {
    use sui::test_scenario;
    use sui::test_utils::assert_eq;
    use sui::transfer;
    use sui::coin;
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use hetracoin::Escrow;

    #[test]
    public fun test_wager_lock_and_release() {
        let player_one = @0xA;
        let player_two = @0xB;
        let resolver = @0xC;
        
        let mut scenario_val = test_scenario::begin(resolver);
        let scenario = &mut scenario_val;
        
        // Lock wager
        {
            let ctx = test_scenario::ctx(scenario);
            
            let wager = Escrow::lock_wager(
                player_one, 
                player_two, 
                500, 
                resolver, 
                ctx
            );
            
            // Ensure wager is active
            assert_eq(Escrow::get_status(&wager), 0);
            
            // Store the wager
            transfer::public_transfer(wager, resolver);
        };
        
        // Resolve and release funds to player one
        test_scenario::next_tx(scenario, resolver);
        {
            let mut wager = test_scenario::take_from_sender<Escrow::WagerEscrow>(scenario);
            let ctx = test_scenario::ctx(scenario);
            
            Escrow::release_wager(resolver, &mut wager, player_one, ctx);
            
            // Ensure wager is completed
            assert_eq(Escrow::get_status(&wager), 1);
            
            test_scenario::return_to_sender(scenario, wager);
        };
        
        test_scenario::end(scenario_val);
    }
}
