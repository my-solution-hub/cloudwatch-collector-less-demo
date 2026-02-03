# Java CloudWatch Collector-less Demo

Spring Boot REST API demonstrating direct CloudWatch OTLP integration with OpenTelemetry auto-instrumentation.

## Features

- Spring Boot REST API
- OpenTelemetry Java Agent auto-instrumentation
- Direct OTLP export to CloudWatch (no collector needed)
- ECS Fargate deployment with CDK

## Architecture

The application uses the AWS Distro for OpenTelemetry (ADOT) Java agent to automatically instrument the application and send telemetry directly to AWS services via OTLP:

``` text
Java App + ADOT Agent → X-Ray (traces)
                      → CloudWatch Logs (logs)
```

No separate collector container is required.

## Project Structure

``` text
java/
├── apps/hello/          # Spring Boot application
│   ├── src/            # Application source code
│   ├── agent/          # ADOT Java agent JAR
│   ├── Dockerfile      # Container image definition
│   └── pom.xml         # Maven dependencies
└── cdk/                # Infrastructure as Code
    ├── lib/
    │   ├── app-stack.ts      # ECS Fargate task definition
    │   ├── docker-stack.ts   # ECR repository
    │   └── infra-stack.ts    # VPC and ECS cluster
    └── bin/cdk.ts            # CDK app entry point
```

## Setup

### Prerequisites

- AWS CLI configured
- Docker installed
- Node.js and npm (for CDK)
- Java 11+ and Maven

### Build Application

```bash
cd apps/hello
./mvnw clean package
```

### Deploy Infrastructure

```bash
cd cdk
npm install
cdk bootstrap  # First time only

export STACK_NAME=java-hello-demo
cdk deploy ${STACK_NAME}-docker --require-approval never

cd ..
sh './apps/hello/build.sh'

cd cdk
cdk deploy ${STACK_NAME}-infra --require-approval never
cdk deploy ${STACK_NAME}-app --require-approval never
```

### Build and Push Docker Image

```bash
cd apps/hello
# Get ECR repository URI from CDK output
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com

docker build --build-arg PLATFORM=amd64 -t <ecr-repo-uri>:latest .
docker push <ecr-repo-uri>:latest
```

## Configuration

The CDK stack configures the following environment variables for collector-less operation:

### Traces (sent to X-Ray)

- `OTEL_TRACES_EXPORTER=otlp` - Enable OTLP trace export
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` - Use HTTP protocol
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xray.<region>.amazonaws.com/v1/traces` - X-Ray OTLP endpoint

### Logs (sent to CloudWatch Logs)

- `OTEL_LOGS_EXPORTER=otlp` - Enable OTLP log export
- `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf` - Use HTTP protocol
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://logs.<region>.amazonaws.com/v1/logs` - CloudWatch Logs OTLP endpoint
- `OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=java-hello-demo-logs,x-aws-log-stream=default` - Log group and stream

### Metrics

- `OTEL_METRICS_EXPORTER=none` - Metrics export disabled

### Service Identity

- `OTEL_SERVICE_NAME=java-hello-demo` - Service name for telemetry
- `OTEL_RESOURCE_ATTRIBUTES=service.name=java-hello-demo` - Resource attributes
- `AWS_REGION=<region>` - AWS region

## Key Benefits

- **No Collector Required** - Direct OTLP export to AWS services
- **Auto-Instrumentation** - Zero code changes with Java agent
- **Simplified Architecture** - Single container deployment
- **Unified Observability** - Traces in X-Ray, logs in CloudWatch Logs
