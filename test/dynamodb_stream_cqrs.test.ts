import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as DynamodbStreamCqrs from '../lib/dynamodb_stream_cqrs-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new DynamodbStreamCqrs.DynamodbStreamCqrsStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
