const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on('error', (err, req, res) => {
  console.error('Proxy forwarding error:', err.message);
  if (res && res.writeHead) {
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    } catch (e) {}
  }
});

const server = http.createServer((req, res) => {
  if (
    req.url.startsWith('/api') ||
    req.url.startsWith('/docs') ||
    req.url.startsWith('/openapi.json')
  ) {
    proxy.web(req, res, { target: 'http://127.0.0.1:8000' });
  } else {
    proxy.web(req, res, { target: 'http://127.0.0.1:8081' });
  }
});

server.on('upgrade', (req, socket, head) => {
  // Keep-alive settings for WebSocket socket connection to prevent premature timeouts
  socket.setKeepAlive(true, 10000);
  if (req.url.startsWith('/ws')) {
    proxy.ws(req, socket, head, { target: 'http://127.0.0.1:8000' });
  } else {
    proxy.ws(req, socket, head, { target: 'http://127.0.0.1:8081' });
  }
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Unified Gateway Proxy listening on http://0.0.0.0:${PORT}`);
});
