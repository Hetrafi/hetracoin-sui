// Treasury module - Securely manages HetraFi platform funds
module hetracoin::Treasury {
    use sui::signer;
    use sui::object;
    use sui::event;

    // Treasury struct storing funds
    struct Treasury has store, key {
        funds: u64
    }

    // Event logging for deposits and withdrawals
    struct DepositEvent has copy, drop {
        sender: address,
        amount: u64,
        timestamp: u64
    }
    struct WithdrawalEvent has copy, drop {
        recipient: address,
        amount: u64,
        timestamp: u64
    }

    // Allows deposit into the treasury
    public entry fun deposit(
        treasury: &mut Treasury, 
        amount: u64, 
        sender: &signer, 
        ctx: &mut tx_context::TxContext
    ) {
        treasury.funds = treasury.funds + amount;

        event::emit<DepositEvent>(DepositEvent {
            sender: signer::address_of(sender),
            amount,
            timestamp: tx_context::timestamp(ctx)
        });
    }

    // Allows withdrawal (only authorized accounts)
    public entry fun withdraw(
        treasury: &mut Treasury, 
        amount: u64, 
        recipient: &signer, 
        ctx: &mut tx_context::TxContext
    ) {
        assert!(signer::address_of(recipient) == 0xTREASURY_ADDRESS, 1); // Only treasury can withdraw
        assert!(treasury.funds >= amount, 2); // Prevent over-withdrawals

        treasury.funds = treasury.funds - amount;

        event::emit<WithdrawalEvent>(WithdrawalEvent {
            recipient: signer::address_of(recipient),
            amount,
            timestamp: tx_context::timestamp(ctx)
        });
    }
}
