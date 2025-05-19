// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

/// @title Vesting Module
/// @notice Manages token vesting schedules for HetraCoin using pre-minted tokens
/// @dev Implements secure vesting with the following features:
///      - Vault-based token storage
///      - Linear vesting schedules
///      - Cliff periods
///      - Multiple schedules per beneficiary
///      - Admin controls
///      - Event logging
#[allow(duplicate_alias, unused_use)]
module hetracoin::Vesting {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use hetracoin::HetraCoin::{Self, HETRACOIN};
    use sui::transfer;
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use std::vector;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INSUFFICIENT_FUNDS: u64 = 2;
    const E_REENTRANCY: u64 = 3;
    const E_CLIFF_NOT_PASSED: u64 = 4;
    const E_NO_VESTING_SCHEDULE: u64 = 5;
    const E_INVALID_SCHEDULE: u64 = 6;
    const E_ZERO_AMOUNT: u64 = 7;
    const E_EMPTY_BENEFICIARIES: u64 = 9;
    const E_VECTOR_MISMATCH: u64 = 10;

    /// @notice Vesting schedule for a beneficiary
    /// @dev Tracks vesting parameters and claimed amounts
    public struct VestingSchedule has store {
        /// @notice Total amount of tokens in the schedule
        total_amount: u64,
        /// @notice Amount of tokens already claimed
        claimed_amount: u64,
        /// @notice Start time of vesting (epoch)
        start_time: u64,
        /// @notice Duration of vesting in epochs
        duration: u64,
        /// @notice Cliff period in epochs
        cliff_period: u64,
        /// @notice Whether the schedule is revoked
        revoked: bool
    }

    /// @notice Vault that stores tokens and manages vesting schedules
    /// @dev Main container for the vesting system
    public struct VestingVault has key {
        id: UID,
        /// @notice Admin address with control over vesting
        admin: address,
        /// @notice Tokens held in the vault for vesting
        token_balance: Balance<HETRACOIN>,
        /// @notice Map of beneficiary address to their vesting schedules
        schedules: Table<address, vector<VestingSchedule>>,
        /// @notice Reentrancy guard for vault operations
        in_execution: bool,
        /// @notice Total amount of tokens committed to vesting
        total_allocated: u64
    }

    /// @notice Event emitted when the vault is funded with tokens
    public struct VaultFunded has copy, drop {
        amount: u64,
        funder: address,
        timestamp: u64
    }

    /// @notice Event emitted when a new vesting schedule is created
    public struct VestingScheduleCreated has copy, drop {
        beneficiary: address,
        total_amount: u64,
        start_time: u64,
        duration: u64,
        cliff_period: u64
    }

    /// @notice Event emitted when tokens are claimed from a vesting schedule
    public struct TokensClaimed has copy, drop {
        beneficiary: address,
        amount: u64,
        remaining_amount: u64,
        timestamp: u64
    }

    /// @notice Event emitted when a vesting schedule is revoked
    public struct VestingScheduleRevoked has copy, drop {
        beneficiary: address,
        remaining_amount: u64,
        timestamp: u64
    }

    /// @notice Creates a new vesting vault
    /// @dev Initializes the vesting system with an admin
    /// @param admin Address that will have administrative control
    /// @param ctx Transaction context
    public fun create_vault(admin: address, ctx: &mut TxContext): VestingVault {
        VestingVault {
            id: object::new(ctx),
            admin,
            token_balance: balance::zero<HETRACOIN>(),
            schedules: table::new(ctx),
            in_execution: false,
            total_allocated: 0
        }
    }

    /// @notice Initializes a shared vesting vault
    /// @dev Wrapper function that creates and shares a vault
    /// @param admin Address that will have administrative control
    /// @param ctx Transaction context
    public entry fun init_vesting_vault(admin: address, ctx: &mut TxContext) {
        let vault = create_vault(admin, ctx);
        transfer::share_object(vault);
    }

