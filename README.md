# HetraCoin Smart Contract Ecosystem

## Overview
HetraCoin is a comprehensive decentralized cryptocurrency ecosystem built on the Sui blockchain, designed specifically to support and enhance the gaming marketplace Hetrafi [https://hetrafi.com]. The ecosystem integrates advanced smart contract modules including governance, escrow services, liquidity pools, staking rewards, and treasury management, ensuring secure, efficient, and transparent financial operations.

We hope that HetraCoin will bring Hetrafi into the new era of decentralized gaming, offering users the opportunity to earn money by playing their favourite games!

For more information, please visit our website: [https://hetracoin.io]

## How Hetrafi.move Works with HetraCoin
The Hetrafi.move module serves as the marketplace infrastructure for the HetraCoin ecosystem. Here's how it works:

### 1. Fee Collection Mechanism: 
The transfer_with_fee function automatically deducts a 5% fee from every transaction on the Hetrafi marketplace. This is implemented by splitting the input coin into two parts: 95% for the recipient and 5% for the platform treasury.

### 2. Treasury Integration: 
Fees collected are directed to a designated treasury address, which is stored in the Hetrafi shared object. This ensures all marketplace revenue is properly accounted for and managed.

### 3. Simple Developer Interface: 
Game developers only need to call a single function to handle payments, with fee calculation and distribution handled automatically.

### 4. Transparency: 
All fee calculations are performed on-chain with a fixed percentage, ensuring users always know exactly what fees they're paying.

## HetraCoin Concept and Tokenomics
HetraCoin (HETRA) is designed as the native currency for the Hetrafi gaming marketplace with several key features:

### 1. Token Utility:
- Payment for games and in-game items on Hetrafi
- Staking for passive income
- Liquidity provision rewards
- Governance participation
- Wager currency for peer-to-peer gaming competitions

### 2. Token Economics:
- Fixed maximum supply of 1 trillion tokens (prevents inflation)
- 9 decimal places for microtransactions
- Controlled minting through governance
- Fee recycling through treasury (5% marketplace fee)

### 3. Value Accrual Mechanisms:
- Marketplace fees create buy pressure as the platform grows
- Staking locks tokens, reducing circulating supply
- Governance voting requires token holdings
- Liquidity pools facilitate trading while earning providers fees

### 4. Token Distribution and Sale:
- Initial token sale to fund development
- Strategic partner allocations
- Team allocation with vesting
- Community rewards and airdrops
- Treasury allocation for ongoing development

### 5. Integration with Gaming Ecosystem:
- Players earn tokens by playing games
- Developers receive tokens when their games are played
- Tournament prizes paid in HETRA
- Special items/NFTs purchasable only with HETRA

The HetraCoin ecosystem creates a circular economy where:
- Players purchase HETRA to use on the Hetrafi marketplace
- 5% of transactions go to treasury
- Treasury funds development, costs and staking rewards
- Developers and players earn HETRA
- Value increases as ecosystem usage grows

This creates a sustainable economic model where all participants benefit from the growth of the platform, with built-in mechanisms to maintain token value through controlled supply and continuous utility.

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

This project is licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the LICENSE file in the repository for the full license text.

## Contact
For any questions or feedback, please contact us at [contact@hetracoin.io].


