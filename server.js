const express = require('express');
const twilio = require('twilio');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Note: Static files are served directly by Vercel, not by Express

// Note: Twilio SDK is now served from public folder

// Twilio credentials (will be set from environment variables)
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let client;
if (accountSid && authToken) {
    client = twilio(accountSid, authToken);
}

// Route to get access token for Twilio Voice SDK
app.post('/token', (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'Twilio not configured. Please set environment variables.' });
    }

    if (!process.env.TWILIO_TWIML_APP_SID) {
        return res.status(500).json({ error: 'TwiML Application SID not configured.' });
    }

    if (!process.env.TWILIO_API_KEY || !process.env.TWILIO_API_SECRET) {
        return res.status(500).json({ error: 'Twilio API Key and Secret are required for Voice SDK.' });
    }

    try {
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        // Create an access token using proper API Key and Secret
        const accessToken = new AccessToken(
            accountSid,
            process.env.TWILIO_API_KEY,    // Proper API Key SID
            process.env.TWILIO_API_SECRET, // Proper API Secret
            { 
                identity: 'user', // Must match the client name in TwiML
                ttl: 3600 // 1 hour
            }
        );

        // Create a Voice grant and add to token
        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
            incomingAllow: true,
        });
        accessToken.addGrant(voiceGrant);

        console.log('✅ Access token generated for browser-client');

        // Return token as JSON
        res.json({
            token: accessToken.toJwt()
        });
    } catch (error) {
        console.error('❌ Token generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate access token',
            details: error.message 
        });
    }
});

// Route to handle outgoing calls
app.post('/call', async (req, res) => {
    const { to } = req.body;

    if (!client) {
        return res.status(500).json({ error: 'Twilio not configured' });
    }

    if (!to) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        const call = await client.calls.create({
            url: `${req.protocol}://${req.get('host')}/twiml`,
            to: to,
            from: twilioPhoneNumber
        });

        res.json({ 
            success: true, 
            callSid: call.sid,
            message: 'Call initiated successfully'
        });
    } catch (error) {
        console.error('Error making call:', error);
        res.status(500).json({ 
            error: 'Failed to make call',
            details: error.message 
        });
    }
});

// TwiML endpoint for call handling
app.post('/twiml', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // This will connect the call to the browser client
    const dial = twiml.dial();
    dial.client('user');

    res.type('text/xml');
    res.send(twiml.toString());
});

// Health check endpoint
app.get('/health', (req, res) => {
    const config = {
        accountSid: !!accountSid,
        authToken: !!authToken,
        phoneNumber: !!twilioPhoneNumber,
        twimlAppSid: !!process.env.TWILIO_TWIML_APP_SID,
        apiKey: !!process.env.TWILIO_API_KEY,
        apiSecret: !!process.env.TWILIO_API_SECRET
    };

    res.json({
        status: 'Server running',
        twilioConfigured: Object.values(config).every(Boolean),
        config
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`🚀 Dialer server running on http://localhost:${port}`);
        console.log(`📱 Twilio configured: ${!!client}`);
        
        if (!client) {
            console.log('⚠️  Please configure Twilio environment variables to enable calling');
        }
    });
}

// Export for Vercel
module.exports = app; 