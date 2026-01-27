#!/bin/bash

# Load environment variables
export AWS_REGION=${AWS_REGION:-us-east-1}
export SERVICE_NAME=${SERVICE_NAME:-hello-world-demo}

# OTLP Configuration
export OTEL_METRICS_EXPORTER=none
export OTEL_TRACES_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xray.${AWS_REGION}.amazonaws.com/v1/traces
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://logs.${AWS_REGION}.amazonaws.com/v1/logs
export OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=hello-world-logs,x-aws-log-stream=default
export OTEL_RESOURCE_ATTRIBUTES="service.name=${SERVICE_NAME},deployment.environment=dev,aws.log.group.names=hello-world-logs"

# Start the application
node --require '@aws/aws-distro-opentelemetry-node-autoinstrumentation/register' index.js
