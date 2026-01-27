const express = require('express');
const log4js = require('log4js');

log4js.configure({
  appenders: { 
    out: { type: 'stdout' }
  },
  categories: { 
    default: { appenders: ['out'], level: 'info' }
  }
});

const logger = log4js.getLogger();
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  logger.info('Hello World endpoint called');
  res.json({ message: 'Hello World!' });
});

app.get('/health', (req, res) => {
  logger.debug('Health check called');
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});
