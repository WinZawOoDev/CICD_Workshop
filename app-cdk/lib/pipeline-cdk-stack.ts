import { Stack, StackProps, aws_codeconnections as codeconnections, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Rule, EventPattern } from 'aws-cdk-lib/aws-events';
import * as events from 'aws-cdk-lib/aws-events';

interface ConsumerProps extends StackProps {
    ecrRepository: ecr.Repository,
    fargateServiceTest: ecsPatterns.ApplicationLoadBalancedFargateService,
    greenTargetGroup: elbv2.ApplicationTargetGroup,
    greenLoadBalancerListener: elbv2.ApplicationListener,
    fargateServiceProd: ecsPatterns.ApplicationLoadBalancedFargateService,
}

export class PipelineCdkStack extends Stack {

    constructor(scope: Construct, id: string, props: ConsumerProps) {

        super(scope, id, props);

        const SourceConnection = new codeconnections.CfnConnection(this, 'CICD_Workshop_Connection', {
            connectionName: 'CICD_Workshop_Connection',
            providerType: 'GitHub',
        });

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: 'CICD_Pipeline',
            crossAccountKeys: false,
            pipelineType: codepipeline.PipelineType.V2,
            executionMode: codepipeline.ExecutionMode.QUEUED,
        });

        const codeBuild = new codebuild.PipelineProject(this, 'CodeBuild', {
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                privileged: true,
                computeType: codebuild.ComputeType.LARGE,
            },
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec_test.yml'),
        });


        const sourceOutput = new codepipeline.Artifact();
        const unitTestOutput = new codepipeline.Artifact();

        pipeline.addStage({
            stageName: 'Source',
            actions: [
                new codepipeline_actions.CodeStarConnectionsSourceAction({
                    actionName: 'GitHub',
                    owner: 'WinZawOoDev',
                    repo: 'CICD_Workshop',
                    output: sourceOutput,
                    branch: 'main',
                    connectionArn: SourceConnection.attrConnectionArn,
                }),
            ],
        });

        pipeline.addStage({
            stageName: 'Code-Quality-Testing',
            actions: [
                new codepipeline_actions.CodeBuildAction({
                    actionName: 'Unit-Test',
                    project: codeBuild,
                    input: sourceOutput,
                    outputs: [unitTestOutput],
                }),
            ],
        });

        const dockerBuild = new codebuild.PipelineProject(this, 'DockerBuild', {
            environmentVariables: {
                IMAGE_TAG: { value: 'latest' },
                IMAGE_REPO_URI: { value: props.ecrRepository.repositoryUri },
                AWS_DEFAULT_REGION: { value: process.env.CDK_DEFAULT_REGION },
            },
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                privileged: true,
                computeType: codebuild.ComputeType.LARGE,
            },
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec_docker.yml'),
        });

        const dockerBuildRolePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                'ecr:GetAuthorizationToken',
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:GetRepositoryPolicy',
                'ecr:DescribeRepositories',
                'ecr:ListImages',
                'ecr:DescribeImages',
                'ecr:BatchGetImage',
                'ecr:InitiateLayerUpload',
                'ecr:UploadLayerPart',
                'ecr:CompleteLayerUpload',
                'ecr:PutImage',
            ],
        });

        dockerBuild.addToRolePolicy(dockerBuildRolePolicy);

        const dockerBuildOutput = new codepipeline.Artifact();

        pipeline.addStage({
            stageName: 'Docker-Push-ECR',
            actions: [
                new codepipeline_actions.CodeBuildAction({
                    actionName: 'Docker-Build',
                    project: dockerBuild,
                    input: sourceOutput,
                    outputs: [dockerBuildOutput],
                }),
            ],
        });

        const signerARNParameter = new ssm.StringParameter(this, 'SignerARNParam', {
            parameterName: 'signer-profile-arn',
            stringValue: 'arn:aws:signer:us-east-2:408190085175:/signing-profiles/ecr_signing_profile',
        });

        const signerParameterPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [signerARNParameter.parameterArn],
            actions: ['ssm:GetParametersByPath', 'ssm:GetParameters'],
        });

        dockerBuild.addToRolePolicy(signerParameterPolicy);

        const signerPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                'signer:PutSigningProfile',
                'signer:SignPayload',
                'signer:GetRevocationStatus',
            ],
        });

        dockerBuild.addToRolePolicy(signerPolicy);

        pipeline.addStage({
            stageName: 'Deploy-Test',
            actions: [
                new codepipeline_actions.EcsDeployAction({
                    actionName: 'Deploy-Fargate-Test',
                    service: props.fargateServiceTest.service,
                    input: dockerBuildOutput,
                }),
            ]
        });

        const ecsCodeDeployApp = new codedeploy.EcsApplication(this, "my-app", { applicationName: 'my-app' });
        const prodEcsDeploymentGroup = new codedeploy.EcsDeploymentGroup(this, "my-app-dg", {
            service: props.fargateServiceProd.service,
            blueGreenDeploymentConfig: {
                blueTargetGroup: props.fargateServiceProd.targetGroup,
                greenTargetGroup: props.greenTargetGroup,
                listener: props.fargateServiceProd.listener,
                testListener: props.greenLoadBalancerListener
            },
            deploymentConfig: codedeploy.EcsDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTES,
            application: ecsCodeDeployApp,
        });

        pipeline.addStage({
            stageName: 'Deploy-Production',
            actions: [
                new codepipeline_actions.ManualApprovalAction({
                    actionName: 'Approve-Prod-Deploy',
                    runOrder: 1
                }),
                new codepipeline_actions.CodeDeployEcsDeployAction({
                    actionName: 'BlueGreen-deployECS',
                    deploymentGroup: prodEcsDeploymentGroup,
                    appSpecTemplateInput: sourceOutput,
                    taskDefinitionTemplateInput: sourceOutput,
                    runOrder: 2
                })
            ]
        });

        new CfnOutput(this, 'SourceConnectionArn', {
            value: SourceConnection.attrConnectionArn,
        });

        new CfnOutput(this, 'SourceConnectionStatus', {
            value: SourceConnection.attrConnectionStatus,
        });

        const buildRate = new cloudwatch.GraphWidget({
            title: 'Build Successes and Failures',
            width: 6,
            height: 6,
            view: cloudwatch.GraphWidgetView.PIE,
            left: [
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'SucceededBuilds',
                    statistic: 'sum',
                    label: 'Succeeded Builds',
                    period: Duration.days(30),
                }),
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'FailedBuilds',
                    statistic: 'sum',
                    label: 'Failed Builds',
                    period: Duration.days(30),
                }),
            ],
        });

        const buildsCount = new cloudwatch.SingleValueWidget({
            title: 'Total Builds',
            width: 6,
            height: 6,
            metrics: [
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'Builds',
                    statistic: 'sum',
                    label: 'Builds',
                    period: Duration.days(30),
                }),
            ],
        });

        const averageDuration = new cloudwatch.GaugeWidget({
            title: 'Average Build Time',
            width: 6,
            height: 6,
            metrics: [
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'Duration',
                    statistic: 'avg',
                    label: 'Duration',
                    period: Duration.hours(1),
                }),
            ],
            leftYAxis: {
                min: 0,
                max: 300,
            },
        });

        const queuedDuration = new cloudwatch.GaugeWidget({
            title: 'Build Queue Duration',
            width: 6,
            height: 6,
            metrics: [
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'QueuedDuration',
                    statistic: 'avg',
                    label: 'Duration',
                    period: Duration.hours(1),
                }),
            ],
            leftYAxis: {
                min: 0,
                max: 60,
            },
        });

        const downloadDuration = new cloudwatch.GraphWidget({
            title: 'Checkout Duration',
            width: 24,
            height: 5,
            left: [
                new cloudwatch.Metric({
                    namespace: 'AWS/CodeBuild',
                    metricName: 'DownloadSourceDuration',
                    statistic: 'max',
                    label: 'Duration',
                    period: Duration.minutes(5),
                    color: cloudwatch.Color.PURPLE,
                }),
            ],
        });

        new cloudwatch.Dashboard(this, 'CICD_Dashboard', {
            dashboardName: 'CICD_Dashboard',
            widgets: [
                [
                    buildRate,
                    buildsCount,
                    averageDuration,
                    queuedDuration,
                    downloadDuration
                ],
            ],
        });

        const failureTopic = new sns.Topic(this, "BuildFailure", {
            displayName: "BuildFailure",
        });

        const emailSubscription = new subscriptions.EmailSubscription('winzawoo.dev@gmail.com');
        failureTopic.addSubscription(emailSubscription);

        // CloudWatch event rule triggered on pipeline failures
        const pipelineFailureRule = new Rule(this, 'PipelineFailureRule', {
            description: 'Notify on pipeline failures',
            eventPattern: {
                source: ['aws.codepipeline'],
                detailType: ['CodePipeline Pipeline Execution State Change'],
                detail: {
                    state: ['FAILED']
                }
            }
        });

        // Add SNS topic as a target
        pipelineFailureRule.addTarget(new targets.SnsTopic(failureTopic, {
            message: events.RuleTargetInput.fromText(`Pipeline Failure Detected! Pipeline: ${events.EventField.fromPath('$.detail.pipeline')}, Execution ID: ${events.EventField.fromPath('$.detail.execution-id')}`),
        }));
    }
}