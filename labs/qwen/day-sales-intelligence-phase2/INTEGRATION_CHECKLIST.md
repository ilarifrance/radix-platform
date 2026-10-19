# Integration Checklist - Phase 2

## Modules & I/O

- **Opportunity Fetcher**
  - Input: `accountId`
  - Output: `opportunity[]` with `id, name, stage, status, value, currency, lastContactAt, nextActionAt, createdAt`

- **Opportunity Updater**
  - Input: `opportunityId, updates`
  - Output: `success` or `error`

- **Stage Validator**
  - Input: `stage`
  - Output: `valid` or `invalid`

- **Status Validator**
  - Input: `status`
  - Output: `valid` or `invalid`

## Nexus CRM Schema Review

- **Opportunity**
  - `id` (string)
  - `name` (string)
  - `stage` (enum: prospect, qualified, proposal, negotiation, won, lost)
  - `status` (enum: open, won, lost)
  - `value` (number)
  - `currency` (string)
  - `lastContactAt` (date)
  - `nextActionAt` (date)
  - `createdAt` (date)

## Permissions & Security

- All modules must validate input types
- Ensure no direct access to sensitive fields
- Implement role-based access control for update operations
- Validate all enum values before processing

## Tests Required

- Unit tests for each module
- Integration tests for data flow
- Validation tests for enum values
- Error handling tests for invalid inputs
- Security tests for access control

## Notes

- No production or merge operations allowed
- All functions must be deterministic
- No external dependencies or side effects
