const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get video information using free API
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        // Extract video ID
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        // Use free API to get video info
        const apiUrl = `https://p.oceansaver.in/ajax/download.php?format=mp4&url=https://www.youtube.com/watch?v=${videoId}&api=dfcb6d76f2f6a9894bc6280449c7911b`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        if (response.data && response.data.video) {
            res.json({
                title: response.data.video.title || 'YouTube Video',
                thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                duration: response.data.video.duration || 0,
                author: response.data.video.author || 'YouTube',
                videoId: videoId,
                downloadUrl: response.data.downloadUrl || null
            });
        } else {
            throw new Error('No video data received');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video info. Please try again.' });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        // Get download link from API
        const apiUrl = `https://p.oceansaver.in/ajax/download.php?format=mp4&url=https://www.youtube.com/watch?v=${videoId}&api=dfcb6d76f2f6a9894bc6280449c7911b`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && response.data.downloadUrl) {
            // Redirect to the download URL
            res.redirect(response.data.downloadUrl);
        } else {
            throw new Error('Download URL not available');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

// Helper function to extract video ID
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
