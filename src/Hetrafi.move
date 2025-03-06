// Marketplace module - Handles automatic 5% fee deductions
module hetracoin::Hetrafi {
    use sui::coin;
    use sui::signer;
    use sui::tx_context;
    use sui::object;
    use sui::transfer;

    // Stores the treasury address for collecting fees
    struct Hetrafi has key, store {
        treasury: address,
    }

    // 5% HetraFi fee configuration
    const HETRAFI_FEE_PERCENT: u64 = 500;
    const FEE_DENOMINATOR: u64 = 10_000;

    // Transfers HetraCoin with automatic 5% fee deduction
    public fun transfer_with_fee(sender: &signer, recipient: address, amount: u64): (coin::Coin<HetraCoin>, coin::Coin<HetraCoin>) {
        let marketplace = object::borrow_global<Hetrafi>(signer::address_of(sender));
        let fee_amount = (amount * HETRAFI_FEE_PERCENT) / FEE_DENOMINATOR;
        let final_amount = amount - fee_amount;

        let transferred = coin::withdraw<HetraCoin>(&signer::address_of(sender), final_amount);
        let fee = coin::withdraw<HetraCoin>(&signer::address_of(sender), fee_amount);

        transfer::public_transfer(transferred, recipient);
        transfer::public_transfer(fee, marketplace.treasury);

        (transferred, fee)
    }
}
