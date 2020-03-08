const AWS = require('aws-sdk');
const webApi = require('@slack/web-api');

const DynamoDB = new AWS.DynamoDB.DocumentClient();

/**
 * find slack user info by email and send message to user
 * @param message - sending object to finding user
 * @returns {Promise<void>}
 */
async function sendSlackMessageToUser(message) {
    console.log('Starting send message to user with slack');
    let slack = new webApi.WebClient(process.env.SLACK_TOKEN);

    let user = await slack.users.lookupByEmail({'email': process.env.USER_EMAIL});
    message.channel = user.user.id;
    console.log('User finding id: ' + message.channel + ' and email: ' + process.env.USER_EMAIL);

    let res = await slack.chat.postMessage(message);
    console.log('Message sent: ', res.ts);
}

exports.handler = async function (event, context, callback) {

    const notifiedAdvertisement = await DynamoDB
        .scan(
            {
                TableName: 'Sahibindex',
                FilterExpression: '#isSend = :value',
                ExpressionAttributeNames: {
                    '#isSend': 'isSend'
                },
                ExpressionAttributeValues: {
                    ':value': false
                }
            }
        )
        .promise();

    for (let item of notifiedAdvertisement.Items) {
        const param = {
            TableName: "Sahibindex",
            Item: {
                advertisementId: item.advertisementId,
                advertisementName: item.advertisementName,
                advertisementUrl: item.advertisementUrl,
                advertisementCurrency: item.advertisementCurrency,
                advertisementPublishedDate: item.advertisementPublishedDate,
                advertisementLocation: item.advertisementLocation,
                isSend: true,
                isUpdated: item.isUpdated
            }
        };
        try {
            await DynamoDB.put(param).promise();
        } catch (error) {
            console.log(`error getting put item to dynamoDB ${error}`);
        }
    }

    // todo make slack messages more readable :)
    if (notifiedAdvertisement.Items.length > 0) {
        await sendSlackMessageToUser(JSON.stringify(notifiedAdvertisement.Items));
    }

    callback(null, 'completion success');
};
