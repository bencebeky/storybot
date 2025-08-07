// Simple in-memory rate limiting (resets on function restart)
const rateLimitMap = new Map();

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }

    // Rate limiting: 100 requests per 10 minutes
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const maxRequests = 100;

    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, {
            count: 1,
            resetTime: now + windowMs
        });
    } else {
        const clientData = rateLimitMap.get(clientIP);
        if (now > clientData.resetTime) {
            clientData.count = 1;
            clientData.resetTime = now + windowMs;
        } else {
            clientData.count++;
            if (clientData.count > maxRequests) {
                return res.status(429).json({
                    error: 'Too many requests. Please try again later.',
                    retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
                });
            }
        }
    }

    try {
        const {
            systemInstruction,
            contents
        } = req.body;

        if (!contents || !Array.isArray(contents)) {
            return res.status(400).json({
                error: 'Contents array is required'
            });
        }

        const model = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const requestBody = {
            systemInstruction,
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 100,
                stopSequences: ['.'],
                thinkingConfig: {
                    thinkingBudget: 0
                },
            }

        };

        const options = {
            method: 'POST',
            headers: {
                'x-goog-api-key': process.env.GEMINI_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        };

        const response = await fetch(url, options);

        if (!response.ok) {
            const errorData = await response.text();
            return res.status(response.status).json({
                error: 'Gemini API request failed',
                details: errorData,
            });
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}
