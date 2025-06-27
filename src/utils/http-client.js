/**
 * HTTP Client utility using Node.js built-in modules
 * Replacement for node-fetch to avoid external dependencies
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Simple fetch replacement using Node.js built-in modules
 * @param {string} url - The URL to fetch
 * @param {object} options - Request options
 * @returns {Promise} - Promise that resolves to response-like object
 */
function nodeFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = client.request(requestOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const response = {
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    json: () => {
                        try {
                            return Promise.resolve(JSON.parse(data));
                        } catch (error) {
                            return Promise.reject(new Error('Invalid JSON response'));
                        }
                    },
                    text: () => Promise.resolve(data)
                };
                resolve(response);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        // Write request body if provided
        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

module.exports = { nodeFetch };
