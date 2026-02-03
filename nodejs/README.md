# Node.js CloudWatch Collector-less Demo

Express.js REST API demonstrating direct CloudWatch OTLP integration with auto-instrumentation.

## Features

- Express.js REST API with basic endpoints
- Winston logging with OpenTelemetry transport
- AWS Distro for OpenTelemetry Node.js auto-instrumentation
- Direct OTLP export to CloudWatch (no collector needed)

## Setup

```bash
cd app
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp app/.env.example app/.env
```

Required environment variables:
- `AWS_REGION` - Your AWS region
- `OTEL_EXPORTER_OTLP_ENDPOINT` - CloudWatch OTLP endpoint
- `OTEL_SERVICE_NAME` - Service name for telemetry

## Running

```bash
cd app
npm start
# or
./start.sh
```

## Endpoints

- `GET /` - Hello World
- `GET /health` - Health check

## Generate Traffic

Use the included script to generate test traffic:

```bash
cd scripts
./generate-traffic.sh
```

## Dependencies

- `winston` - Logging library
- `@opentelemetry/winston-transport` - Automatic log record export
- `@aws/aws-distro-opentelemetry-node-autoinstrumentation` - Auto-instrumentation for traces and metrics
