// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

// Proposal module for HetraCoin governance
#[allow(duplicate_alias, unused_use)]
module hetracoin::Proposal {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use hetracoin::HetraCoin::HETRACOIN;
    
    // Error codes
    const E_INSUFFICIENT_VOTING_POWER: u64 = 1;
    const E_PROPOSAL_NOT_ACTIVE: u64 = 2;
    const E_ALREADY_VOTED: u64 = 3;
    const E_PROPOSAL_NOT_FOUND: u64 = 4;
    const E_VOTING_PERIOD_NOT_ENDED: u64 = 6;
    const E_PROPOSAL_ALREADY_EXECUTED: u64 = 7;
    
    // Proposal status
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_PASSED: u8 = 1;
    const STATUS_REJECTED: u8 = 2;
    const STATUS_EXECUTED: u8 = 3;
    
    // Governance system shared object
    public struct GovernanceSystem has key {
        id: UID,
        proposals: Table<u64, Proposal>,
        next_proposal_id: u64,
        min_voting_power: u64,
        voting_period_days: u64,
        execution_delay_days: u64,
    }
    
    // Proposal object
    public struct Proposal has store {
        id: u64,
        creator: address,
        title: vector<u8>,
        description: vector<u8>,
        created_at: u64,
        yes_votes: u64,
        no_votes: u64,
        status: u8,
        executed: bool,
        voters: Table<address, bool>,
    }
    
    // Vote receipt object
    public struct VoteReceipt has key {
        id: UID,
        proposal_id: u64,
        voter: address,
        vote: bool,
        voting_power: u64,
    }
    
    // Events
    public struct ProposalCreated has copy, drop {
        proposal_id: u64,
        creator: address,
        title: vector<u8>,
    }
    
    public struct VoteCast has copy, drop {
        proposal_id: u64,
        voter: address,
        vote: bool,
        voting_power: u64,
    }
    
    public struct ProposalExecuted has copy, drop {
        proposal_id: u64,
        executor: address,
    }
    
    // Create governance system
    public fun create_governance_system(
        min_voting_power: u64,
        voting_period_days: u64,
        execution_delay_days: u64,
        ctx: &mut TxContext
    ) {
        let governance_system = GovernanceSystem {
            id: object::new(ctx),
            proposals: table::new(ctx),
            next_proposal_id: 1,
            min_voting_power,
            voting_period_days,
            execution_delay_days,
        };
        
        transfer::share_object(governance_system);
    }
    
    // Create a new proposal
    public fun create_proposal(
        governance: &mut GovernanceSystem,
        voting_token: &Coin<HETRACOIN>,
        title: vector<u8>,
        description: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Check if user has enough voting power
        let voting_power = coin::value(voting_token);
        assert!(voting_power >= governance.min_voting_power, E_INSUFFICIENT_VOTING_POWER);
        
        let creator = tx_context::sender(ctx);
        let proposal_id = governance.next_proposal_id;
        
        // Create proposal
        let proposal = Proposal {
            id: proposal_id,
            creator,
            title,
            description,
            created_at: tx_context::epoch_timestamp_ms(ctx) / 86400000, // Convert to days
            yes_votes: 0,
            no_votes: 0,
            status: STATUS_ACTIVE,
            executed: false,
            voters: table::new(ctx),
        };
        
        // Add proposal to governance system
        table::add(&mut governance.proposals, proposal_id, proposal);
        
        // Increment proposal ID
        governance.next_proposal_id = proposal_id + 1;
        
        // Emit event
        event::emit(ProposalCreated {
            proposal_id,
            creator,
            title,
        });
    }
    
