import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'

export class EcsFargateAppStack extends cdk.Stack {
  constructor (scope: Construct, id: string, props?: any) {
    const stackName = `${id}-app`
    super(scope, stackName, props)

    const otelRepo = Repository.fromRepositoryName(this, 'OtelRepository', `${id}-otel-app`) as Repository

    // Create a Task Definition for demonstration
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchAgentServerPolicy'
        )
      ]
    })

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchAgentServerPolicy'
        )
      ]
    })
    // Create a security group for the service
    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ServiceSecurityGroup',
      {
        vpc: props.vpc,
        allowAllOutbound: true,
        description: 'Security group for Fargate service'
      }
    )

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow 8080'
    )

    this.createOtelApp(props, serviceSecurityGroup, executionRole, taskRole, otelRepo)
    this.createOtelWithCollectorApp(props, serviceSecurityGroup, executionRole, taskRole, otelRepo)
  }

  createOtelApp (
    props: any,
    serviceSecurityGroup: ec2.SecurityGroup,
    executionRole: iam.Role,
    taskRole: iam.Role,
    otelRepository: Repository
  ) {
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'OtelTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: executionRole,
      taskRole: taskRole
    })
    const serviceName = 'java-hello-demo'
    const region = cdk.Stack.of(this).region

    // Collector-less: Direct OTLP export to CloudWatch
    taskDefinition.addContainer('JavaHelloContainer', {
      image: ecs.ContainerImage.fromEcrRepository(otelRepository),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'otel-container',
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `https://xray.${region}.amazonaws.com/v1/traces`,
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `https://logs.${region}.amazonaws.com/v1/logs`,
        OTEL_EXPORTER_OTLP_LOGS_HEADERS: `x-aws-log-group=${serviceName}-logs,x-aws-log-stream=default`,
        OTEL_TRACES_SAMPLER: 'xray',
        OTEL_SERVICE_NAME: serviceName,
        OTEL_RESOURCE_ATTRIBUTES: `service.name=${serviceName}`,
        AWS_REGION: region
      }
    })

    // Create a Fargate service
    const service = new ecs.FargateService(this, 'JavaHelloService', {
      cluster: props.cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [serviceSecurityGroup]
    })
  }

  createOtelWithCollectorApp (
    props: any,
    serviceSecurityGroup: ec2.SecurityGroup,
    executionRole: iam.Role,
    taskRole: iam.Role,
    otelRepository: Repository
  ) {
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'OtelWithCollectorTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: executionRole,
      taskRole: taskRole
    })
    const serviceName = 'java-hello-with-collector'
    const region = cdk.Stack.of(this).region

    // App container sends to local collector
    taskDefinition.addContainer('JavaHelloWithCollectorContainer', {
      image: ecs.ContainerImage.fromEcrRepository(otelRepository),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'otel-with-collector-container',
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        OTEL_METRICS_EXPORTER: 'otlp',
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        OTEL_TRACES_SAMPLER: 'xray',
        OTEL_SERVICE_NAME: serviceName,
        OTEL_RESOURCE_ATTRIBUTES: `service.name=${serviceName}`,
        AWS_REGION: region
      }
    })

    // ADOT Collector sidecar with awsproxy for X-Ray remote sampling
    taskDefinition.addContainer('AdotCollector', {
      image: ecs.ContainerImage.fromRegistry(
        'public.ecr.aws/aws-observability/aws-otel-collector:latest'
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'adot-collector',
        logRetention: logs.RetentionDays.ONE_WEEK
      }),
      portMappings: [
        { containerPort: 4318 },
        { containerPort: 4317 },
        { containerPort: 2000 }
      ],
      environment: {
        AOT_CONFIG_CONTENT: JSON.stringify({
          extensions: {
            awsproxy: {}
          },
          receivers: {
            otlp: {
              protocols: {
                http: { endpoint: '0.0.0.0:4318' },
                grpc: { endpoint: '0.0.0.0:4317' }
              }
            }
          },
          exporters: {
            awsxray: {},
            awscloudwatchlogs: {
              log_group_name: `${serviceName}-logs`,
              log_stream_name: 'default'
            }
          },
          service: {
            extensions: ['awsproxy'],
            pipelines: {
              traces: {
                receivers: ['otlp'],
                exporters: ['awsxray']
              },
              logs: {
                receivers: ['otlp'],
                exporters: ['awscloudwatchlogs']
              }
            }
          }
        })
      }
    })

    // Create a Fargate service
    const service = new ecs.FargateService(this, 'JavaHelloWithCollectorService', {
      cluster: props.cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [serviceSecurityGroup]
    })
  }
}
