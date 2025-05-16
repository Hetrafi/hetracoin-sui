# HetraCoin - Sui Blockchain Token Ecosystem

HetraCoin is a comprehensive token ecosystem built on the Sui blockchain using the Move programming language, designed with security and scalability as its primary focus.

## Overview

HetraCoin provides a robust, secure token infrastructure with multiple integrated components:

- **HetraCoin:** Core token implementation with dynamic admin management
- **Governance:** Secure administration and token supply management
- **Treasury:** Timelock-protected fund management
- **Escrow:** Secure peer-to-peer transactions with dispute resolution
- **Staking:** Token staking system with rewards
- **LiquidityPool:** Decentralized token exchange functionality
- **Proposal:** On-chain governance voting mechanism

## Essential Modules for Token Listing

For token listing purposes, only a subset of modules is initially required:

- **HetraCoin:** Essential for the token itself and admin management
- **Governance:** Required for token administration, minting and burning
- **Treasury:** For secure fund management

The remaining modules (Staking, Proposal, Escrow, LiquidityPool, Hetrafi) will be deployed later as the platform develops. This phased approach allows for focused security auditing on the core token functionality first.

## Security Features

HetraCoin implements multiple layers of security:

- **Capability-based security model:** Access control through capability objects
- **Emergency pause mechanism:** Admin-controlled system pause for incident response
- **Two-phase admin transfers:** Requiring explicit acceptance by the new admin
- **Treasury timelock:** Enforced delay period for treasury withdrawals
- **Admin registry:** Single source of truth for current admin validation
- **Event transparency:** Comprehensive event emission for all critical operations

## Project Structure

```
sources/
  ├── HetraCoin.move      # Core token implementation
  ├── Governance.move     # Admin and mint/burn security
  ├── Treasury.move       # Fund management with timelock
  └── docs/               # Documentation
      └── audit-readiness.md  # Audit preparation guide

future_contracts/phase_2/
  ├── Staking.move        # Token staking functionality (ready for upgrade)
  ├── Escrow.move         # P2P transaction security
  ├── LiquidityPool.move  # Exchange functionality
  ├── Proposal.move       # Governance voting
  └── Hetrafi.move        # Ecosystem integration

tests/
  ├── unit/               # Unit tests
  │   ├── StakingTest.move
  │   └── StakingBatchTest.move 
  └── integration/        # Integration tests
  
```

## Audit Readiness

HetraCoin has been designed with audit readiness in mind:

### Security Audit Preparation

We've implemented best practices from the Move and Sui ecosystems to prepare for professional security audits:

1. **Comprehensive Documentation**
   - Detailed module-level documentation
   - Security model explanation
   - Privilege flow documentation
   - Event schema documentation

2. **Defense-in-Depth Strategy**
   - Multi-layered security controls
   - Capability-based authorization
   - Runtime assertions for invariants
   - Proper error handling with descriptive codes

3. **Testing Framework**
   - Unit tests for isolated functionality
   - Integration tests for module interactions
   - Security-focused tests for edge cases
   - Formal validation of critical properties

4. **Security Features**
   - Emergency pause mechanism
   - Event transparency for monitoring
   - Timelock protections for high-value operations
   - Strict validation of user inputs

5. **Audit-Specific Documentation**
   - See `sources/docs/audit-readiness.md` for a comprehensive guide for auditors
   - Known limitations and future roadmap
   - Critical security areas with risk evaluation
   - Suggested audit focus areas

### Critical Components

The following areas deserve particular attention during security review:

- Admin capability management (`HetraCoin.move` and `Governance.move`)
- Token minting/burning authorization (`Governance.move`) 
- Treasury fund security (`Treasury.move`)
- Emergency pause functionality (`HetraCoin.move`)
- Reentrancy protection in fund handling (`LiquidityPool.move`)

## Upgradeability

HetraCoin is designed with upgradeability in mind, allowing the contract to evolve while maintaining all existing objects and balances:

- **Additive Upgrades:** New modules and functions can be added without disrupting existing functionality
- **Package Versioning:** The Sui blockchain maintains package versioning automatically
- **Upgrade Capability:** Protected by the admin account for secure upgrades
- **Documentation:** Comprehensive upgrade guide available at `docs/UPGRADEABILITY_GUIDE.md`

### Recently Added - Staking Module

The Staking module has been added to enable token holders to:

- Stake HETRA tokens and earn rewards
- Participate in governance based on stake amounts
- Lock tokens for predetermined periods for enhanced rewards
- Track staking history and rewards through on-chain events

### Upgrade Process

For developers and administrators looking to upgrade the HetraCoin ecosystem:

1. Prepare new modules or modify existing ones following compatibility guidelines
2. Build and test the upgrade in a testnet environment
3. Use the `sui client upgrade` command with the correct upgrade capability
4. Verify the upgrade was successful by testing new functionality

Full step-by-step instructions are available in the `docs/UPGRADEABILITY_GUIDE.md` file, including:
- Detailed walkthrough for adding new modules
- Troubleshooting common upgrade issues
- Best practices for secure upgrades

## Development

### Prerequisites

- Sui CLI (version 1.48.0 or higher)
- Move language extension for your editor
- Node.js and npm for TypeScript deployment scripts

### Building

```
sui move build
```

### Testing

```
sui move test
```

### Deployment and Upgrades

```
# Initial deployment
npm run deploy:phase1:testnet

# Upgrade with new modules
npm run upgrade:testnet
```

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Contact

For security-related inquiries: security@hetrafi.com
For general development questions: cavan@hetrafi.com

---