# cloudwatch-collector-less-demo

Demo application showing CloudWatch OTLP integration with auto-instrumentation.

## Features

- Express.js REST API
- Winston logging with OpenTelemetry auto-instrumentation
- CloudWatch OTLP export without collector

## Setup

```bash
cd app
npm install
npm start
```

## Dependencies

- `winston` - Logging library
- `@opentelemetry/winston-transport` - Required for automatic log record export
- `@aws/aws-distro-opentelemetry-node-autoinstrumentation` - Auto-instrumentation

## Endpoints

- `GET /` - Hello World
- `GET /health` - Health check
