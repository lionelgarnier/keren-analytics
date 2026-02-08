# Phase 4 - Multi-Cloud and Scale

## Goal

Deliver AWS and GCP connectors, add smart alerting, CI/CD integration, and
establish the product as the unified analytics and monitoring entry point
across cloud providers.

## Scope

### AWS Connector

- Implement CloudProvider interface for AWS
- Auth via IAM Identity Center / Assume Role
- CloudWatch Logs Insights query adapter
- X-Ray trace integration for request performance
- CloudWatch RUM support for frontend analytics (when available)
- Mapping for AWS-specific fields to canonical model
- Mock and real client implementation
- End-to-end tests with mocked AWS APIs

### GCP Connector

- Implement CloudProvider interface for GCP
- Auth via Google OAuth / Workload Identity
- Cloud Logging query adapter
- Cloud Trace integration for request performance
- Cloud Monitoring metrics for KPIs
- Mapping for GCP-specific fields to canonical model
- Mock and real client implementation
- End-to-end tests with mocked GCP APIs

### Smart Alerts

- Baseline learning (normal patterns per metric per time-of-day)
- Anomaly detection (statistical deviation, not fixed thresholds)
- Alert channels: in-app, email, Slack, Teams
- Alert suppression (avoid storm during deployments)
- One-click acknowledge and snooze

### Technical Dashboard (Full)

- Real-time mode (30s auto-refresh for "today" range)
- Dependency health map (external services, databases, APIs)
- Error grouping and trending
- Deployment markers on trend charts
- Performance comparison: this deploy vs. previous

### Integrations

- Slack bot: mini-dashboard inline, alert notifications
- Teams connector: same as Slack
- Jira / Azure DevOps: create ticket from alert or anomaly
- CI/CD quality gate: API to check performance regression before merge

### Benchmark (Anonymous)

- Opt-in anonymous benchmark aggregation
- Compare metrics to similar apps (by size, stack, industry)
- "Your error rate is in the top 20% of similar Node.js apps"

## Exit Criteria

- AWS connector working end-to-end with real CloudWatch data
- GCP connector working end-to-end with real Cloud Logging data
- Smart alerts detecting anomalies with < 5% false positive rate
- Slack and Teams integrations delivering alerts and summaries
- CI/CD quality gate API functional
- Benchmark comparison visible for opted-in tenants
