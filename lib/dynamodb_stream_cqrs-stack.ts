import * as cdk from '@aws-cdk/core';
import { LambdaIntegration, RestApi , Cors} from '@aws-cdk/aws-apigateway';
import { AttributeType, Table, StreamViewType, ProjectionType } from '@aws-cdk/aws-dynamodb';
import { Runtime, Code, Function, StartingPosition } from '@aws-cdk/aws-lambda';
import { DynamoEventSource, SqsEventSource } from '@aws-cdk/aws-lambda-event-sources'
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement } from '@aws-cdk/aws-iam';
import { Queue } from '@aws-cdk/aws-sqs';

export class DynamodbStreamCqrsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create sqs queues
    const summary_queue = new Queue(this, "SummaryQueue",{
      queueName: "dynamodb_stream_cqrs_summary"
    })
    
    //order Microservice
    //Create DynamoDB table
    const order_dynamoTable = new Table(this, "OrderDynamoDBTable",{
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'vendorid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_order',
      stream: StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    //Setup IAM security for Lambda
    const order_lambda_service_role = new Role(this, "AggregateIamRole",{
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        roleName: "dynamodb_stream_cqrs_order"
    });

    order_lambda_service_role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    
    order_lambda_service_role.addToPolicy(new PolicyStatement({
      resources: [order_dynamoTable.tableArn, summary_queue.queueArn],
      actions: ['dynamodb:PutItem', 'sqs:SendMessage'],
    }));

    //Create lambda functions for 
    const lambda_put_order= new Function(this, "PutLambdaFunction",{
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/put_order"),
      functionName: "dynamodb_stream_cqrs_put_order",
      role: order_lambda_service_role,
      environment: {
        'TABLENAME': order_dynamoTable.tableName
      }
    });

    const lambda_aggregate_order = new Function(this, "AggregateLambdaFunction",{
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/aggregate_orders"),
      functionName: "dynamodb_stream_cqrs_aggregate_orders",
      role: order_lambda_service_role,
      environment: {
        'SQSQUEUE': summary_queue.queueUrl
      }
    });

    lambda_aggregate_order.addEventSource(new DynamoEventSource(order_dynamoTable, {
      startingPosition: StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      bisectBatchOnError: true,
      retryAttempts: 10
    }));

    //Account summary Microservice
    //Create DynamoDB table
    const account_summary_dynamoTable = new Table(this, "AccountSummaryDynamoDBTable",{
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_account_summary',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    //Setup IAM security for Lambda
    const account_summary_lambda_service_role = new Role(this, "account_summaryIamRole",{
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        roleName: "dynamodb_stream_cqrs_account_summary"
    });

    account_summary_lambda_service_role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    
    account_summary_lambda_service_role.addToPolicy(new PolicyStatement({
      resources: [account_summary_dynamoTable.tableArn],
      actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:UpdateItem'],
    }));

    //Create lambda functions
    const lambda_put_account_summary = new Function(this, "PostLambdaFunction",{
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/put_summary"),
      functionName: "dynamodb_stream_cqrs_put_account_summary",
      role: account_summary_lambda_service_role,
      environment: {
        'TABLENAME': account_summary_dynamoTable.tableName
      }
    });

    lambda_put_account_summary.addEventSource(new SqsEventSource(summary_queue));

    const lambda_get_account_summary = new Function(this, "GetLambdaFunction",{
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/get_summary"),
      functionName: "dynamodb_stream_cqrs_get_account_summary",
      role: account_summary_lambda_service_role,
      environment: {
        'TABLENAME': account_summary_dynamoTable.tableName
      }
    });

    //Create REST Api and integrate the Lambda functions
    var api = new RestApi(this, "OrderApi",{
        restApiName: "dynamodb_stream_cqrs",
        defaultCorsPreflightOptions: {
          allowOrigins: Cors.ALL_ORIGINS,
          allowMethods: Cors.ALL_METHODS}
    });

    var lambda_post_integration = new LambdaIntegration(lambda_put_order, {
      requestTemplates: {
            ["application/json"]: "{ \"statusCode\": \"200\" }"
        }
    });

    var lambda_get_integration = new LambdaIntegration(lambda_get_account_summary);

    var apiresource = api.root.addResource("order");
    apiresource.addMethod("POST", lambda_post_integration);

    var apiresource = api.root.addResource("summary");
    apiresource.addMethod("GET", lambda_get_integration);
  }
}
