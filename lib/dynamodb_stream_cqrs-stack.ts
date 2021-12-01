import * as cdk from '@aws-cdk/core';
import { AwsIntegration, RestApi, PassthroughBehavior, LogGroupLogDestination, AccessLogFormat, MethodLoggingLevel } from '@aws-cdk/aws-apigateway'
import { Table, BillingMode, AttributeType, StreamViewType } from '@aws-cdk/aws-dynamodb'
import { Runtime, Code, Function, StartingPosition } from '@aws-cdk/aws-lambda';
import { Queue } from '@aws-cdk/aws-sqs';
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement } from '@aws-cdk/aws-iam';
import { DynamoEventSource, SqsEventSource } from '@aws-cdk/aws-lambda-event-sources'
import { LogGroup } from '@aws-cdk/aws-logs';

//Pattern 1
export class DynamodbStreamCqrsStackPattern1 extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //CloudWatch log groups
    const prdLogGroup = new LogGroup(this, "dynamod_stream_cqrs_pattern_1");

    //DynamoDB tables
    const dynamoTable_details = new Table(this, "dynamoTable_details", {
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'vendorid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_details_pattern_1',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
      billingMode: BillingMode.PAY_PER_REQUEST
    });

    const dynamoTable_summary = new Table(this, "dynamoTable_summary", {
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_summary_pattern_1',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
    });

    //IAM roles and policies
    const lambda_service_role = new Role(this, "lambda_service_role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dynamodb_stream_cqrs_pattern_1"
    });

    lambda_service_role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    lambda_service_role.addToPolicy(new PolicyStatement({
      resources: [dynamoTable_summary.tableArn],
      actions: ['dynamodb:PutItem','dynamodb:UpdateItem'],
    }));

    //Lambda functions
    const lambda_aggregate = new Function(this, "lambda_aggregate", {
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/aggregate_summary_1"),
      functionName: "dynamodb_stream_cqrs_summary_1",
      role: lambda_service_role,
      environment: {
        'TABLENAME': dynamoTable_summary.tableName
      }
    });

    lambda_aggregate.addEventSource(new DynamoEventSource(dynamoTable_details, {
      startingPosition: StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      bisectBatchOnError: true,
      retryAttempts: 10
    }));

    //API gateway
    const restApi = new RestApi(this, 'restApi', {
      restApiName: "dynamodb_stream_cqrs_pattern_1",
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(prdLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true
      }
    })
    const resource_get = restApi.root.addResource('{accountid}')
    const resource_post = restApi.root.addResource('order')

    // Allow the RestApi to access DynamoDb by assigning this role to the integration
    const integrationRole = new Role(this, 'integrationRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    })
    dynamoTable_details.grantReadWriteData(integrationRole)
    dynamoTable_summary.grantReadWriteData(integrationRole)

    // POST Integration to DynamoDb
    const dynamoPutIntegration = new AwsIntegration({
      service: 'dynamodb',
      action: 'PutItem',
      options: {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: integrationRole,
        requestTemplates: {
          'application/json': JSON.stringify({
            'TableName': dynamoTable_details.tableName,
            "Item": {
              "accountid": {
                "S": "$input.path('$.order.accountid')"
              },
              "vendorid": {
                "S": "$input.path('$.order.vendorid')"
              },
              "orderdate": {
                "S": "$input.path('$.order.orderdate')"
              },
              "city": {
                "S": "$input.path('$.order.city')"
              },
              'coffeetype': { 
                'S': "$input.path('$.order.coffeetype')" 
              },
              'coffeesize': { 
                'S': "$input.path('$.order.coffeesize')" 
              },
              'unitprice': { 
                'N': "$input.path('$.order.unitprice')"
              },
              'quantity': { 
                'N': "$input.path('$.order.quantity')"
              }              
            }
          })
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': JSON.stringify({})
            }
          }
        ],
      }
    })
    resource_post.addMethod('POST', dynamoPutIntegration, {
      methodResponses: [{ statusCode: '200' }],
    })

    // GET Integration with DynamoDb
    const dynamoQueryIntegration = new AwsIntegration({
      service: 'dynamodb',
      action: 'Query',
      options: {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: integrationRole,
        requestParameters: {
          'integration.request.path.accountid': 'method.request.path.accountid'
        },
        requestTemplates: {
          'application/json': JSON.stringify({
            'TableName': dynamoTable_summary.tableName,
            'KeyConditionExpression': 'accountid = :a1',
            'ExpressionAttributeValues': {
              ':a1': { 'S': "$input.params('accountid')" }
            }
          }),
        },
        integrationResponses: [{ statusCode: '200' }],
      }
    })
    resource_get.addMethod('GET', dynamoQueryIntegration, {
      methodResponses: [{ statusCode: '200' }],
      requestParameters: {
        'method.request.path.accountid': true
      }
    })
  }
}

