const { google } = require('googleapis');

async function createGA4Client() {
  const credJson = Buffer.from(process.env.GA4_CREDENTIALS, 'base64').toString();
  const credentials = JSON.parse(credJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });

  const analyticsData = google.analyticsdata({
    version: 'v1beta',
    auth,
  });

  return analyticsData;
}

async function runReport(client, { propertyId, startDate, endDate, dimensions, metrics }) {
  const response = await client.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map(d => ({ name: d })),
      metrics: metrics.map(m => ({ name: m })),
    },
  });
  return response.data;
}

module.exports = { createGA4Client, runReport };
