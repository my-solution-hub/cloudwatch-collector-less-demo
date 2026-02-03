# cloudwatch-collector-less-demo

Demo applications showing CloudWatch OTLP integration with auto-instrumentation, without requiring a separate collector.

## Overview

This repository demonstrates how to send telemetry data (traces, metrics, and logs) directly to CloudWatch using OpenTelemetry auto-instrumentation and the OTLP protocol, eliminating the need for a separate collector deployment.

## Demos

### [Node.js Demo](./nodejs)
Express.js REST API with Winston logging and OpenTelemetry auto-instrumentation.

### [Java Demo](./java)
Coming soon - Java application with OpenTelemetry auto-instrumentation.

## Key Benefits

- **No Collector Required** - Direct OTLP export to CloudWatch
- **Auto-Instrumentation** - Minimal code changes needed
- **Unified Observability** - Traces, metrics, and logs in CloudWatch
