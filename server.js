const express = require('express');
const ytdl = require('@spacepumpkin/ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const YT_COOKIES = process.env.YT_COOKIES || '';
const YT_ID_TOKEN = process.env.YT_ID_TOKEN || '';

// Add bpctr parameter to bypass age restriction (key fix for 410)
function addBypassParams(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bpctr=9999999999&has_verified=1`;
}

app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        // Add bypass parameters to URL before making request
        const videoUrl = addBypassParams(url);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        if (YT_COOKIES) headers['Cookie'] = YT_COOKIES;
        if (YT_ID_TOKEN) headers['x-youtube-identity-token'] = YT_ID_TOKEN;
        
        const info = await ytdl.getInfo(videoUrl, { requestOptions: { headers } });
        
        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${info.videoDetails.videoId}/maxresdefault.jpg`,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoId: info.videoDetails.videoId
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
    }
});

app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    
    try {
        const videoUrl = addBypassParams(url);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        if (YT_COOKIES) headers['Cookie'] = YT_COOKIES;
        if (YT_ID_TOKEN) headers['x-youtube-identity-token'] = YT_ID_TOKEN;
        
        const info = await ytdl.getInfo(videoUrl, { requestOptions: { headers } });
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) return res.status(400).json({ error: 'Format not available' });
        
        const filename = `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.${format.hasVideo ? 'mp4' : 'mp3'}`;
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        ytdl(videoUrl, { quality: itag, requestOptions: { headers } }).pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
