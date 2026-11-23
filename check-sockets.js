const { io } = require('socket.io-client');

const token = process.env.TEST_JWT;
const url = 'http://localhost:4000';

const clients = [1, 2].map(n => {
  const client = io(url, {
    auth: { token },
    reconnection: false
  });

  client.on('connect', () => console.log(`Client ${n}: connected`));
  client.on('connect_error', e => console.log(`Client ${n}: ${e.message}`));

  return client;
});

setTimeout(async () => {
  const response = await fetch(url + '/metrics');
  console.log('Metrics:', await response.text());
  clients.forEach(c => c.disconnect());
}, 3000);