//Pattern 2
export class DynamodbStreamCqrsStackPattern2 extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //CloudWatch log groups
    const prdLogGroup = new LogGroup(this, "dynamod_stream_cqrs_pattern_2");

    //DynamoDB tables
    const dynamoTable_details = new Table(this, "dynamoTable_details", {
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'vendorid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_details_pattern_2',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    const dynamoTable_summary = new Table(this, "dynamoTable_summary", {
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      tableName: 'dynamodb_stream_cqrs_summary_pattern_2',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
    });

    //SQS queues
    const queue = new Queue(this, "Queue", {
      queueName: "dynamodb_stream_cqrs_pattern_2"
    })
    
    //IAM roles and policies
    const lambda_service_aggregate_role = new Role(this, "lambda_service_aggregate_role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dynamodb_stream_cqrs_aggregate_pattern_2"
    });

    lambda_service_aggregate_role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    lambda_service_aggregate_role.addToPolicy(new PolicyStatement({
      resources: [queue.queueArn],
      actions: ['sqs:SendMessage'],
    }));

    const lambda_service_summary_put_role = new Role(this, "lambda_service_summary_put_role", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      roleName: "dynamodb_stream_cqrs_summary_put_pattern_2"
    });

    lambda_service_summary_put_role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    lambda_service_summary_put_role.addToPolicy(new PolicyStatement({
      resources: [dynamoTable_summary.tableArn],
      actions: ['dynamodb:PutItem','dynamodb:UpdateItem'],
    }));

    //Lambda functions
    const lambda_aggregate = new Function(this, "lambda_aggregate", {
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/aggregate_summary_2"),
      functionName: "dynamodb_stream_cqrs_summary_2",
      role: lambda_service_aggregate_role,
      environment: {
        'SQSQUEUE': queue.queueUrl
      }
    });

    lambda_aggregate.addEventSource(new DynamoEventSource(dynamoTable_details, {
      startingPosition: StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      bisectBatchOnError: true,
      retryAttempts: 10
    }));

    const lambda_put = new Function(this, "lambda_put", {
      runtime: Runtime.PYTHON_3_7,
      handler: "function_handler.lambda_handler",
      code: Code.fromAsset("resources/put_summary_2"),
      functionName: "dynamodb_stream_cqrs_put_2",
      role: lambda_service_summary_put_role,
      environment: {
        'TABLENAME': dynamoTable_summary.tableName
      }
    });

    lambda_put.addEventSource(new SqsEventSource(queue));

    //API gateway
    const restApi = new RestApi(this, 'restApi', {
      restApiName: "dynamodb_stream_cqrs_pattern_2",
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(prdLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true
      }
    })
    const resource_get = restApi.root.addResource('{accountid}')
    const resource_post = restApi.root.addResource('order')

    // Allow the RestApi to access DynamoDb by assigning this role to the integration
    const integrationRole = new Role(this, 'integrationRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    })
    dynamoTable_details.grantReadWriteData(integrationRole)
    dynamoTable_summary.grantReadWriteData(integrationRole)

    // POST Integration to DynamoDb
    const dynamoPutIntegration = new AwsIntegration({
      service: 'dynamodb',
      action: 'PutItem',
      options: {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: integrationRole,
        requestTemplates: {
          'application/json': JSON.stringify({
            'TableName': dynamoTable_details.tableName,
            "Item": {
              "accountid": {
                "S": "$input.path('$.order.accountid')"
              },
              "vendorid": {
                "S": "$input.path('$.order.vendorid')"
              },
              "orderdate": {
                "S": "$input.path('$.order.orderdate')"
              },
              "city": {
                "S": "$input.path('$.order.city')"
              },
              'coffeetype': { 
                'S': "$input.path('$.order.coffeetype')" 
              },
              'coffeesize': { 
                'S': "$input.path('$.order.coffeesize')" 
              },
              'unitprice': { 
                'N': "$input.path('$.order.unitprice')"
              },
              'quantity': { 
                'N': "$input.path('$.order.quantity')"
              }              
            }
          })
        },
        integrationResponses: [
          {
            statusCode: '200',
            responseTemplates: {
              'application/json': JSON.stringify({})
            }
          }
        ],
      }
    })
    resource_post.addMethod('POST', dynamoPutIntegration, {
      methodResponses: [{ statusCode: '200' }],
    })

    // GET Integration with DynamoDb
    const dynamoQueryIntegration = new AwsIntegration({
      service: 'dynamodb',
      action: 'Query',
      options: {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
        credentialsRole: integrationRole,
        requestParameters: {
          'integration.request.path.accountid': 'method.request.path.accountid'
        },
        requestTemplates: {
          'application/json': JSON.stringify({
            'TableName': dynamoTable_summary.tableName,
            'KeyConditionExpression': 'accountid = :a1',
            'ExpressionAttributeValues': {
              ':a1': { 'S': "$input.params('accountid')" }
            }
          }),
        },
        integrationResponses: [{ statusCode: '200' }],
      }
    })
    resource_get.addMethod('GET', dynamoQueryIntegration, {
      methodResponses: [{ statusCode: '200' }],
      requestParameters: {
        'method.request.path.accountid': true
      }
    })
  }
}