    /// @notice Funds the vesting vault with tokens
    /// @dev Adds tokens to the vault's balance
    /// @param vault The vesting vault to fund
    /// @param tokens Tokens to add to the vault
    /// @param ctx Transaction context
    public entry fun fund_vault(
        vault: &mut VestingVault,
        tokens: Coin<HETRACOIN>,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        let amount = coin::value(&tokens);
        assert!(amount > 0, E_ZERO_AMOUNT);
        
        // Add tokens to vault
        let token_balance = coin::into_balance(tokens);
        balance::join(&mut vault.token_balance, token_balance);
        
        // Emit event
        event::emit(VaultFunded {
            amount,
            funder: tx_context::sender(ctx),
            timestamp: tx_context::epoch(ctx)
        });
        
        vault.in_execution = false;
    }

    /// @notice Internal function to create a vesting schedule without reentrancy checks
    /// @dev Used by batch_create_schedules to avoid duplicating reentrancy checks
    /// @param vault The vesting vault
    /// @param beneficiary Address that will receive the vested tokens
    /// @param total_amount Total amount of tokens to vest
    /// @param duration Duration of vesting in epochs
    /// @param cliff_period Cliff period in epochs
    /// @param ctx Transaction context
    fun create_vesting_schedule_internal(
        vault: &mut VestingVault,
        beneficiary: address,
        total_amount: u64,
        duration: u64,
        cliff_period: u64,
        ctx: &TxContext
    ) {
        // Verify parameters (not checking admin or reentrancy here)
        assert!(total_amount > 0, E_ZERO_AMOUNT);
        assert!(duration > 0, E_INVALID_SCHEDULE);
        assert!(cliff_period <= duration, E_INVALID_SCHEDULE);
        
        // Check if vault has enough tokens
        let available = balance::value(&vault.token_balance) - vault.total_allocated;
        assert!(available >= total_amount, E_INSUFFICIENT_FUNDS);
        
        // Create new schedule
        let schedule = VestingSchedule {
            total_amount,
            claimed_amount: 0,
            start_time: tx_context::epoch(ctx),
            duration,
            cliff_period,
            revoked: false
        };

        // Add schedule to beneficiary's list
        if (!table::contains(&vault.schedules, beneficiary)) {
            table::add(&mut vault.schedules, beneficiary, vector::empty());
        };
        let schedules = table::borrow_mut(&mut vault.schedules, beneficiary);
        vector::push_back(schedules, schedule);
        
        // Update total allocated
        vault.total_allocated = vault.total_allocated + total_amount;
        
        // Emit event
        event::emit(VestingScheduleCreated {
            beneficiary,
            total_amount,
            start_time: tx_context::epoch(ctx),
            duration,
            cliff_period
        });
    }

    /// @notice Creates a new vesting schedule for a beneficiary
    /// @dev Only callable by admin
    /// @param vault The vesting vault
    /// @param beneficiary Address that will receive the vested tokens
    /// @param total_amount Total amount of tokens to vest
    /// @param duration Duration of vesting in epochs
    /// @param cliff_period Cliff period in epochs
    /// @param ctx Transaction context
    public entry fun create_vesting_schedule(
        vault: &mut VestingVault,
        beneficiary: address,
        total_amount: u64,
        duration: u64,
        cliff_period: u64,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        // Verify admin
        assert!(tx_context::sender(ctx) == vault.admin, E_NOT_AUTHORIZED);
        
        // Use the internal function to create the schedule
        create_vesting_schedule_internal(
            vault,
            beneficiary,
            total_amount,
            duration,
            cliff_period,
            ctx
        );
        
        vault.in_execution = false;
    }

