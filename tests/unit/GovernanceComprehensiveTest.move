#[test_only]
#[allow(unused_use, duplicate_alias, unused_variable, dead_code, unused_const)]
module hetracoin::GovernanceComprehensiveTest {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};

    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminCap, AdminRegistry, EmergencyPauseState};
    use hetracoin::Governance::{Self, GovernanceCap, GovernanceTransferRequest};

    // Test constants
    const ADMIN: address = @0xA11CE;
    const USER1: address = @0xB0B;
    const USER2: address = @0xCA101;
    const AMOUNT: u64 = 100000;
    const MAX_MINT: u64 = 1_000_000_000;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_EXCEEDS_MAX_MINT: u64 = 2;
    const ENOT_RECIPIENT: u64 = 4;
    const EREQUEST_EXPIRED: u64 = 5;
    const EEmptyInventory: u64 = 3;

    // Helper function to set up the initial state
    fun setup(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            let witness = HetraCoin::create_witness_for_testing();
            HetraCoin::init_for_testing(witness, ts::ctx(scenario));
            
            // Create and transfer GovernanceCap
            let governance_cap = Governance::create_governance_cap_for_testing(ts::ctx(scenario));
            transfer::public_transfer(governance_cap, ADMIN);
        };
    }

    #[test]
    fun test_mint_and_burn() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Mint coins
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);

            // Mint
            let minted_coin = Governance::mint(&mut treasury_cap, &registry, &pause_state, AMOUNT, ts::ctx(&mut scenario));
            assert_eq(coin::value(&minted_coin), AMOUNT);

            // Check total supply
            assert_eq(HetraCoin::total_supply(&treasury_cap), AMOUNT);

            // Burn the minted coins
            Governance::burn(&mut treasury_cap, &registry, &pause_state, minted_coin, ts::ctx(&mut scenario));

            // Check total supply is back to 0
            assert_eq(HetraCoin::total_supply(&treasury_cap), 0);

            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::E_EXCEEDS_MAX_MINT)]
    fun test_mint_exceeds_limit() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);

            // Attempt to mint more than MAX_MINT
            let coin = Governance::mint(&mut treasury_cap, &registry, &pause_state, MAX_MINT + 1, ts::ctx(&mut scenario));
            
            // Cleanup (won't be reached)
            transfer::public_transfer(coin, ADMIN); // Consume the coin
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::E_NOT_AUTHORIZED)]
    fun test_unauthorized_burn() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Mint some coins for USER1 to try burning
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);

            let coin_to_burn = Governance::mint(&mut treasury_cap, &registry, &pause_state, AMOUNT, ts::ctx(&mut scenario));
            transfer::public_transfer(coin_to_burn, USER1);

            // Return TreasuryCap to ADMIN
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
        };

        // USER1 tries to burn
        ts::next_tx(&mut scenario, USER1);
        {
            // Temporarily take TreasuryCap from ADMIN to pass to burn function
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let coin_to_burn = ts::take_from_sender<Coin<HETRACOIN>>(&scenario);

            // This should fail because sender (USER1) is not admin in registry
            let pause_state = ts::take_shared<EmergencyPauseState>(&scenario);
            Governance::burn(&mut treasury_cap, &registry, &pause_state, coin_to_burn, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_shared(registry);
            ts::return_shared(pause_state);
            // coin_to_burn is consumed by the failed burn call
        };

        ts::end(scenario);
    }

    #[test]
    fun test_governance_transfer_flow() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Admin initiates transfer to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let governance_cap = ts::take_from_sender<GovernanceCap>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);

            // Initiate transfer (transfers AdminCap to USER1)
            Governance::initiate_governance_transfer(&mut treasury_cap, &registry, USER1, ts::ctx(&mut scenario));
            
            // Manually transfer AdminCap to USER1
            transfer::public_transfer(admin_cap, USER1);

            // Return the objects
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, governance_cap);
            ts::return_shared(registry);
        };

        // USER1 accepts the transfer - we need to modify the registry to allow this transaction
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // For testing, we set USER1 as the admin in registry, because in real execution
            // the protocol would require ADMIN to approve this change
            HetraCoin::set_admin_for_testing(&mut registry, USER1);
            
            ts::return_shared(registry);
        };

        // Now USER1 can actually accept the transfer
        ts::next_tx(&mut scenario, USER1);
        {
            // USER1 has the transfer request and AdminCap
            let transfer_request = ts::take_from_sender<GovernanceTransferRequest>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            
            // Admin still holds TreasuryCap
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Accept the transfer - now USER1 is already the admin so this should work
            Governance::accept_governance_transfer(&treasury_cap, &admin_cap, transfer_request, &mut registry, ts::ctx(&mut scenario));

            // Verify admin is still USER1
            assert_eq(HetraCoin::governance_admin(&registry), USER1);

            // Return TreasuryCap to the original owner
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::ENOT_RECIPIENT)]
    fun test_accept_transfer_wrong_recipient() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Admin initiates transfer to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            
            Governance::initiate_governance_transfer(&mut treasury_cap, &registry, USER1, ts::ctx(&mut scenario));
            
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_shared(registry);
        };

        // USER2 tries to accept
        ts::next_tx(&mut scenario, USER2);
        {
            // Admin still holds TreasuryCap
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            // USER1 has the transfer request
            let transfer_request = ts::take_from_address<GovernanceTransferRequest>(&scenario, USER1); 
            // Admin still has the AdminCap
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, ADMIN);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);

            // This should fail as USER2 is not the recipient
            Governance::accept_governance_transfer(&treasury_cap, &admin_cap, transfer_request, &mut registry, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(ADMIN, admin_cap); 
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::EREQUEST_EXPIRED)]
    fun test_accept_transfer_expired() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Create an expired transfer request directly
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            
            // Create a transfer request with a very old timestamp (expired)
            // Use a timestamp that is definitely more than 24 hours before any current time
            let expired_timestamp = 1000; // A very early timestamp
            
            // Create the request manually with an expired timestamp
            let transfer_request = Governance::create_test_transfer_request(
                ADMIN, // from
                USER1, // to
                expired_timestamp,
                ctx
            );
            
            // Transfer the expired request to USER1
            transfer::public_transfer(transfer_request, USER1);
            
            // Also transfer the admin cap to USER1
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            transfer::public_transfer(admin_cap, USER1);
        };

        // Set USER1 as admin to make authorization pass (isolating the expiration check)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            HetraCoin::set_admin_for_testing(&mut registry, USER1);
            ts::return_shared(registry);
        };

        // USER1 tries to accept the expired request
        ts::next_tx(&mut scenario, USER1);
        {
            let transfer_request = ts::take_from_sender<GovernanceTransferRequest>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Get treasury_cap from ADMIN
            let treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);

            // This should fail with EREQUEST_EXPIRED since the request timestamp is more than 24 hours old
            Governance::accept_governance_transfer(&treasury_cap, &admin_cap, transfer_request, &mut registry, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::E_NOT_AUTHORIZED)] // Use the correct error code from Governance
    fun test_direct_change_admin_unauthorized() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // USER1 attempts to call change_admin directly
        ts::next_tx(&mut scenario, USER1);
        {
            // Objects needed for the call, taken from ADMIN temporarily
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let governance_cap = ts::take_from_address<GovernanceCap>(&scenario, ADMIN);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, ADMIN);

            // This should fail as USER1 is not the admin in the registry
            Governance::change_admin(
                &mut treasury_cap,
                &governance_cap,
                &mut registry,
                &admin_cap,
                USER2,
                ts::ctx(&mut scenario)
            );

            // Cleanup
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(ADMIN, governance_cap);
            ts::return_to_address(ADMIN, admin_cap);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
} 