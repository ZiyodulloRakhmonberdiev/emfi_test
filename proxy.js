// Улучшенный прокси-сервер для обхода CORS и отладки запросов
const http = require('http');
const https = require('https');
const url = require('url');

// Порт, на котором будет работать прокси
const PORT = 8080;

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
    // Разрешаем CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Обрабатываем preflight запросы
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Получаем параметры запроса из URL
    const queryParams = url.parse(req.url, true).query;
    const targetUrl = queryParams.url;
    
    if (!targetUrl) {
        res.writeHead(400);
        res.end('Missing url parameter');
        return;
    }
    
    console.log(`\n[PROXY] Forwarding request to: ${targetUrl}`);
    console.log(`[PROXY] Method: ${req.method}`);
    
    // Получаем заголовки из запроса
    const headers = {};
    for (const key in req.headers) {
        // Пропускаем заголовки хоста и соединения
        if (key !== 'host' && key !== 'connection') {
            headers[key] = req.headers[key];
        }
    }
    
    console.log('[PROXY] Headers:', headers);
    
    // Собираем тело запроса
    let requestBody = [];
    req.on('data', (chunk) => {
        requestBody.push(chunk);
    });
    
    req.on('end', () => {
        requestBody = Buffer.concat(requestBody).toString();
        
        if (requestBody) {
            console.log('[PROXY] Request body:', requestBody);
        }
        
        // Парсим URL для запроса
        const parsedUrl = url.parse(targetUrl);
        
        // Опции для запроса
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: req.method,
            headers: headers
        };
        
        // Создаем запрос к целевому серверу
        const proxyReq = https.request(options, (proxyRes) => {
            console.log(`[PROXY] Response status: ${proxyRes.statusCode}`);
            console.log('[PROXY] Response headers:', proxyRes.headers);
            
            // Устанавливаем статус и заголовки ответа
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            
            // Собираем тело ответа для логирования
            let responseBody = [];
            proxyRes.on('data', (chunk) => {
                responseBody.push(chunk);
                res.write(chunk); // Передаем данные клиенту
            });
            
            proxyRes.on('end', () => {
                responseBody = Buffer.concat(responseBody).toString();
                console.log('[PROXY] Response body:', responseBody);
                res.end(); // Завершаем ответ
            });
        });
        
        // Обрабатываем ошибки запроса
        proxyReq.on('error', (error) => {
            console.error('[PROXY] Error:', error);
            res.writeHead(500);
            res.end('Proxy error: ' + error.message);
        });
        
        // Отправляем тело запроса, если оно есть
        if (requestBody) {
            proxyReq.write(requestBody);
        }
        
        proxyReq.end();
    });
});

// Запускаем сервер
server.listen(PORT, () => {
    console.log(`CORS Proxy server running at http://localhost:${PORT}`);
    console.log(`Use it like: http://localhost:${PORT}?url=https://example.com/api`);
});
