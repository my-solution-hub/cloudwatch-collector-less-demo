# CloudWatch OTLP Demo Application

Node.js Hello World application with CloudWatch OTLP integration for collector-less telemetry.

## Prerequisites

1. **Enable Transaction Search** in CloudWatch (required for traces)
2. **IAM Permissions** - Attach these policies to your execution role:
   - `AWSXrayWriteOnlyPolicy` (for traces)
   - Custom policy for logs:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [{
         "Effect": "Allow",
         "Action": [
           "logs:PutLogEvents",
           "logs:DescribeLogGroups",
           "logs:DescribeLogStreams"
         ],
         "Resource": "arn:aws:logs:*:*:log-group:*"
       }]
     }
     ```

3. **Create CloudWatch Log Group** (before running):
   ```bash
   aws logs create-log-group --log-group-name hello-world-logs --region us-east-1
   ```

## Installation

```bash
cd app
npm install
```

## Configuration

Copy `.env.example` and adjust values:
- `AWS_REGION`: Your AWS region
- `SERVICE_NAME`: Application name
- Log group/stream names in `OTEL_EXPORTER_OTLP_LOGS_HEADERS`

## Running

### Option 1: Using start script
```bash
chmod +x start.sh
./start.sh
```

### Option 2: Using npm
```bash
npm start
```

### Option 3: Manual with environment variables
```bash
export AWS_REGION=us-east-1
OTEL_METRICS_EXPORTER=none \
OTEL_TRACES_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xray.us-east-1.amazonaws.com/v1/traces \
OTEL_LOGS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://logs.us-east-1.amazonaws.com/v1/logs \
OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=hello-world-logs,x-aws-log-stream=default \
OTEL_RESOURCE_ATTRIBUTES="service.name=hello-world-demo,deployment.environment=dev,aws.log.group.names=hello-world-logs" \
node --require '@aws/aws-distro-opentelemetry-node-autoinstrumentation/register' index.js
```

## Testing

```bash
# Hello World endpoint
curl http://localhost:3000/

# Health check
curl http://localhost:3000/health
```

## Viewing Telemetry

- **Traces**: CloudWatch Console → X-Ray → Traces (stored in `aws/spans` log group)
- **Logs**: CloudWatch Console → Log Groups → `hello-world-logs`
- **Correlation**: View logs and metrics correlated with traces in CloudWatch Console

## Notes

- Requires ADOT JavaScript version 0.7.0 or later
- Log group and stream must exist before starting the application
- Traces are automatically sent to X-Ray OTLP endpoint
- Logs from log4js are captured and sent to CloudWatch OTLP endpoint
