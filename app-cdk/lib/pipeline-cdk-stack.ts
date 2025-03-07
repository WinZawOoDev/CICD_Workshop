import { Stack, StackProps, aws_codeconnections as codeconnections, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class PipelineCdkStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {

        super(scope, id, props);

        const SourceConnection = new codeconnections.CfnConnection(this, 'CICD_Workshop_Connection', {
            connectionName: 'CICD_Workshop_Connection',
            providerType: 'GitHub',
        });


        new CfnOutput(this, 'SourceConnectionArn', {
            value: SourceConnection.attrConnectionArn,
          });
    
        new CfnOutput(this, 'SourceConnectionStatus', {
            value: SourceConnection.attrConnectionStatus,
          });

    }
}