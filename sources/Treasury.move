// Treasury module - Securely manages HetraFi platform funds
#[allow(duplicate_alias, unused_use)]
module hetracoin::Treasury {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::coin::{Self, Coin};
    use hetracoin::HetraCoin::HETRACOIN;
    use sui::balance;

    // Treasury struct storing funds
    public struct Treasury has key, store {
        id: UID,
        funds: u64,
        admin: address
    }

    // Event logging for deposits and withdrawals
    public struct DepositEvent has copy, drop {
        sender: address,
        amount: u64,
        timestamp: u64
    }
    
    public struct WithdrawalEvent has copy, drop {
        recipient: address,
        amount: u64,
        timestamp: u64
    }

    // Create a new treasury
    public fun create_treasury(admin: address, ctx: &mut TxContext): Treasury {
        Treasury {
            id: object::new(ctx),
            funds: 0,
            admin
        }
    }

    // Deposit funds into treasury
    public entry fun deposit(
        treasury: &mut Treasury, 
        coin_in: Coin<HETRACOIN>, 
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&coin_in);
        
        // Add funds to treasury
        treasury.funds = treasury.funds + amount;
        
        // Burn the coin
        coin::burn_for_testing(coin_in);

        event::emit(DepositEvent {
            sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }

    // Allows withdrawal (only authorized accounts)
    public entry fun withdraw(
        treasury: &mut Treasury, 
        amount: u64, 
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == treasury.admin, 1); // Only treasury admin can withdraw
        assert!(treasury.funds >= amount, 2); // Prevent over-withdrawals

        treasury.funds = treasury.funds - amount;

        event::emit(WithdrawalEvent {
            recipient: sender,
            amount,
            timestamp: tx_context::epoch(ctx)
        });
    }
}
