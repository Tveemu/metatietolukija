// netlify/functions/getMusicfetchTrack.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
    console.log("Token loaded:", process.env.MUSICFETCH_TOKEN);
    const isrc = event.queryStringParameters?.isrc;
    const ALL_SERVICES = [
        "amazon", "amazonMusic", "anghami", "appleMusic", "audiomack", "audius", "awa",
        "bandcamp", "bandsintown", "beatport", "boomplay", "deezer", "discogs", "flo",
        "gaana", "genius", "iHeartRadio", "imdb", "instagram", "itunesStore", "jioSaavn",
        "joox", "kkbox", "lineMusic", "musicBrainz", "napster", "netease", "pandora",
        "qobuz", "qqMusic", "sevenDigital", "shazam", "snapchat", "songkick", "soundcloud",
        "spotify", "telmoreMusik", "threads", "ticketmaster", "tidal", "tiktok", "trebel",
        "x", "wikipedia", "yandex", "youseeMusik", "youtube", "youtubeMusic",
        "youtubeShorts", "tiktokMusic", "wynkMusic"
    ].join(",");


    if (!isrc) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "ISRC puuttuu" }),
        };
    }

    try {
        const response = await fetch(`https://api.musicfetch.io/isrc?isrc=${isrc}&services=${ALL_SERVICES}`, {
            headers: {
                "x-token": process.env.MUSICFETCH_TOKEN, // correct header name from the docs
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
