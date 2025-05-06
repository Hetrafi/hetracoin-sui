#[test_only]
#[allow(unused_use, duplicate_alias, unused_const)]
module hetracoin_unit::GovernanceAdvancedTest {
    use sui::test_scenario::{Self as ts};
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::test_utils::assert_eq;
    use sui::object;
    
    use hetracoin::HetraCoin::{Self, HETRACOIN, AdminCap, AdminRegistry};
    use hetracoin::Governance::{Self, GovernanceCap};

    // Test constants
    const ADMIN: address = @0xAD;
    const NEW_ADMIN: address = @0xBC;
    const USER: address = @0xCD;

    // Helper function to set up the initial state
    fun setup(scenario: &mut ts::Scenario) {
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
    fun test_governance_cap_creation() {
        let mut scenario = ts::begin(ADMIN);
        
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            
            // Create governance cap
            let governance_cap = Governance::create_governance_cap_for_testing(ctx);
            
            // Verify it has a valid id
            let cap_id = object::id(&governance_cap);
            assert!(object::id_to_address(&cap_id) != @0x0, 0);
            
            transfer::public_transfer(governance_cap, ADMIN);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_treasury_cap_transfer() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Transfer treasury cap to NEW_ADMIN
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let governance_cap = ts::take_from_sender<GovernanceCap>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Transfer treasury cap to NEW_ADMIN
            Governance::transfer_treasury_cap(
                &mut treasury_cap, 
                &mut registry, 
                &admin_cap, 
                NEW_ADMIN, 
                ts::ctx(&mut scenario)
            );
            
            // Verify admin was updated
            assert_eq(HetraCoin::governance_admin(&registry), NEW_ADMIN);
            
            // Return objects
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, governance_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // Governance::E_NOT_AUTHORIZED
    fun test_unauthorized_treasury_cap_transfer() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // USER tries to transfer treasury cap
        ts::next_tx(&mut scenario, USER);
        {
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let governance_cap = ts::take_from_address<GovernanceCap>(&scenario, ADMIN);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, ADMIN);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // This should fail since USER is not the admin
            Governance::transfer_treasury_cap(
                &mut treasury_cap, 
                &mut registry, 
                &admin_cap, 
                NEW_ADMIN, 
                ts::ctx(&mut scenario)
            );
            
            // Return objects (won't reach here)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(ADMIN, governance_cap);
            ts::return_to_address(ADMIN, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_transfer_request_helper_functions() {
        let mut scenario = ts::begin(ADMIN);
        
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let timestamp = 12345;
            
            // Create a test transfer request
            let request = Governance::create_test_transfer_request(
                ADMIN, 
                NEW_ADMIN, 
                timestamp,
                ctx
            );
            
            // Test accessor functions
            assert_eq(Governance::get_transfer_request_from(&request), ADMIN);
            assert_eq(Governance::get_transfer_request_to(&request), NEW_ADMIN);
            assert_eq(Governance::get_transfer_request_timestamp(&request), timestamp);
            
            // Clean up
            transfer::public_transfer(request, ADMIN);
        };
        
        ts::end(scenario);
    }

    #[test]
    fun test_change_admin_with_governance_cap() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // Use change_admin function with the governance cap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut treasury_cap = ts::take_from_sender<TreasuryCap<HETRACOIN>>(&scenario);
            let governance_cap = ts::take_from_sender<GovernanceCap>(&scenario);
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // Change admin using the governance cap
            Governance::change_admin(
                &mut treasury_cap,
                &governance_cap,
                &mut registry,
                &admin_cap,
                NEW_ADMIN,
                ts::ctx(&mut scenario)
            );
            
            // Verify admin was updated
            assert_eq(HetraCoin::governance_admin(&registry), NEW_ADMIN);
            
            // Return objects
            ts::return_to_sender(&scenario, treasury_cap);
            ts::return_to_sender(&scenario, governance_cap);
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1)] // Governance::E_NOT_AUTHORIZED
    fun test_unauthorized_change_admin() {
        let mut scenario = ts::begin(ADMIN);
        setup(&mut scenario);

        // USER tries to change admin
        ts::next_tx(&mut scenario, USER);
        {
            let mut treasury_cap = ts::take_from_address<TreasuryCap<HETRACOIN>>(&scenario, ADMIN);
            let governance_cap = ts::take_from_address<GovernanceCap>(&scenario, ADMIN);
            let admin_cap = ts::take_from_address<AdminCap>(&scenario, ADMIN);
            let mut registry = ts::take_shared<AdminRegistry>(&scenario);
            
            // This should fail since USER is not the admin
            Governance::change_admin(
                &mut treasury_cap,
                &governance_cap,
                &mut registry,
                &admin_cap,
                NEW_ADMIN,
                ts::ctx(&mut scenario)
            );
            
            // Return objects (won't reach here)
            ts::return_to_address(ADMIN, treasury_cap);
            ts::return_to_address(ADMIN, governance_cap);
            ts::return_to_address(ADMIN, admin_cap);
            ts::return_shared(registry);
        };
        
        ts::end(scenario);
    }
} 