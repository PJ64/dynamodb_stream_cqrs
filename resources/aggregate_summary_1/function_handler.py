from __future__ import print_function
import boto3
import json
import logging
import os
from decimal import Decimal
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('TABLENAME'))

def lambda_handler(event, context):
    data = json.loads(json.dumps(event))
    for record in data["Records"]:
        print(json.dumps(record))
        if 'REMOVE' in data:
            #remove item logic is not included
            return "remove"
        else:
            data = AggregateRecords(record["dynamodb"]["NewImage"])
            PutItem(data)
            UpdateItem(data)


def AggregateRecords(body):
    try:
        total = float(body['unitprice']['N']) * float(body['quantity']['N'])
        accountid = str(body['accountid']['S'])
        return json.dumps({
            "accountid": accountid,
            "total": total
        })
    except ClientError as e:
        print(e)

def PutItem(body):
    try:
        data = json.loads(body)
        table.put_item(
            Item={
                'accountid': data['accountid']
            },
            ConditionExpression='attribute_not_exists(accountid)'
        )
    except ClientError as e:
        if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
            print(e)


def UpdateItem(body):
    try:
        data = json.loads(body)
        table.update_item(
            Key={
                'accountid': data['accountid']
            },
            UpdateExpression="ADD account_total :val",
            ExpressionAttributeValues={':val': Decimal(data['total'])},
            ReturnValues="UPDATED_NEW"
        )
    except ClientError as e:
        print(e)
