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
  ├── Escrow.move         # P2P transaction security
  ├── Staking.move        # Token staking functionality
  ├── LiquidityPool.move  # Exchange functionality
  ├── Proposal.move       # Governance voting
  ├── Hetrafi.move        # Ecosystem integration
  └── docs/               # Documentation
      └── audit-readiness.md  # Audit preparation guide
tests/
  ├── unit/               # Unit tests
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

## Development

### Prerequisites

- Sui CLI (version 1.0.0 or higher)
- Move language extension for your editor

### Building

```
sui move build
```

### Testing

```
sui move test
```

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Contact

For security-related inquiries: security@hetrafi.com
For general development questions: cavan@hetrafi.com

---

*HetraCoin is currently in development and not yet ready for production use.*


