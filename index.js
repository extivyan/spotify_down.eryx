const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.options(/(.*)/, cors());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/api/spotify/download', async (req, res) => {
    const spotifyUrl = req.body.url;
    
    if (!spotifyUrl) {
        return res.status(400).json({ success: false, error: 'يرجى توفير رابط أغنية Spotify' });
    }

    const headers = {
        "accept": "*/ *",
        "accept-language": "en-US,en;q=0.9,ar;q=0.8",
        "content-type": "application/json",
        "referrer": "https://all-free-download.net/"
    };

    try {
        console.log(`🎵 جاري بدء معالجة الأغنية: ${spotifyUrl}`);

        const startResponse = await axios.post("https://api.all-free-download.net/api/spotify/start", {
            url: spotifyUrl
        }, { headers });

        const jobId = startResponse.data.job_id || startResponse.data.id;
        if (!jobId) {
            return res.status(500).json({ success: false, message: "لم يتم العثور على job_id" });
        }

        let fileName = null;
        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
            attempts++;
            await sleep(2000);

            const progressUrl = `https://api.all-free-download.net/api/ytdl/progress/${jobId}`;
            const progressRes = await axios.get(progressUrl, {
                headers: { "accept": "*/*", "referrer": "https://all-free-download.net/" }
            });

            console.log(`📥 محاولة ${attempts} - الحالة:`, progressRes.data.status);

            if (progressRes.data.status === 'done') {
                fileName = progressRes.data.file;
                break;
            }
        }

        if (!fileName) {
            return res.status(500).json({ success: false, message: "انتهت مهلة المعالجة." });
        }

        // بناء الرابط الصحيح الذي اكتشفناه من الـ Network
        const downloadUrl = `https://api.all-free-download.net/api/ytdl/file/${jobId}?name=${encodeURIComponent(fileName)}`;
        console.log(`📥 جاري سحب وتحويل الملف من: ${downloadUrl}`);

        const fileResponse = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            headers: { 
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "referrer": "https://all-free-download.net/" 
            }
        });

        // ضبط الـ Headers لكي يستقبل العميل الملف بصيغة صوتية صحيحة
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'audio/mpeg');

        fileResponse.data.pipe(res);

    } catch (error) {
        console.error("Error:", error.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'فشل المعالجة', details: error.message });
        }
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}