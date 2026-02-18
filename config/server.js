require('dotenv').config();

module.exports = {
  host: '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  trustProxy: false,
};