    /// @notice Creates multiple vesting schedules in batch
    /// @dev Admin function to efficiently setup multiple schedules
    /// @param vault The vesting vault
    /// @param beneficiaries List of beneficiary addresses
    /// @param amounts List of token amounts
    /// @param durations List of durations
    /// @param cliff_periods List of cliff periods
    /// @param ctx Transaction context
    public entry fun batch_create_schedules(
        vault: &mut VestingVault,
        beneficiaries: vector<address>,
        amounts: vector<u64>,
        durations: vector<u64>,
        cliff_periods: vector<u64>,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        // Verify admin is calling
        assert!(tx_context::sender(ctx) == vault.admin, E_NOT_AUTHORIZED);
        
        // Validate beneficiaries list isn't empty
        assert!(vector::length(&beneficiaries) > 0, E_EMPTY_BENEFICIARIES);
        
        // Validate all input vectors have the same length
        let len = vector::length(&beneficiaries);
        assert!(vector::length(&amounts) == len, E_VECTOR_MISMATCH);
        assert!(vector::length(&durations) == len, E_VECTOR_MISMATCH);
        assert!(vector::length(&cliff_periods) == len, E_VECTOR_MISMATCH);
        
        // Calculate total requested amount
        let mut total_requested = 0u64;
        let mut i = 0;
        while (i < len) {
            total_requested = total_requested + *vector::borrow(&amounts, i);
            i = i + 1;
        };
        
        // Ensure the vault has sufficient funds
        let available = balance::value(&vault.token_balance) - vault.total_allocated;
        assert!(available >= total_requested, E_INSUFFICIENT_FUNDS);
        
        // Create a schedule for each beneficiary
        let mut i = 0;
        while (i < len) {
            // Use internal function without reentrancy checks
            create_vesting_schedule_internal(
                vault,
                *vector::borrow(&beneficiaries, i),
                *vector::borrow(&amounts, i),
                *vector::borrow(&durations, i),
                *vector::borrow(&cliff_periods, i),
                ctx
            );
            i = i + 1;
        };
        
        // Reset the reentrancy guard
        vault.in_execution = false;
    }

    /// @notice Claims available vested tokens
    /// @dev Calculates vested amount based on time elapsed
    /// @param vault The vesting vault
    /// @param schedule_index Index of the schedule to claim from
    /// @param ctx Transaction context
    public entry fun claim_vested_tokens(
        vault: &mut VestingVault,
        schedule_index: u64,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        let sender = tx_context::sender(ctx);
        
        // Get beneficiary's schedules
        assert!(table::contains(&vault.schedules, sender), E_NO_VESTING_SCHEDULE);
        let schedules = table::borrow_mut(&mut vault.schedules, sender);
        assert!(schedule_index < vector::length(schedules), E_INVALID_SCHEDULE);
        
        let schedule = vector::borrow_mut(schedules, schedule_index);
        assert!(!schedule.revoked, E_INVALID_SCHEDULE);
        
        // Calculate vested amount
        let current_time = tx_context::epoch(ctx);
        let elapsed_time = current_time - schedule.start_time;
        
        // Check cliff
        assert!(elapsed_time >= schedule.cliff_period, E_CLIFF_NOT_PASSED);
        
        // Calculate vested amount
        let vested_amount = if (elapsed_time >= schedule.duration) {
            schedule.total_amount
        } else {
            (schedule.total_amount * elapsed_time) / schedule.duration
        };
        
        // Calculate claimable amount
        let claimable_amount = vested_amount - schedule.claimed_amount;
        assert!(claimable_amount > 0, E_ZERO_AMOUNT);
        
        // Update claimed amount
        schedule.claimed_amount = schedule.claimed_amount + claimable_amount;
        
        // Transfer tokens to beneficiary
        let claimed_balance = balance::split(&mut vault.token_balance, claimable_amount);
        let claimed_coin = coin::from_balance(claimed_balance, ctx);
        transfer::public_transfer(claimed_coin, sender);
        
        // Emit event
        event::emit(TokensClaimed {
            beneficiary: sender,
            amount: claimable_amount,
            remaining_amount: schedule.total_amount - schedule.claimed_amount,
            timestamp: current_time
        });
        
        vault.in_execution = false;
    }

    /// @notice Revokes a vesting schedule
    /// @dev Only callable by admin
    /// @param vault The vesting vault
    /// @param beneficiary Address whose schedule to revoke
    /// @param schedule_index Index of the schedule to revoke
    /// @param ctx Transaction context
    public entry fun revoke_vesting_schedule(
        vault: &mut VestingVault,
        beneficiary: address,
        schedule_index: u64,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        // Verify admin
        assert!(tx_context::sender(ctx) == vault.admin, E_NOT_AUTHORIZED);
        
        // Get beneficiary's schedules
        assert!(table::contains(&vault.schedules, beneficiary), E_NO_VESTING_SCHEDULE);
        let schedules = table::borrow_mut(&mut vault.schedules, beneficiary);
        assert!(schedule_index < vector::length(schedules), E_INVALID_SCHEDULE);
        
        let schedule = vector::borrow_mut(schedules, schedule_index);
        assert!(!schedule.revoked, E_INVALID_SCHEDULE);
        
        // Calculate remaining amount
        let remaining_amount = schedule.total_amount - schedule.claimed_amount;
        
        // Mark as revoked
        schedule.revoked = true;
        
        // Update total allocated
        vault.total_allocated = vault.total_allocated - remaining_amount;
        
        // Emit event
        event::emit(VestingScheduleRevoked {
            beneficiary,
            remaining_amount,
            timestamp: tx_context::epoch(ctx)
        });
        
        vault.in_execution = false;
    }

