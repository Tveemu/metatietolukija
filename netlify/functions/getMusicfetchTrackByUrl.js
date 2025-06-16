const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

exports.handler = async (event) => {
    const url = event.queryStringParameters?.url;

    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "URL puuttuu" }),
        };
    }

    try {
        const response = await fetch(`https://api.musicfetch.io/url?url=${encodeURIComponent(url)}&services=appleMusic,youtube,spotify`, {
            headers: {
                'x-musicfetch-token': process.env.MUSICFETCH_TOKEN,
            },
        });

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Musicfetch API error: ${response.statusText}` }),
            };
        }

        const data = await response.json();
        return {
            statusCode: 200,
            body: JSON.stringify({ result: data }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Virhe Musicfetch-haussa", details: err.message }),
        };
    }
};
