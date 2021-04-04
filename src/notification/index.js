const aws = require('aws-sdk');
const webApi = require('@slack/web-api');
const dynamodb = new aws.DynamoDB.DocumentClient();
const awsUtils = require('util');

/**
 * find slack user info by email and send message to user
 */
async function sendSlackMessage(data) {
    console.log('Starting send message to user with slack');
    const slack = new webApi.WebClient(process.env.SLACK_TOKEN);

    const options = {
        type: 'message',
        as_user: true,
        unfurl_links: true,
        username: 'MY Bot',
        blocks: [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Advertising Links"
                }
            }
        ]
    };

    for (let it of data) {
        options.blocks.push(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Name: " + it.adName + " Price: " + it.adCurrency,
                },
                "accessory": {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Click Me",
                        "emoji": true
                    },
                    "value": "click_me_123",
                    "url": it.adUrl,
                    "action_id": "button-action"
                }
            });
    }

    const user = await slack.users.lookupByEmail({'email': process.env.SLACK_USER});
    options.channel = user.user.id;

    const res = await slack.chat.postMessage(options);
    console.log('Message sent: ', res.ts);
}

/**
 * get ads with given ids from dynamodb
 */
async function getByIds(ids) {
    const params = ids.map(id => {
        return {
            TableName: process.env.TABLE_NAME,
            FilterExpression: '#adId = :value',
            ExpressionAttributeNames: {
                '#adId': 'adId'
            },
            ExpressionAttributeValues: {
                ':value': Number(id)
            }
        };
    });

    const ads = await Promise.all(params.map(param => {
        return dynamodb.scan(param).promise();
    }));

    return ads.flatMap(ad => ad.Items);
}

exports.handler = async function (event, context, callback) {
    try {
        // Read options from the event.
        console.log("Reading options from event:\n", awsUtils.inspect(event, {depth: 5}));
        const adIds = JSON.parse(event.Records[0].body).ids;
        console.log("ids: ", adIds);

        const ads = await getByIds(adIds);
        await sendSlackMessage(ads);
    } catch (err) {
        console.error(`error getting :(  ${err.name} ${err.message} ${err.stack}`);
    }

    callback(null, 'completion success');
};
