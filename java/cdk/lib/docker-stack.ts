import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ecr from 'aws-cdk-lib/aws-ecr'

export class DockerStack extends cdk.Stack {
  otelRepoSsmName: string
  constructor (scope: Construct, id: string, props?: cdk.StackProps) {
    const stackName = `${id}-docker`
    super(scope, stackName, props)
    
    this.otelRepoSsmName = `/${id}/otelRepositoryName`

    const otelRepository = new ecr.Repository(this, 'otelRepository', {
      repositoryName: `${id}-otel-app`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production
      autoDeleteImages: true // NOT recommended for production
    })

    // store the repository URI in SSM Parameter Store
    new cdk.aws_ssm.StringParameter(this, 'otelRepositoryName', {
      parameterName: this.otelRepoSsmName,
      stringValue: otelRepository.repositoryName,
      description: 'The Otel app URI of the ECR repository',
      tier: cdk.aws_ssm.ParameterTier.STANDARD
    })

    // Output the ECR Repository URI
    new cdk.CfnOutput(this, 'otelRepositoryURI', {
      value: otelRepository.repositoryUri,
      description: 'The Otel app URI of the ECR repository'
    })

    
  }
}
