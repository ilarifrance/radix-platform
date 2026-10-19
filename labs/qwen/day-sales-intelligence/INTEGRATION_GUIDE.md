# File Integration Guide

## Overview
This guide outlines the APIs for integrating with the Sales Intelligence lab modules. Nexus CRM schemas have not been inspected, and mapping is required for all fields. Ensure manual review and testing before deployment.

## API Interfaces

### priority-engine.js
- **Function**: `calculatePriority(opportunity)`
- **Input**: `opportunity` (object with `value`, `lastContactAt`, `nextActionAt`, `stage`, `status`)
- **Output**: Priority score (number)
- **Description**: Calculates a priority score based on opportunity value, time since last contact, time until next action, stage, and status.

### stalled-deals.js
- **Function**: `detectStalledDeals(opportunities)`
- **Input**: `opportunities` (array of opportunity objects)
- **Output**: Array of stalled deals (objects)
- **Description**: Identifies stalled deals based on time since last contact and time until next action.

### next-best-action.js
- **Function**: `getNextBestAction(opportunity)`
- **Input**: `opportunity` (object with `stage`, `status`, `lastContactAt`, `nextActionAt`)
- **Output**: Recommended next action (string)
- **Description**: Recommends the next best action based on the current stage, status, and time-related fields.

### pipeline-insights.js
- **Function**: `getPipelineInsights(opportunities)`
- **Input**: `opportunities` (array of opportunity objects)
- **Output**: Insights object (count of stages, status, value distribution)
- **Description**: Provides insights into the pipeline, including stage distribution, status counts, and value distribution.

## Manual Review and Test Checklist

- [ ] Verify that all required fields are present in the input objects.
- [ ] Test edge cases, such as missing or null values.
- [ ] Validate that the output matches expected data types and formats.
- [ ] Confirm that the logic aligns with business rules and use cases.
- [ ] Ensure that the functions do not have side effects.
- [ ] Check for performance considerations when handling large datasets.
- [ ] Review the mapping of Nexus CRM fields to the required input schema.
