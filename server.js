require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Replicate API Token (set via environment variable)
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API endpoint to generate images
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, resolution, aspect_ratio, output_format, safety_filter_level } = req.body;

    const response = await fetch('https://api.replicate.com/v1/models/google/nano-banana-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          prompt: prompt || 'A beautiful landscape',
          resolution: resolution || '2K',
          image_input: [],
          aspect_ratio: aspect_ratio || '4:3',
          output_format: output_format || 'png',
          safety_filter_level: safety_filter_level || 'block_only_high'
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'API request failed');
    }

    res.json(data);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎨 Nano Banana Playground running at http://localhost:${PORT}`);
});
