const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Function to execute yt-dlp command
function runYtDlp(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

// Get video information using yt-dlp --dump-json
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        // First update yt-dlp to latest version
        await runYtDlp('yt-dlp -U');
        
        // Get video info as JSON
        const command = `yt-dlp --dump-json --no-warnings "${url}"`;
        const output = await runYtDlp(command);
        const info = JSON.parse(output);
        
        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            author: info.uploader,
            videoId: info.id,
            available: true
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Map quality to yt-dlp format selector
    let format = 'bestvideo[height<=720]+bestaudio/best';
    if (quality === 'mp3') {
        format = 'bestaudio/best';
    }
    
    const tempFile = path.join('/tmp', `video_${Date.now()}.mp4`);
    
    try {
        // First update yt-dlp
        await runYtDlp('yt-dlp -U');
        
        // Download video
        const command = `yt-dlp -f "${format}" --no-warnings -o "${tempFile}" "${url}"`;
        await runYtDlp(command);
        
        // Stream file to response
        const stat = fs.statSync(tempFile);
        res.writeHead(200, {
            'Content-Type': quality === 'mp3' ? 'audio/mpeg' : 'video/mp4',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="youtube_video.${quality === 'mp3' ? 'mp3' : 'mp4'}"`
        });
        
        const readStream = fs.createReadStream(tempFile);
        readStream.pipe(res);
        
        readStream.on('end', () => {
            // Clean up temp file
            fs.unlinkSync(tempFile);
        });
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
        // Clean up if file exists
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
