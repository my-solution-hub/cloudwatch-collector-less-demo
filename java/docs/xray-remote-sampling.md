# X-Ray Remote Sampling 配置指南

## 概述

本文档介绍如何在 ECS Fargate 上为 ADOT Java Agent 配置 X-Ray Remote Sampling，实现通过 AWS 控制台动态调整采样率，无需重新部署应用。

## 原理

### 采样决策流程

```
┌────────────────────────────────────────────────────────────────┐
│                    AWS X-Ray Console                           │
│  ┌────────────────────────────────────────────────────────┐          │
│  │  Sampling Rules:                                       │    │
│  │  - hello-demo: ServiceName=java-hello-with-collector  50%    │    │
│  │  - Default: *  10%                                     │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────┬─────────────────────────────────────────┘
                       │ GetSamplingRules API
                       ▼
┌─────────────────────────────────────────────────────────┐
│              ECS Fargate Task (Sidecar 模式)             │
│                                                          │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  Java App         │    │  ADOT Collector Sidecar    │  │
│  │                   │    │                            │  │
│  │  ADOT Java Agent  │    │  ┌──────────────────────┐ │  │
│  │  xray sampler ────┼───►│  │ awsproxy extension   │ │  │
│  │  (localhost:2000) │    │  │ (port 2000)          │ │  │
│  │                   │    │  └──────────┬───────────┘ │  │
│  │  traces ──────────┼───►│  otlp receiver (4318)    │  │
│  │                   │    │  awsxray exporter ───────►│──► X-Ray
│  └──────────────────┘    └───────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 关键组件

1. **ADOT Java Agent** (`OTEL_TRACES_SAMPLER=xray`)
   - 启动时连接 `http://localhost:2000` 获取 X-Ray 采样规则
   - 默认每 300 秒轮询一次规则更新
   - 根据 `service.name` 资源属性匹配采样规则

2. **ADOT Collector `awsproxy` 扩展**
   - 在 `localhost:2000` 上运行 TCP 代理
   - 代理 Java Agent 的请求到 X-Ray API（自动处理 SigV4 签名）
   - Agent 本身不具备直接调用 X-Ray HTTPS API 的能力，必须通过此代理

3. **X-Ray Sampling Rules**（AWS 控制台配置）
   - 通过 `ServiceName` 匹配 OTel 的 `service.name` 资源属性
   - `FixedRate` 控制采样百分比（0.0 ~ 1.0）
   - `ReservoirSize` 保证每秒最少采样数量
   - `Priority` 数值越小优先级越高

### 为什么 Collector-less 模式不支持 Remote Sampling

Collector-less 模式下没有 ADOT Collector sidecar 运行，因此 `localhost:2000` 不可达。`xray` sampler 无法获取远程采样规则，会 fallback 到 X-Ray 默认行为（约 5-10%）。如需在 collector-less 模式下控制采样率，可使用本地采样器如 `parentbased_traceidratio`。

## 配置

### IAM 权限

Task Role 需要以下权限（`CloudWatchAgentServerPolicy` 已包含）：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets",
        "xray:GetSamplingStatisticSummaries"
      ],
      "Resource": "*"
    }
  ]
}
```

### X-Ray Sampling Rules（AWS 控制台）

本次测试使用的采样规则配置：

| Rule Name    | Priority | ServiceName                | FixedRate | ReservoirSize |
|-------------|----------|----------------------------|-----------|---------------|
| hello-demo  | 1        | java-hello-with-collector  | 0.5 (50%) | 1             |
| Default     | 10000    | *                          | 0.1 (10%) | 1             |

> 注意：`hello-demo2` 规则虽然配置了 50%，但 collector-less 服务因无法获取远程规则而不会生效。

### ECS Task Definition（With-Collector 服务）

部署后的实际 Task Definition 包含两个容器：

**App 容器** — ADOT Java Agent 自动注入，`xray` sampler 连接 `localhost:2000`：

```json
{
  "name": "JavaHelloWithCollectorContainer",
  "image": "613477150601.dkr.ecr.ap-southeast-1.amazonaws.com/java-hello-demo-otel-app:latest",
  "portMappings": [{ "containerPort": 8080 }],
  "environment": {
    "OTEL_SERVICE_NAME": "java-hello-with-collector",
    "OTEL_RESOURCE_ATTRIBUTES": "service.name=java-hello-with-collector",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
    "OTEL_TRACES_SAMPLER": "xray",
    "AWS_REGION": "ap-southeast-1"
  }
}
```

**ADOT Collector Sidecar** — 启用 `awsproxy` 扩展，暴露 port 2000：

```json
{
  "name": "AdotCollector",
  "image": "public.ecr.aws/aws-observability/aws-otel-collector:latest",
  "portMappings": [
    { "containerPort": 4317 },
    { "containerPort": 4318 },
    { "containerPort": 2000 }
  ],
  "environment": {
    "AOT_CONFIG_CONTENT": {
      "extensions": {
        "awsproxy": {}
      },
      "receivers": {
        "otlp": {
          "protocols": {
            "http": { "endpoint": "0.0.0.0:4318" },
            "grpc": { "endpoint": "0.0.0.0:4317" }
          }
        }
      },
      "exporters": {
        "awsxray": {},
        "awscloudwatchlogs": {
          "log_group_name": "java-hello-with-collector-logs",
          "log_stream_name": "default"
        }
      },
      "service": {
        "extensions": ["awsproxy"],
        "pipelines": {
          "traces": {
            "receivers": ["otlp"],
            "exporters": ["awsxray"]
          },
          "logs": {
            "receivers": ["otlp"],
            "exporters": ["awscloudwatchlogs"]
          }
        }
      }
    }
  }
}
```

关键配置点：
- `extensions.awsproxy`: 声明 awsproxy 扩展（默认监听 `0.0.0.0:2000`）
- `service.extensions: ["awsproxy"]`: 激活该扩展
- `containerPort: 2000`: 暴露代理端口供 App 容器访问

### CDK 代码（app-stack.ts 核心片段）

```typescript
// App 容器 — xray sampler 通过 localhost:2000 获取远程采样规则
taskDefinition.addContainer('JavaHelloWithCollectorContainer', {
  image: ecs.ContainerImage.fromEcrRepository(otelRepository),
  portMappings: [{ containerPort: 8080 }],
  environment: {
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    OTEL_TRACES_SAMPLER: 'xray',  // 关键：启用 X-Ray 远程采样
    OTEL_SERVICE_NAME: serviceName,
    OTEL_RESOURCE_ATTRIBUTES: `service.name=${serviceName}`,
    AWS_REGION: region
  }
})