    // Vote on a proposal
    #[allow(lint(self_transfer))]
    public fun vote(
        governance: &mut GovernanceSystem,
        proposal_id: u64,
        voting_power: Coin<HETRACOIN>,
        vote_for: bool,
        ctx: &mut TxContext
    ) {
        // Check if proposal exists
        assert!(table::contains(&governance.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        
        let proposal = table::borrow_mut(&mut governance.proposals, proposal_id);
        
        // Check if proposal is active
        assert!(proposal.status == STATUS_ACTIVE, E_PROPOSAL_NOT_ACTIVE);
        
        // Check if voting period has not ended
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        assert!(current_time <= proposal.created_at + governance.voting_period_days, E_PROPOSAL_NOT_ACTIVE);
        
        let voter = tx_context::sender(ctx);
        
        // Check if voter has not already voted
        assert!(!table::contains(&proposal.voters, voter), E_ALREADY_VOTED);
        
        // Get voting power
        let voting_amount = coin::value(&voting_power);
        
        // Record vote
        table::add(&mut proposal.voters, voter, vote_for);
        
        // Update vote counts
        if (vote_for) {
            proposal.yes_votes = proposal.yes_votes + voting_amount;
        } else {
            proposal.no_votes = proposal.no_votes + voting_amount;
        };
        
        // Create vote receipt
        let receipt = VoteReceipt {
            id: object::new(ctx),
            proposal_id,
            voter,
            vote: vote_for,
            voting_power: voting_amount,
        };
        
        // Emit event
        event::emit(VoteCast {
            proposal_id,
            voter,
            vote: vote_for,
            voting_power: voting_amount,
        });
        
        // Transfer receipt to voter
        transfer::transfer(receipt, voter);
        
        if (voting_amount > 0) {
            // Return the voting power coin to the voter
            transfer::public_transfer(voting_power, voter);
        } else {
            // If it's a zero coin, we can destroy it
            coin::destroy_zero(voting_power);
        }
    }
    
    // Finalize proposal after voting period
    public fun finalize_proposal(
        governance: &mut GovernanceSystem,
        proposal_id: u64,
        ctx: &mut TxContext
    ) {
        // Check if proposal exists
        assert!(table::contains(&governance.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        
        let proposal = table::borrow_mut(&mut governance.proposals, proposal_id);
        
        // Check if proposal is active
        assert!(proposal.status == STATUS_ACTIVE, E_PROPOSAL_NOT_ACTIVE);
        
        // Check if voting period has ended
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        assert!(current_time > proposal.created_at + governance.voting_period_days, E_VOTING_PERIOD_NOT_ENDED);
        
        // Determine outcome
        if (proposal.yes_votes > proposal.no_votes) {
            proposal.status = STATUS_PASSED;
        } else {
            proposal.status = STATUS_REJECTED;
        };
    }
    
    // Execute passed proposal
    public fun execute_proposal(
        governance: &mut GovernanceSystem,
        proposal_id: u64,
        ctx: &mut TxContext
    ) {
        // Check if proposal exists
        assert!(table::contains(&governance.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);
        
        let proposal = table::borrow_mut(&mut governance.proposals, proposal_id);
        
        // Check if proposal has passed
        assert!(proposal.status == STATUS_PASSED, E_PROPOSAL_NOT_ACTIVE);
        
        // Check if proposal has not been executed
        assert!(!proposal.executed, E_PROPOSAL_ALREADY_EXECUTED);
        
        // Check if execution delay has passed
        let current_time = tx_context::epoch_timestamp_ms(ctx) / 86400000;
        assert!(
            current_time >= proposal.created_at + governance.voting_period_days + governance.execution_delay_days,
            E_VOTING_PERIOD_NOT_ENDED
        );
        
        // Mark as executed
        proposal.executed = true;
        proposal.status = STATUS_EXECUTED;
        
        // Emit event
        event::emit(ProposalExecuted {
            proposal_id,
            executor: tx_context::sender(ctx),
        });
        
        // In a real implementation, this would trigger the actual execution logic
        // For now, we just mark it as executed
    }
    
    // Getters
    public fun get_proposal_status(governance: &GovernanceSystem, proposal_id: u64): u8 {
        let proposal = table::borrow(&governance.proposals, proposal_id);
        proposal.status
    }
    
    public fun get_proposal_votes(governance: &GovernanceSystem, proposal_id: u64): (u64, u64) {
        let proposal = table::borrow(&governance.proposals, proposal_id);
        (proposal.yes_votes, proposal.no_votes)
    }
    
    public fun get_min_voting_power(governance: &GovernanceSystem): u64 {
        governance.min_voting_power
    }
    
    public fun get_voting_period(governance: &GovernanceSystem): u64 {
        governance.voting_period_days
    }
    
    public fun get_execution_delay(governance: &GovernanceSystem): u64 {
        governance.execution_delay_days
    }
}