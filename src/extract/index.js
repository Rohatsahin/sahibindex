const aws = require('aws-sdk');
const cheerio = require('cheerio');
const dynamodb = new aws.DynamoDB.DocumentClient();
const s3 = new aws.S3();
const sqs = new aws.SQS({region: 'us-west-2'});
const awsUtils = require('util');
const baseUrl = 'https://www.sahibinden.com';

/**
 * html2Content parse raw html page with cheerio and select table and extract search value data
 */
function html2Content(html) {
    const content = cheerio.load(html);

    return content('table#searchResultsTable tbody tr')
        .map((index, element) => {
            if (element && content(element).attr('data-id')) {
                return {
                    adId: content(element).attr('data-id'),
                    adName: content(element).find('td a').attr('title'),
                    adUrl: content(element).find('td a').attr('href'),
                    adCurrency: content(element).find('td.searchResultsPriceValue').text().trim(),
                    adLocation: content(element).find('td.searchResultsLocationValue').text().trim(),
                    adPublishedDate: content(element).find('td.searchResultsDateValue').text().trim(),
                };
            }
        }).get();
}

/**
 * saveData gives ads data and saves it in the dynamodb table
 */
async function saveData(data) {
    const params = data.map(it => {
        return {
            TableName: process.env.TABLE_NAME,
            Item: {
                adId: Number(it.adId),
                adName: it.adName,
                adUrl: baseUrl + it.adUrl,
                adCurrency: it.adCurrency,
                adPublishedDate: it.adPublishedDate,
                adLocation: it.adLocation
            }
        };
    });

    await Promise.all(params.map(param => {
        try {
            return dynamodb.put(param).promise();
        } catch (error) {
            console.log(`error getting put item to dynamoDB ${error}`);
            return new Promise.resolve();
        }
    }));
}

/**
 * sendMessage receives the ad ids in the ad data given and sends them as a message
 */
async function sendMessage(data) {
    const ids = {'ids': data.map(it => it.adId)};
    const params = {
        MessageBody: JSON.stringify(ids),
        QueueUrl: process.env.SQS_QUEUE_URL,
    };

    try {
        await sqs.sendMessage(params).promise();
    } catch (error) {
        console.log(`error sending message to sqs ${error}`);
    }
}

exports.handler = async function (event, context, callback) {
    try {
        // Read options from the event.
        console.log("Reading options from event:\n", awsUtils.inspect(event, {depth: 5}));
        const srcBucket = event.Records[0].s3.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

        const params = {
            Bucket: srcBucket,
            Key: srcKey,
        };
        const s3Input = await s3.getObject(params).promise();
        console.log("s3Input", s3Input.Body);

        const ads = html2Content(s3Input.Body);
        await saveData(ads);
        await sendMessage(ads);
    } catch (err) {
        console.error(`error getting :(  ${err.name} ${err.message} ${err.stack}`);
    }

    callback(null, 'completion success');
};
