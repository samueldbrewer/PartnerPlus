const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end('<h1>Welcome to PartnerPlus!</h1><p>Your app is running successfully.</p>');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});