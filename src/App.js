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

            setMusicBrainzData(data);

            const artistIds = [];
            data.recordings?.forEach((recording) => {
                recording["artist-credit"]?.forEach((credit) => {
                    if (credit.artist && credit.artist.id) {
                        artistIds.push(credit.artist.id);
                    }
                });
            });
            const uniqueArtistIds = [...new Set(artistIds)];

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
                    return { ...artistData };
                })
            );

            setArtistDetails(fetchedArtists);
        } catch (error) {
            console.error("MusicBrainz fetch error:", error);
            setMusicBrainzData({ error: "No data found or failed to fetch." });
            setArtistDetails([]);
        }
    };

    const fetchMusicfetchData = async (isrc) => {
        try {
            const response = await fetch(`/.netlify/functions/getMusicfetchTrack?isrc=${isrc}`);
            const data = await response.json();
            console.log("Musicfetch result:", data);
            setMusicfetchData(data);
        } catch (err) {
            console.error("Error fetching from Musicfetch function:", err);
        }
    };

    const handleFileUpload = useCallback(async (file) => {
        if (!file) return;

        setFileName(file.name);
        setUrlInput("");
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
    }, []);