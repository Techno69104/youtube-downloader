const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your WordPress site
app.use(cors({
    origin: ['https://tools.rozgar-alerts.com', 'https://rozgar-alerts.com']
}));
app.use(express.json());
app.use(express.static('.'));

// Serve the HTML interface
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        console.log('Fetching info for:', url);
        const info = await ytdl.getInfo(url);
        
        const response = {
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoId: info.videoDetails.videoId,
            formats: info.formats.filter(f => f.hasVideo || f.hasAudio).map(f => ({
                itag: f.itag,
                quality: f.qualityLabel || f.quality,
                container: f.container,
                hasVideo: f.hasVideo,
                hasAudio: f.hasAudio,
                contentLength: f.contentLength
            }))
        };
        
        res.json(response);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    
    try {
        const info = await ytdl.getInfo(url);
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        // Create safe filename
        const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        const extension = format.hasVideo ? 'mp4' : 'mp3';
        const filename = `${safeTitle}.${extension}`;
        
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        // Stream the video
        const stream = ytdl(url, { quality: itag });
        stream.pipe(res);
        
        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  POST /api/info - Get video info`);
    console.log(`  GET  /api/download - Download video`);
});
