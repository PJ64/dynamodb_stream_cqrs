from __future__ import print_function
import boto3, json
import logging
import os
from decimal import Decimal
from botocore.exceptions import ClientError
from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')
sqs_queue = os.environ.get('SQSQUEUE')

def lambda_handler(event, context):
    data = json.loads(json.dumps(event))
    for record in data["Records"]:
        print(json.dumps(record))
        SendRecord(record["dynamodb"]["NewImage"])
        
def SendRecord(data):
    try:
        # details = json.loads(json.dumps(data['details']['M']))
        total = float(data['unitprice']['N']) * float(data['quantity']['N'])
        accountid = str(data['accountid']['S'])
        summary=json.dumps({
            "accountid": accountid,
            "total": total
        })

        print("sqs summary: " + summary)
        # Send message to SQS queue
        response = sqs.send_message(
            QueueUrl=sqs_queue,
            DelaySeconds=10,
            MessageBody=summary
        )
    except ClientError:
        logger.exception("Couldn't Send Message %s to SQS",summary)
        raise