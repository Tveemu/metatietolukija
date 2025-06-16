import React, { useState, useCallback } from "react";
import { parseBlob } from "music-metadata-browser";
import { useDropzone } from "react-dropzone";
import { Buffer } from "buffer";
import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";   // one‑liner default theme
import { romanize } from "@romanize/korean";
import "./App.css";

window.Buffer = Buffer;

// 🔤 Does the string contain Hangul syllables?
const hasHangul = (str = "") => /[\uAC00-\uD7AF]/.test(str);

// 🔤 Return romanised form or null
const romanizeIfHangul = (str = "") =>
    hasHangul(str) ? romanize(str, { system: "RR" }) : null;

function App() {
    const [fileName, setFileName] = useState("");
    const [metadata, setMetadata] = useState(null);
    const [albumArt, setAlbumArt] = useState(null);
    const [musicBrainzData, setMusicBrainzData] = useState(null);
    const [showFullJson, setShowFullJson] = useState(false);
    const [showBrainzJson, setShowBrainzJson] = useState(false);
    const [cleanData, setCleanData] = useState({
        title: "",
        titleId: "",
        performers: "",
        songwriters: [],
        year: "",
        isrc: "",
        album: "",
        albumId: "",
        trackNumber: "",
        genre: "",
        label: "",
        durationFormatted: "",
        fileSize: ""
    });
    const [artistDetails, setArtistDetails] = useState([]);
    const [artistJsonVisibility, setArtistJsonVisibility] = useState({});
    const [activeTab, setActiveTab] = useState("default");
    const [musicfetchData, setMusicfetchData] = useState(null);
    const [urlInput, setUrlInput] = useState('');

    const toggleArtistJson = (id) => {
        setArtistJsonVisibility(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const fetchMusicBrainzData = async (isrc) => {
        if (!isrc || isrc === "Ei tietoa") return;
        try {
            const response = await fetch(
                `https://musicbrainz.org/ws/2/recording/?query=isrc:${isrc}&fmt=json`
            );
            if (!response.ok) throw new Error("Failed to fetch MusicBrainz data");
            const data = await response.json();

            // Store the main search result
            setMusicBrainzData(data);

            // Collect unique artist IDs from all recordings
            const artistIds = [];
            data.recordings?.forEach((recording) => {
                recording["artist-credit"]?.forEach((credit) => {
                    if (credit.artist && credit.artist.id) {
                        artistIds.push(credit.artist.id);
                    }
                });
            });
            const uniqueArtistIds = [...new Set(artistIds)];

            // Fetch the full data for each artist ID
            const fetchedArtists = await Promise.all(
                uniqueArtistIds.map(async (artistId) => {
                    const artistResponse = await fetch(
                        `https://musicbrainz.org/ws/2/artist/${artistId}?fmt=json&inc=aliases+tags+ratings+url-rels+artist-rels`
                    );
                    if (!artistResponse.ok) {
                        console.error(`Failed to fetch artist data for ${artistId}`);
                        return { id: artistId, error: "Fetch failed" };
                    }
                    const artistData = await artistResponse.json();
                    // Return a combined object: { id, ...allArtistFieldsFromMusicBrainz }
                    return { ...artistData };
                })
            );

            // Store them in state
            setArtistDetails(fetchedArtists);
        } catch (error) {
            console.error("MusicBrainz fetch error:", error);
            setMusicBrainzData({ error: "No data found or failed to fetch." });
            setArtistDetails([]); // clear or handle as you like
        }
    };

    const fetchMusicfetchData = async (isrc) => {
        try {
            const response = await fetch(`/.netlify/functions/getMusicfetchTrack?isrc=${isrc}`);
            const data = await response.json();
            console.log("Musicfetch result:", data);
            setMusicfetchData(data); // store result
        } catch (err) {
            console.error("Error fetching from Musicfetch function:", err);
        }
    };

    const handleFetchByUrl = async () => {
        if (!urlInput) return;

        try {
            setAlbumArt(null);
            setCleanData({
                title: "",
                titleId: "",
                performers: "",
                songwriters: [],
                year: "",
                isrc: "",
                album: "",
                albumId: "",
                trackNumber: "",
                genre: "",
                label: "",
                durationFormatted: "",
                fileSize: ""
            });
            setMusicBrainzData(null);
            setArtistDetails([]);

            const res = await fetch(
                `/.netlify/functions/getMusicfetchTrackByUrl?url=${encodeURIComponent(urlInput)}`
            );
            const data = await res.json();

            if (res.ok) {
                setMusicfetchData(data.result);
                setMetadata({ via: "url" });
                setFileName("URL-haku");
            } else {
                setMusicfetchData({ error: data.error || 'Tuntematon virhe' });
            }
        } catch (err) {
            setMusicfetchData({ error: 'Virhe haettaessa Musicfetchiltä' });
        }
    };


    const handleFileUpload = async (file) => {
        if (!file) return;

        setFileName(file.name);
        setUrlInput("");  // clear the link input if a file is uploaded
        setAlbumArt(null);
        setMetadata(null);
        setMusicBrainzData(null);

        try {
            const metadata = await parseBlob(file);

            const picture = metadata.common?.picture?.[0];
            if (picture) {
                const base64String = btoa(
                    new Uint8Array(picture.data).reduce((data, byte) => data + String.fromCharCode(byte), "")
                );
                const imageUrl = `data:${picture.format};base64,${base64String}`;
                setAlbumArt(imageUrl);
            }

            const title = metadata.common?.title || "Ei tietoa";
            const performers = metadata.common?.artists?.join(", ") || metadata.common?.artist || "Ei tietoa";

            let songwriterRaw = "";
            if (metadata.native) {
                for (const format in metadata.native) {
                    const nativeTags = metadata.native[format];
                    for (const tag of nativeTags) {
                        if (tag.id.toLowerCase() === "©wrt" && typeof tag.value === "string") {
                            songwriterRaw = tag.value;
                            break;
                        }
                    }
                    if (songwriterRaw) break;
                }
            }
            if (!songwriterRaw && metadata.common?.composer?.[0]) {
                songwriterRaw = metadata.common.composer[0];
            }
            const songwriters = songwriterRaw ? songwriterRaw.split(/,|&/).map(s => s.trim()).filter(Boolean) : [];

            let year = metadata.common?.year;
            if (!year && metadata.native) {
                for (const format in metadata.native) {
                    const nativeTags = metadata.native[format];
                    for (const tag of nativeTags) {
                        const tagId = tag.id.toLowerCase();
                        if (tagId === "cprt" && typeof tag.value === "string") {
                            const match = tag.value.match(/(\d{4})/);
                            if (match) {
                                year = match[1];
                                break;
                            }
                        }
                    }
                    if (year) break;
                }
            }
            if (!year && metadata.common?.copyright) {
                const match = metadata.common.copyright.match(/(\d{4})/);
                if (match) year = match[1];
            }
            if (!year) year = "Ei tietoa";

            let isrc = metadata.common?.isrc || "";
            if (!isrc && metadata.native) {
                for (const format in metadata.native) {
                    const nativeTags = metadata.native[format];
                    for (const tag of nativeTags) {
                        const tagId = tag.id.toLowerCase();
                        if (tagId === "xid " && typeof tag.value === "string") {
                            const match = tag.value.match(/isrc:([A-Z0-9]+)/i);
                            if (match) isrc = match[1];
                        }
                        if (tagId.includes("isrc") || tagId.includes("ufid")) {
                            if (typeof tag.value === "string") isrc = tag.value;
                            else if (typeof tag.value === "object" && tag.value.identifier) isrc = tag.value.identifier;
                        }
                        if (tag.id === "----:com.apple.iTunes:ISRC" && typeof tag.value === "string") {
                            isrc = tag.value;
                        }
                    }
                }
            }
            if (!isrc) isrc = "Ei tietoa";

            const album = metadata.common?.album || "Ei tietoa";
            const track = metadata.common?.track;
            const trackNumber = track?.no?.toString() || "Ei tietoa";

            const genre = Array.isArray(metadata.common?.genre)
                ? metadata.common.genre.join(", ")
                : metadata.common?.genre || "Ei tietoa";

            let label = "";
            if (metadata.native) {
                for (const format in metadata.native) {
                    const nativeTags = metadata.native[format];
                    for (const tag of nativeTags) {
                        const tagId = tag.id.toLowerCase();
                        if (tagId === "cprt" && typeof tag.value === "string") {
                            label = tag.value.replace(/^(?:℗|©)?\s*\d{4}\s*/i, "").trim();
                            break;
                        }
                    }
                    if (label) break;
                }
            }
            if (!label && metadata.common?.label) {
                label = metadata.common.label;
            }
            if (!label && metadata.common?.copyright) {
                label = metadata.common.copyright.replace(/^(?:℗|©)?\s*\d{4}\s*/i, "").trim();
            }
            if (!label) label = "Ei tietoa";

            let albumId = "";
            let titleId = "";
            if (metadata.native) {
                for (const format in metadata.native) {
                    const nativeTags = metadata.native[format];
                    for (const tag of nativeTags) {
                        const tagId = tag.id.toLowerCase();
                        if (tagId === "plid" && typeof tag.value === "number") {
                            albumId = tag.value.toString();
                        }
                        if (tagId === "cnid" && typeof tag.value === "number") {
                            titleId = tag.value.toString();
                        }
                    }
                }
            }

            const duration = metadata.format?.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.round(duration % 60).toString().padStart(2, "0");
            const durationFormatted = `${minutes}:${seconds}`;
            const fileSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";

            setCleanData({
                title,
                titleId,
                performers,
                songwriters,
                year,
                isrc,
                album,
                albumId,
                trackNumber,
                genre,
                label,
                durationFormatted,
                fileSize
            });

            const combinedMetadata = {
                ...metadata,
                fileInfo: {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                }
            };

            const cleanedMetadata = JSON.parse(
                JSON.stringify(combinedMetadata, (key, value) => {
                    if (key === "data" && typeof value === "object") {
                        return "Image binary data hidden for convenience";
                    }
                    return value;
                })
            );

            setMetadata(cleanedMetadata);
            fetchMusicBrainzData(isrc);
            fetchMusicfetchData(isrc);
        } catch (error) {
            console.error("Error reading metadata:", error);
        }
    };

    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0) {
            handleFileUpload(acceptedFiles[0]);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: "audio/*",
        multiple: false,
    });

    return (
        <div className="container">
            <h1>Metatietolukija</h1>

            <div className="upload-header-row">
                <div className="album-art">
                    {albumArt ? (
                        <img src={albumArt} alt="Album Art" />
                    ) : (
                        <div className="album-art-placeholder">Ei kuvaa</div>
                    )}
                </div>

                <div className="upload-area" {...getRootProps()}>
                    <input {...getInputProps()} />
                    {isDragActive ? (
                        <p>Pudota audiotiedosto tähän...</p>
                    ) : (
                        <p>Pudota audiotiedosto tai klikkaa tästä...</p>
                    )}
                </div>
                <br/>
                <input
                    type="text"
                    className="url-input"
                    placeholder="Liitä linkki..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="url-input"
                />
                <button onClick={handleFetchByUrl}>Musicfetch-haku</button>

            </div>

            {fileName && <p><strong>Tiedosto:</strong> {fileName}</p>}
            <div className="tab-buttons">
                <button
                    className={activeTab === "default" ? "active" : ""}
                    onClick={() => setActiveTab("default")}
                >
                    Oletusnäkymä
                </button>
                <button
                    className={activeTab === "musicfetch" ? "active" : ""}
                    onClick={() => setActiveTab("musicfetch")}
                >
                    Musicfetch-näkymä
                </button>
            </div>
            {metadata && activeTab === "default" && (
                <div className="columns-wrapper">

                    {/* Yleistiedot and Artist Info (Left Column) */}
                    <div className="left-column">

                        {/* Yleistiedot Panel */}
                        <div className="panel clean-metadata">
                            <h2>Yleistiedot</h2>
                            <div className="metadata-columns">
                                <div className="metadata-column">
                                    <p><strong>Kappale:</strong><br />
                                        {cleanData.titleId ? (
                                            <a href={`https://music.apple.com/song/${cleanData.titleId}`} target="_blank" rel="noopener noreferrer">
                                                {cleanData.title}
                                            </a>
                                        ) : cleanData.title}
                                        {romanizeIfHangul(cleanData.title) && (
                                            <div className="romanized">{romanizeIfHangul(cleanData.title)}</div>
                                        )}
                                    </p>

                                    <div className="sub-info">
                                        <p><strong>Albumilta:</strong><br />
                                            {cleanData.albumId ? (
                                                <a href={`https://music.apple.com/album/${cleanData.albumId}`} target="_blank" rel="noopener noreferrer">
                                                    {cleanData.album}
                                                </a>
                                            ) : cleanData.album}
                                            {romanizeIfHangul(cleanData.album) && (
                                                <div className="romanized">{romanizeIfHangul(cleanData.album)}</div>
                                            )}
                                        </p>
                                    </div>

                                    <p><strong>Uranumero:</strong><br />{cleanData.trackNumber}</p>
                                    <p><strong>Levy-yhtiö:</strong><br />{cleanData.label}</p>
                                    <p><strong>Julkaisuvuosi:</strong><br />{cleanData.year}</p>
                                    <p><strong>Kesto:</strong><br />{cleanData.durationFormatted}</p>
                                    <p><strong>Tiedostokoko:</strong><br />{cleanData.fileSize}</p>
                                </div>

                                <div className="metadata-column">
                                    <p><strong>Esittäjät:</strong><br />
                                        {cleanData.performers
                                            ? cleanData.performers.split(/,|&/).map((name, idx) => (
                                                <div key={idx}>
                                                    {name.trim()}
                                                    {romanizeIfHangul(name) && (
                                                        <div className="romanized">{romanizeIfHangul(name)}</div>
                                                    )}
                                                </div>
                                            ))
                                            : ""}
                                    </p>

                                    <p><strong>ISRC:</strong><br />{cleanData.isrc}</p>

                                    {cleanData.songwriters.length > 0 && (
                                        <p><strong>Tekijät:</strong><br />
                                            {cleanData.songwriters.map((name, idx) => (
                                                <div key={idx}>
                                                    {name}
                                                    {romanizeIfHangul(name) && (
                                                        <div className="romanized">{romanizeIfHangul(name)}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </p>
                                    )}

                                    <p><strong>Laji:</strong><br />{cleanData.genre}</p>
                                </div>
                            </div>
                        </div>

                        {/* If we have fetched expanded artist details, display them */}
                        {artistDetails.length > 0 && (
                            <div>
                                <h3>MusicBrainz-metadata (esittäjät)</h3>
                                {artistDetails.length > 0 && (
                                    <div>
                                        {artistDetails.map((artist) => (
                                            <div key={artist.id} className="panel artist-info">
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <h3>{artist.name}</h3>
                                                    <button
                                                        className="toggle-button"
                                                        onClick={() => toggleArtistJson(artist.id)}
                                                    >
                                                        {artistJsonVisibility[artist.id] ? "Tekstinäkymä" : "JSON-näkymä"}
                                                    </button>
                                                </div>
                                                {artistJsonVisibility[artist.id] ? (
                                                    <JsonView
                                                        src={artist}
                                                        name={false}
                                                        collapsed={2}
                                                        displayDataTypes={false}
                                                        enableClipboard={false}
                                                        style={{ fontSize: "13px" }}
                                                    />
                                                ) : (
                                                    <pre style={{ fontSize: "13px" }}>{JSON.stringify(artist, null, 2)}</pre>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                            </div>
                        )}


                    </div>

                    {/* Tiedoston metadata (Middle Column) */}
                    <div className="panel full-metadata">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h2>Tiedoston metadata</h2>
                            <button className="toggle-button" onClick={() => setShowFullJson(prev => !prev)}>
                                {showFullJson ? "Tekstinäkymä" : "JSON-näkymä"}
                            </button>
                        </div>
                        {showFullJson ? (
                            <JsonView src={metadata} name={false} collapsed={2} displayDataTypes={false} enableClipboard={false} style={{ fontSize: '13px' }} />
                        ) : (
                            <pre>{JSON.stringify(metadata, null, 2)}</pre>
                        )}
                    </div>

                    {/* MusicBrainz metadata (Right Column) */}
                    <div className="panel musicbrainz">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h2>MusicBrainz-metadata</h2>
                            <button className="toggle-button" onClick={() => setShowBrainzJson(prev => !prev)}>
                                {showBrainzJson ? "Tekstinäkymä" : "JSON-näkymä"}
                            </button>
                        </div>
                        {showBrainzJson ? (
                            <JsonView src={musicBrainzData} name={false} collapsed={2} displayDataTypes={false} enableClipboard={false} style={{ fontSize: '13px' }} />
                        ) : (
                            <pre>{JSON.stringify(musicBrainzData, null, 2)}</pre>
                        )}
                    </div>

                </div>
            )}

            {metadata && activeTab === "musicfetch" && (
                <div className="panel musicfetch-result">
                    <h2>Musicfetch-näkymä</h2>
                    {musicfetchData?.result ? (
                        <pre>{JSON.stringify(musicfetchData.result, null, 2)}</pre>
                    ) : musicfetchData?.error ? (
                        <p>Virhe: {musicfetchData.error}</p>
                    ) : (
                        <p>Ei tuloksia Musicfetchiltä.</p>
                    )}
                </div>
            )}

        </div>
    );
}

export default App;