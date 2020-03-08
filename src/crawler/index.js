const AWS = require('aws-sdk');
const Axios = require('axios');
const Cheerio = require('cheerio');

const baseUrl = 'https://www.sahibinden.com';

const DynamoDB = new AWS.DynamoDB.DocumentClient({
    "region": process.env.DYNAMO_REGION,
    "accessKeyId": process.env.DYNAMO_ACCESS_KEY,
    "secretAccessKey": process.env.DYNAMO_SECRET_ACCESS_KEY
});

const host = Axios.create({
    baseURL: baseUrl
});

/**
 * get total page count for crawling page iterations -2 means minus önceki and sonraki buttons
 * @returns {Promise<number>}
 */
async function getPageCount() {
    const contentResponse = await host.get(process.env.CRAWLING_URL_PATH);

    const content = Cheerio.load(contentResponse.data);
    return content('.pageNavTable ul li').length - 2
}

/**
 * parse raw html page with cheerio and select table and extract search value data
 * @param htmlContent
 */
function htmlContent2ContentData(htmlContent) {
    const content = Cheerio.load(htmlContent);

    return content('table#searchResultsTable tbody tr').map((index, element) => {
        if (element && content(element).attr('data-id')) {
            return {
                advertisementId: content(element).attr('data-id'),
                advertisementName: content(element).find('td a').attr('title'),
                advertisementUrl: content(element).find('td a').attr('href'),
                advertisementCurrency: content(element).find('td.searchResultsPriceValue').text().trim(),
                advertisementPublishedDate: content(element).find('td.searchResultsDateValue').text().trim(),
                advertisementLocation: content(element).find('td.searchResultsLocationValue').text().trim(),
            }
        }
    }).get()
}

/**
 * save crawled data to dynamoDb
 * @param crawlData
 * @returns {Promise<void>}
 */
async function saveDynamoDb(crawlData) {
    for (let data of crawlData) {

        const existingData = await DynamoDB
            .get({
                TableName: 'Sahibindex',
                Key: {
                    "advertisementId": Number(data.advertisementId)
                }
            })
            .promise();

        const param = {
            TableName: "Sahibindex",
            Item: {
                advertisementId: Number(data.advertisementId),
                advertisementName: data.advertisementName,
                advertisementUrl: baseUrl + data.advertisementUrl,
                advertisementCurrency: data.advertisementCurrency,
                advertisementPublishedDate: data.advertisementPublishedDate,
                advertisementLocation: data.advertisementLocation,
                isSend: false,
                isUpdated: false
            }
        };

        if (existingData.Item) {
            if (existingData.Item.advertisementCurrency !== param.Item.advertisementCurrency) {
                param.Item.isUpdated = true;
                param.Item.isSend = false;
            } else {
                continue
            }
        }

        try {
            await DynamoDB.put(param).promise();
        } catch (error) {
            console.log(`error getting put item to dynamoDB ${error}`);
        }
    }
}

exports.handler = async function (event, context, callback) {

    try {
        const pageCount = await getPageCount();
        const crawlData = [];

        for (let index = 0; index < pageCount; index++) {
            let pageUrl = "";

            if (index === 0) {
                pageUrl = process.env.CRAWLING_URL_PATH;
            } else {
                let splicedUrl = process.env.CRAWLING_URL_PATH.split('?');
                pageUrl = splicedUrl[0] + '?pagingOffset=' + 20 * index + splicedUrl[1];
            }

            const contentResponse = await host.get(pageUrl);
            const crawledData = htmlContent2ContentData(contentResponse.data);

            await new Promise(resolve => setTimeout(() => {
                console.log("wait connem cok hızlı gitmeyelim :)");
                resolve();
                crawlData.push(...crawledData)
            }, index * 100));
        }

        await saveDynamoDb(crawlData)

    } catch (err) {
        console.error(`error getting :(  ${err.name} ${err.message} ${err.stack}`);
    }

    callback(null, 'completion success');
};
