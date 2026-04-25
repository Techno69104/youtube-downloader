const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Helper function to extract cookies from environment variable
function getCookies() {
    // You can set this in Render environment variables
    if (process.env.YT_COOKIE) {
        return process.env.YT_COOKIE;
    }
    return '';
}

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        console.log('Fetching info for:', url);
        
        // Request options with cookies to avoid 410 error
        const requestOptions = {};
        const cookies = getCookies();
        
        if (cookies) {
            requestOptions.headers = {
                cookie: cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        
        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoId: info.videoDetails.videoId,
            available: true
        });
    } catch (error) {
        console.error('Error:', error.message);
        
        // Check if it's an age-restricted video
        if (error.message.includes('410')) {
            res.status(410).json({ 
                error: 'Video may be age-restricted or not available in your region. Try a different video.',
                code: 'AGE_RESTRICTED'
            });
        } else {
            res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
        }
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    
    try {
        const requestOptions = {};
        const cookies = getCookies();
        
        if (cookies) {
            requestOptions.headers = {
                cookie: cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        const extension = format.hasVideo ? 'mp4' : 'mp3';
        const filename = `${safeTitle}.${extension}`;
        
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        const stream = ytdl(url, { quality: itag, requestOptions });
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
});
