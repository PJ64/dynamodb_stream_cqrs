from __future__ import print_function
import boto3, json, logging, os
from decimal import Decimal
from botocore.exceptions import ClientError
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

logger = logging.getLogger()

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('TABLENAME'))
sqs = boto3.client('sqs')
sqs_queue = os.environ.get('SQSQUEUE')

def lambda_handler(event, context):
    print(json.dumps(event))
    body =json.loads(event["Records"][0]["body"])
    PutItem(body)
    UpdateItem(body)
    receiptHandle = event["Records"][0]["receiptHandle"]
    delete_message(receiptHandle)
    
def PutItem(body):
    try:
        table.put_item(
            Item={
                'accountid':body['accountid']
            },
            ConditionExpression='attribute_not_exists(accountid)'
        )

    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            print(e)

def UpdateItem(body):
    try:
        print(body)
        table.update_item(
            Key={
                'accountid':body['accountid']
            },
            UpdateExpression="ADD account_total :val",
            ExpressionAttributeValues={':val': Decimal(body['total'])},
            ReturnValues="UPDATED_NEW"
        )
        
    except ClientError as e:
        print(e)

def delete_message(receiptHandle):
    try: 
        print(receiptHandle)
        sqs.delete_message(QueueUrl=os.environ.get('SQSQUEUE'), ReceiptHandle=receiptHandle)
    except ClientError as e:
        print(e)