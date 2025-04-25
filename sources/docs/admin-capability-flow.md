# Admin Capability Flow

## Overview

This document details the capability-based security model implemented in the HetraCoin ecosystem. The system utilizes a carefully designed capability flow to ensure that only authorized users can perform privileged operations such as minting tokens, changing governance parameters, or handling treasury funds.

## Core Capability Types

HetraCoin employs several distinct capability types, each with specific security properties:

### 1. AdminRegistry

**Type**: Shared object (`key, store`)  
**Purpose**: Single source of truth for the current admin address  
**Location**: `HetraCoin.move`

The AdminRegistry is a shared object that serves as the definitive record of the current admin address. All administrative actions require validation against this registry. As a shared object, it is accessible by any transaction but can only be modified through proper authorized channels.

```move
struct AdminRegistry has key, store {
    id: UID,
    admin: address,
    pending_admin: Option<address>,
    pending_admin_deadline: Option<u64>,
}
```

### 2. TreasuryCap

**Type**: Owned object from Sui framework  
**Purpose**: Controls minting and burning capabilities  
**Location**: Created at module initialization, used in `Governance.move`

The TreasuryCap is a standard Sui capability that grants the ability to mint and burn tokens. It is initially owned by the deployer and then transferred to the governance system.

```move
// From sui::coin
struct TreasuryCap<phantom T> has key, store { ... }
```

### 3. EmergencyPauseState

**Type**: Shared object (`key`)  
**Purpose**: Controls system-wide pause functionality  
**Location**: `HetraCoin.move`

This shared object tracks whether the system is in a paused state. When paused, critical operations like minting are disabled.

```move
struct EmergencyPauseState has key {
    id: UID,
    is_paused: bool,
    pause_reason: Option<String>,
    paused_at: Option<u64>,
}
```

## Authorization Flow

### Admin Verification Flow

1. **Request Phase**: 
   - Caller initiates an admin-only operation
   - System retrieves the AdminRegistry shared object
   - AdminRegistry.admin is compared with transaction sender

2. **Verification Phase**:
   - If sender == AdminRegistry.admin, operation is allowed
   - Otherwise, operation is aborted with ENOT_AUTHORIZED error

3. **Execution Phase**:
   - Admin-only operation is executed
   - Event is emitted for transparency and auditability

### Admin Transfer Flow

The admin transfer follows a two-phase process for security:

1. **Initiation Phase**:
   - Current admin calls `change_admin(registry, new_admin_address, ctx)`
   - System sets AdminRegistry.pending_admin = Option::some(new_admin_address)
   - System sets AdminRegistry.pending_admin_deadline = Option::some(current_epoch + ADMIN_TRANSFER_WINDOW)
   - AdminTransferInitiated event is emitted

2. **Acceptance Phase**:
   - New admin calls `accept_admin(registry, ctx)`
   - System verifies ctx.sender() == AdminRegistry.pending_admin.value
   - System verifies current_epoch <= AdminRegistry.pending_admin_deadline.value
   - AdminRegistry.admin is updated to new admin
   - AdminRegistry.pending_admin is reset to Option::none()
   - AdminTransferCompleted event is emitted

3. **Timeout Case**:
   - If acceptance phase does not occur before deadline:
   - AdminRegistry.pending_admin and deadline are automatically reset on next admin operation
   - AdminTransferTimedOut event is emitted

### Treasury Operations Flow

1. **Request Phase**:
   - Admin initiates a treasury withdrawal request
   - System verifies admin status via AdminRegistry
   - System creates a WithdrawalRequest with timelock expiration

2. **Timelock Phase**:
   - WithdrawalRequest enters mandatory waiting period
   - Request cannot be executed until timelock expires

3. **Execution Phase**:
   - Admin executes withdrawal after timelock period
   - System verifies timelock has expired
   - System verifies executor is still the authorized admin
   - Funds are transferred to specified recipient
   - WithdrawalCompleted event is emitted

## Capability Integration Examples

### Minting Tokens

```move
// In Governance.move
public entry fun mint(
    registry: &AdminRegistry,
    treasury_cap: &mut TreasuryCap<HETRACOIN>,
    recipient: address, 
    amount: u64,
    ctx: &mut TxContext
) {
    // Verify caller is current admin
    assert!(HetraCoin::is_current_admin(registry, ctx.sender()), ENOT_AUTHORIZED);
    
    // Check emergency pause state
    let pause_state = object::borrow_global<EmergencyPauseState>(@hetracoin);
    assert!(!pause_state.is_paused, ESYSTEM_PAUSED);
    
    // Perform minting operation
    let coins = coin::mint(treasury_cap, amount, ctx);
    
    // Transfer to recipient
    transfer::public_transfer(coins, recipient);
    
    // Emit event for transparency
    event::emit(MintEvent {
        admin: ctx.sender(),
        recipient,
        amount,
        timestamp: timestamp::now_seconds(ctx),
    });
}
```

