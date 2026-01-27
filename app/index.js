const express = require('express');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  logger.info('Hello World endpoint called');
  res.json({ message: 'Hello World!' });
});

app.get('/health', (req, res) => {
  logger.info('Health check called');
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});
