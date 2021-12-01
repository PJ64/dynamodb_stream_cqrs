from __future__ import print_function
import boto3, json
import logging
import os
from decimal import Decimal
from botocore.exceptions import ClientError

logger = logging.getLogger()

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('TABLENAME'))

def lambda_handler(event, context):
    body =json.loads(event["Records"][0]["body"])
    PutItem(body)
    UpdateItem(body)

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