### Changing Admin

```move
// In HetraCoin.move
public entry fun change_admin(
    registry: &mut AdminRegistry,
    new_admin: address,
    ctx: &mut TxContext
) {
    // Verify caller is current admin
    assert!(is_current_admin(registry, ctx.sender()), ENOT_AUTHORIZED);
    
    // Set pending admin with deadline
    let current_epoch = epoch::epoch(ctx);
    registry.pending_admin = option::some(new_admin);
    registry.pending_admin_deadline = option::some(current_epoch + ADMIN_TRANSFER_WINDOW);
    
    // Emit event
    event::emit(AdminTransferInitiated {
        current_admin: ctx.sender(),
        proposed_admin: new_admin,
        deadline_epoch: current_epoch + ADMIN_TRANSFER_WINDOW,
    });
}

public entry fun accept_admin(
    registry: &mut AdminRegistry,
    ctx: &mut TxContext
) {
    // Verify there is a pending admin
    assert!(option::is_some(&registry.pending_admin), ENO_PENDING_ADMIN);
    
    // Verify caller is the pending admin
    let pending_admin = *option::borrow(&registry.pending_admin);
    assert!(ctx.sender() == pending_admin, ENOT_PENDING_ADMIN);
    
    // Verify within deadline
    let current_epoch = epoch::epoch(ctx);
    let deadline = *option::borrow(&registry.pending_admin_deadline);
    assert!(current_epoch <= deadline, EADMIN_TRANSFER_EXPIRED);
    
    // Complete transfer
    let previous_admin = registry.admin;
    registry.admin = pending_admin;
    registry.pending_admin = option::none();
    registry.pending_admin_deadline = option::none();
    
    // Emit event
    event::emit(AdminTransferCompleted {
        previous_admin,
        new_admin: pending_admin,
        completion_epoch: current_epoch,
    });
}
```

## Security Considerations

### Capability Rotation

The system supports secure rotation of capabilities:
- Admin transfers require explicit acceptance by new admin
- Timelock window provides safety against compromised accounts
- Events provide transparency for monitoring

### Capability Compromise Recovery

If an admin capability is compromised:
1. **Detection**: Monitor events for unexpected admin operations
2. **Emergency Response**:
   - Use emergency pause to freeze critical operations
   - Implement recovery through governance
3. **Recovery Process**:
   - Deploy recovery module with special privileges
   - Validate community consensus for recovery action
   - Transfer admin capabilities to new secure address

### Best Practices

1. **Multi-Signature Admin**: Consider using a multi-sig wallet as the admin address
2. **Cold Storage**: Keep capability objects in cold storage when not in use
3. **Regular Audits**: Frequently verify admin operations through event logs
4. **Gradual Privilege**: Consider splitting admin capabilities by function
5. **Monitoring**: Implement off-chain monitoring of admin-related events

## Event Monitoring

All capability operations emit events that should be monitored:

| Event | Purpose | Critical Fields |
|-------|---------|----------------|
| AdminTransferInitiated | Signals start of admin transfer | current_admin, proposed_admin, deadline_epoch |
| AdminTransferCompleted | Signals completion of admin transfer | previous_admin, new_admin, completion_epoch |
| AdminTransferTimedOut | Signals expired admin transfer | current_admin, proposed_admin |
| SystemPaused | Signals emergency pause | admin, reason, timestamp |
| SystemUnpaused | Signals emergency unpause | admin, duration, timestamp |
| MintEvent | Records token minting | admin, recipient, amount, timestamp |

## Recovery Procedures

### Process for Compromised Admin Capability

1. **Immediate Actions**:
   - Activate emergency pause through any available admin account
   - Alert team and community through off-chain channels
   - Document evidence of compromise

2. **Assessment**:
   - Identify scope of compromise (which capabilities affected)
   - Determine if timelock-protected operations are pending
   - Estimate potential impact and required recovery steps

3. **Recovery**:
   - Implement emergency recovery module to force-transfer admin capability
   - Obtain community consensus for recovery steps
   - Execute recovery transaction to establish new secure admin

4. **Post-Recovery**:
   - Conduct thorough security review
   - Update security procedures based on lessons learned
   - Consider implementing additional safeguards (e.g., multi-sig)

## Conclusion

The capability-based security model in HetraCoin provides strong guarantees for privileged operations while enabling secure administrative transitions. By combining shared objects for verification with owned capabilities for authorization, the system creates a robust security architecture that protects against unauthorized access while maintaining operational flexibility.

For auditors and developers, understanding this capability flow is essential to properly evaluate the security of the entire HetraCoin ecosystem. 