    /// @notice Withdraw unused funds from the vault
    /// @dev Admin function to reclaim unallocated tokens
    /// @param vault The vesting vault
    /// @param amount Amount to withdraw
    /// @param ctx Transaction context
    public entry fun withdraw_unused(
        vault: &mut VestingVault,
        amount: u64,
        ctx: &mut TxContext
    ) {
        // Check for reentrancy
        assert!(!vault.in_execution, E_REENTRANCY);
        vault.in_execution = true;
        
        // Verify admin
        assert!(tx_context::sender(ctx) == vault.admin, E_NOT_AUTHORIZED);
        
        // Calculate available amount
        let available = balance::value(&vault.token_balance) - vault.total_allocated;
        assert!(amount <= available, E_INSUFFICIENT_FUNDS);
        
        // Transfer to admin
        let withdraw_balance = balance::split(&mut vault.token_balance, amount);
        let withdraw_coin = coin::from_balance(withdraw_balance, ctx);
        transfer::public_transfer(withdraw_coin, vault.admin);
        
        vault.in_execution = false;
    }

    // ========== View Functions ==========

    /// @notice Gets the claimable amount for a beneficiary
    /// @param vault The vesting vault
    /// @param beneficiary Beneficiary address
    /// @param schedule_index Schedule index
    /// @param current_time Current epoch time
    /// @return Claimable amount
    public fun get_claimable_amount(
        vault: &VestingVault,
        beneficiary: address,
        schedule_index: u64,
        current_time: u64
    ): u64 {
        if (!table::contains(&vault.schedules, beneficiary)) {
            return 0
        };
        
        let schedules = table::borrow(&vault.schedules, beneficiary);
        if (schedule_index >= vector::length(schedules)) {
            return 0
        };
        
        let schedule = vector::borrow(schedules, schedule_index);
        if (schedule.revoked) {
            return 0
        };
        
        let elapsed_time = current_time - schedule.start_time;
        if (elapsed_time < schedule.cliff_period) {
            return 0
        };
        
        let vested_amount = if (elapsed_time >= schedule.duration) {
            schedule.total_amount
        } else {
            (schedule.total_amount * elapsed_time) / schedule.duration
        };
        
        let claimable = vested_amount - schedule.claimed_amount;
        claimable
    }

    /// @notice Gets the number of vesting schedules for a beneficiary
    /// @param vault The vesting vault
    /// @param beneficiary Beneficiary address
    /// @return Number of schedules
    public fun get_schedule_count(vault: &VestingVault, beneficiary: address): u64 {
        if (table::contains(&vault.schedules, beneficiary)) {
            vector::length(table::borrow(&vault.schedules, beneficiary))
        } else {
            0
        }
    }

    /// @notice Gets the total amount of tokens in the vault
    /// @param vault The vesting vault
    /// @return Total token balance
    public fun get_vault_balance(vault: &VestingVault): u64 {
        balance::value(&vault.token_balance)
    }

    /// @notice Gets the total amount allocated to vesting schedules
    /// @param vault The vesting vault
    /// @return Total allocated
    public fun get_total_allocated(vault: &VestingVault): u64 {
        vault.total_allocated
    }

    /// @notice Gets the available (unallocated) amount in the vault
    /// @param vault The vesting vault
    /// @return Available amount
    public fun get_available_amount(vault: &VestingVault): u64 {
        let total = balance::value(&vault.token_balance);
        let allocated = vault.total_allocated;
        if (total > allocated) {
            total - allocated
        } else {
            0
        }
    }
} 