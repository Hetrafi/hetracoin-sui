# HetraCoin Smart Contract Ecosystem

## Overview
HetraCoin is a comprehensive decentralized cryptocurrency ecosystem built on the Sui blockchain, designed specifically to support and enhance the gaming marketplace Hetrafi [https://hetrafi.com]. The ecosystem integrates advanced smart contract modules including governance, escrow services, liquidity pools, staking rewards, and treasury management, ensuring secure, efficient, and transparent financial operations.

We hope that HetraCoin will bring Hetrafi into the new era of decentralized gaming, offering users the opportunity to earn money by playing their favourite games!

For more information, please visit our website: [https://hetracoin.io]

## Modules & Functionality

### 1. HetraCoin Token (HetraCoin.move)
- Defines the primary cryptocurrency (HETRA) with 9 decimal places
- Implements secure token transfers with integrated event logging
- Handles minting with strict governance controls
- Includes zero-amount transfer protection and overflow checks
- Emits transparent on-chain events for all transfers

### 2. Governance Module (Governance.move)
- Enables token holders to participate in decision-making
- Provides secure minting and burning controls accessible only to authorized administrators
- Includes a two-step governance transfer process requiring explicit acceptance
- Enforces maximum minting limits (1 billion HETRA per transaction)
- Implements time-based expiration for governance transfer requests

### 3. Escrow Service (Escrow.move)
- Facilitates secure peer-to-peer wagers between players
- Incorporates reentrancy protection and rate-limiting for disputes to mitigate spam and security vulnerabilities
- Supports dispute resolution by authorized resolvers, maintaining fair outcomes
- Implements a 24-hour cooldown period between disputes to prevent abuse
- Tracks wager status (active, completed, cancelled) with appropriate event emissions

### 4. Liquidity Pool (LiquidityPool.move)
- Maintains liquidity on decentralized exchanges, stabilizing token price and trading
- Designed to handle high-volume transactions with minimal volatility
- Implements constant product formula (x * y = k) for price determination
- Features optimized fee handling with accumulation and batch processing
- Supports swapping between HETRA and SUI with configurable slippage protection

### 5. Hetrafi Marketplace (Hetrafi.move)
- Handles automatic 5% fee deduction for all marketplace transactions
- Directs fees to a designated treasury address for platform sustainability
- Provides a simple interface for game developers to integrate with the platform
- Ensures transparent fee collection with clear documentation
- Designed for high throughput to support busy gaming marketplaces

### 6. Staking Module (Staking.move)
- Allows token holders to stake HETRA and earn rewards
- Implements configurable reward rates and minimum lock periods
- Features batch processing optimized for scalability and gas efficiency
- Tracks individual stakes with ownership verification
- Emits events for stake creation, reward claims, and withdrawals

### 7. Treasury Management (Treasury.move)
- Manages funds for ongoing operations, growth, and development
- Implements transparency in fund management through event logging
- Restricts withdrawals to authorized administrators only
- Tracks all deposits and withdrawals with timestamp information
- Prevents over-withdrawals with balance verification

## Security and Testing
- Comprehensive integration and unit testing
- Robust security measures such as reentrancy guards, governance restrictions, and rate-limiting for dispute management
- Zero-amount transfer protection to prevent transaction spam
- Overflow checks to ensure mathematical safety
- Two-step governance transfer process to prevent accidental privilege escalation

## Future Enhancements
- Optimization for high-volume staking reward distributions.
- Integration with Hetrafi's game marketplace for seamless token usage.
- Additional security measures and audits to ensure robustness.
- Community-driven governance and feature suggestions.

## License
This project is licensed under the MIT License. See the LICENSE file for details.

## Contact
For any questions or feedback, please contact us at [contact@hetracoin.io].


