const http = require('http');

// Start server for test verification
const { server, db } = require('./server');

const PORT = process.env.PORT || 8080;

function runTests() {
  console.log('Running automated health & integration tests...');
  
  setTimeout(() => {
    http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.status === 'ok') {
            console.log('✓ Health check passed');
            db.close();
            server.close(() => {
              console.log('All tests completed successfully.');
              process.exit(0);
            });
          } else {
            console.error('✗ Health check returned invalid response:', data);
            process.exit(1);
          }
        } catch (err) {
          console.error('✗ Failed to parse health response:', err);
          process.exit(1);
        }
      });
    }).on('error', (err) => {
      console.error('✗ HTTP connection error:', err.message);
      process.exit(1);
    });
  }, 1000);
}

runTests();
