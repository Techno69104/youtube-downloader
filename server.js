const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get credentials from environment variables
const YT_COOKIES = process.env.YT_COOKIES || '';
const YT_ID_TOKEN = process.env.YT_ID_TOKEN || '';

console.log('=== YouTube Downloader Starting ===');
console.log(`Cookies configured: ${YT_COOKIES ? '✅ YES' : '❌ NO'}`);
console.log(`ID Token configured: ${YT_ID_TOKEN ? '✅ YES' : '❌ NO'}`);

// Add age verification parameter to URL
function addAgeVerificationParam(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bpctr=${Date.now()}&has_verified=1`;
}

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
        
        // Build headers with both cookie AND identity token
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        if (YT_COOKIES) {
            headers['Cookie'] = YT_COOKIES;
        }
        
        if (YT_ID_TOKEN) {
            headers['x-youtube-identity-token'] = YT_ID_TOKEN;
        }
        
        const requestOptions = { headers };
        
        let videoUrl = url;
        let info;
        
        try {
            info = await ytdl.getInfo(videoUrl, { requestOptions });
        } catch (firstError) {
            console.log('First attempt failed, retrying with age verification...');
            videoUrl = addAgeVerificationParam(url);
            info = await ytdl.getInfo(videoUrl, { requestOptions });
        }
        
        const videoDetails = info.videoDetails;
        
        const thumbnail = videoDetails.thumbnails && videoDetails.thumbnails.length > 0 
            ? videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url 
            : `https://img.youtube.com/vi/${videoDetails.videoId}/maxresdefault.jpg`;
        
        res.json({
            title: videoDetails.title,
            thumbnail: thumbnail,
            duration: videoDetails.lengthSeconds,
            author: videoDetails.author.name,
            videoId: videoDetails.videoId,
            available: true
        });
        
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
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        if (YT_COOKIES) {
            headers['Cookie'] = YT_COOKIES;
        }
        
        if (YT_ID_TOKEN) {
            headers['x-youtube-identity-token'] = YT_ID_TOKEN;
        }
        
        const requestOptions = { headers };
        
        let videoUrl = url;
        let info;
        
        try {
            info = await ytdl.getInfo(videoUrl, { requestOptions });
        } catch (firstError) {
            videoUrl = addAgeVerificationParam(url);
            info = await ytdl.getInfo(videoUrl, { requestOptions });
        }
        
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        const extension = format.hasVideo ? 'mp4' : 'mp3';
        const filename = `${safeTitle}.${extension}`;
        
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        const stream = ytdl(videoUrl, { quality: itag, requestOptions });
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
    console.log('Ready to download YouTube videos!');
});
