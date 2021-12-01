#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DynamodbStreamCqrsStackPattern1, DynamodbStreamCqrsStackPattern2 } from '../lib/dynamodb_stream_cqrs-stack';

const app = new cdk.App();
new DynamodbStreamCqrsStackPattern1(app, 'DynamodbStreamCqrsStackPattern1', {
});
new DynamodbStreamCqrsStackPattern2(app, 'DynamodbStreamCqrsStackPattern2', {
});