// ADOT Collector Sidecar — 启用 awsproxy 扩展
taskDefinition.addContainer('AdotCollector', {
  image: ecs.ContainerImage.fromRegistry(
    'public.ecr.aws/aws-observability/aws-otel-collector:latest'
  ),
  portMappings: [
    { containerPort: 4318 },
    { containerPort: 4317 },
    { containerPort: 2000 }  // 关键：awsproxy 端口
  ],
  environment: {
    AOT_CONFIG_CONTENT: JSON.stringify({
      extensions: { awsproxy: {} },          // 声明扩展
      receivers: { otlp: { protocols: { http: { endpoint: '0.0.0.0:4318' }, grpc: { endpoint: '0.0.0.0:4317' } } } },
      exporters: { awsxray: {}, awscloudwatchlogs: { log_group_name: `${serviceName}-logs`, log_stream_name: 'default' } },
      service: {
        extensions: ['awsproxy'],            // 激活扩展
        pipelines: {
          traces: { receivers: ['otlp'], exporters: ['awsxray'] },
          logs: { receivers: ['otlp'], exporters: ['awscloudwatchlogs'] }
        }
      }
    })
  }
})
```

## 测试验证

### 流量生成脚本

使用 `java/scripts/generate-traffic.sh` 自动化测试：

```bash
AWS_REGION=ap-southeast-1 bash java/scripts/generate-traffic.sh 5 10 30 60
```

参数说明：`[线程数] [每服务持续秒数] [服务间间隔秒数] [trace 等待秒数]`

脚本流程：
1. 自动发现 ECS 服务的公网 IP
2. 按顺序向两个服务发送并发流量（中间间隔 30 秒）
3. 等待 60 秒让 trace 被 X-Ray 摄入
4. 查询 X-Ray API 获取 trace 数量
5. 输出采样率报告

### 测试结果

#### 测试 1：with-collector 100% 采样率

配置 `hello-demo` 规则 FixedRate=1.0 时：

```
=========================================
           SAMPLING REPORT
=========================================

Service                     Requests     Traces       Rate
------------------------- ---------- ---------- ----------
java-hello-demo                  242         17       7.0%
java-hello-with-collector        211        211     100.0%
```

- `java-hello-with-collector`: **100%** ✅ 完全匹配自定义规则
- `java-hello-demo` (collector-less): **7.0%** ≈ Default 规则 10%（无 awsproxy，无法获取远程规则）

#### 测试 2：with-collector 50% 采样率

将 `hello-demo` 规则 FixedRate 改为 0.5 后：

```
=========================================
           SAMPLING REPORT
=========================================

Service                     Requests     Traces       Rate
------------------------- ---------- ---------- ----------
java-hello-demo                  210         23      11.0%
java-hello-with-collector        220        118      53.6%
```

- `java-hello-with-collector`: **53.6%** ≈ 50% ✅ 规则动态生效，无需重新部署
- `java-hello-demo` (collector-less): **11.0%** ≈ Default 规则 10%（行为不变）

## 总结

| 部署模式 | Remote Sampling 支持 | 原因 |
|---------|---------------------|------|
| With Collector (sidecar) | ✅ 支持 | awsproxy 扩展在 localhost:2000 代理 X-Ray API |
| Collector-less | ❌ 不支持 | 无 awsproxy，agent 无法获取远程采样规则 |

核心要点：
- `OTEL_TRACES_SAMPLER=xray` 让 ADOT Java Agent 使用 X-Ray 远程采样
- Agent 默认连接 `http://localhost:2000`（awsproxy）获取规则，不支持直接调用 X-Ray HTTPS API
- ADOT Collector 配置中必须同时声明和激活 `awsproxy` 扩展
- 采样规则通过 `service.name` 资源属性匹配，在 AWS 控制台修改后无需重新部署即可生效

## 参考

- [ADOT Java Agent Remote Sampling](https://aws-otel.github.io/docs/getting-started/java-sdk/auto-instr/)
- [Configuring the OpenTelemetry Collector for X-Ray Remote Sampling](https://aws-otel.github.io/docs/getting-started/remote-sampling)
- [X-Ray Sampling Rules](https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html)
