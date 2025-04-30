#[test_only]
#[allow(unused_use, duplicate_alias, unused_variable, dead_code, unused_const)]
module hetracoin::GovernanceComprehensiveTest {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    use sui::tx_context::TxContext;
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
            Governance::burn(&mut treasury_cap, &registry, minted_coin, ts::ctx(&mut scenario));

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
            Governance::burn(&mut treasury_cap, &registry, coin_to_burn, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_shared(registry);
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
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);

            // Initiate transfer (transfers AdminCap to USER1)
            Governance::initiate_governance_transfer(&registry, admin_cap, USER1, ts::ctx(&mut scenario));

            // Registry is returned
            ts::return_shared(registry);
        };

        // USER1 accepts the transfer
        ts::next_tx(&mut scenario, USER1);
        {
            // USER1 now has the AdminCap
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            // Admin still holds TreasuryCap
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let transfer_request = ts::take_from_sender<GovernanceTransferRequest>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);

            // Accept the transfer (USER1 uses the AdminCap)
            Governance::accept_governance_transfer(&mut treasury_cap, transfer_request, &mut registry, &admin_cap, ts::ctx(&mut scenario));

            // Verify admin changed
            assert_eq(HetraCoin::governance_admin(&registry), USER1);

            // Return TreasuryCap to the new admin (USER1)
            ts::return_to_sender(&scenario, treasury_cap);
            // Return AdminCap to the new admin (USER1)
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
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            Governance::initiate_governance_transfer(&registry, admin_cap, USER1, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        // USER2 tries to accept
        ts::next_tx(&mut scenario, USER2);
        {
            // Admin still holds TreasuryCap
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            // USER1 has AdminCap and Request
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, USER1);
            let transfer_request = ts::take_from_address<GovernanceTransferRequest>(&scenario, USER1); 
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);

            // This should fail as USER2 is not the recipient
            Governance::accept_governance_transfer(&mut treasury_cap, transfer_request, &mut registry, &admin_cap, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(USER1, admin_cap); // Return cap to USER1
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = Governance::EREQUEST_EXPIRED)]
    fun test_accept_transfer_expired() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Admin initiates transfer to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<AdminRegistry>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            Governance::initiate_governance_transfer(&registry, admin_cap, USER1, ts::ctx(&mut scenario));
            ts::return_shared(registry);
        };

        // Advance time by advancing the epoch significantly (simulating time passage)
        ts::next_epoch(&mut scenario, ADMIN);
        ts::next_epoch(&mut scenario, ADMIN); // Advance a couple of epochs to simulate time

        // USER1 tries to accept the expired request
        ts::next_tx(&mut scenario, USER1);
        {
            // USER1 has AdminCap and Request
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            // Admin still holds TreasuryCap
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let transfer_request = ts::take_from_sender<GovernanceTransferRequest>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);

            // This should fail due to expiry
            Governance::accept_governance_transfer(&mut treasury_cap, transfer_request, &mut registry, &admin_cap, ts::ctx(&mut scenario));

            // Cleanup (won't be reached)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_sender(&scenario, admin_cap); // Return cap to USER1
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
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, ADMIN);

            // This should fail as USER1 is not the admin in the registry
            Governance::change_admin(&mut treasury_cap, &mut registry, &admin_cap, USER2, ts::ctx(&mut scenario));

            // Cleanup
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(ADMIN, admin_cap);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
} 