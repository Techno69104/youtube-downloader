const express = require('express');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;
        
        res.json({
            title: videoDetails.title,
            thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
            duration: videoDetails.lengthSeconds,
            channel: videoDetails.author.name,
            videoId: videoDetails.videoId
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch video information' });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, itag, format } = req.query;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    
    try {
        const info = await ytdl.getInfo(url);
        const formatToDownload = info.formats.find(f => f.itag == itag);
        
        if (!formatToDownload) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        const filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.${format}`;
        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        
        ytdl(url, { quality: itag })
            .on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Download failed' });
                }
            })
            .pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
