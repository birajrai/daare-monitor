require('dotenv').config();
const { Client } = require('pg');

async function addMonitorTypeColumn(client) {
    await client.query(`
        ALTER TABLE monitors
        ADD COLUMN IF NOT EXISTS monitor_type TEXT NOT NULL DEFAULT 'http'
    `);
    await client.query(`
        UPDATE monitors
        SET monitor_type = 'http'
        WHERE monitor_type IS NULL OR monitor_type = ''
    `);
}

(async () => {
    const uri = process.env.DATABASE_URL;
    if (!uri) {
        console.error('Missing DATABASE_URL in environment.');
        process.exit(1);
    }

    const client = new Client({ connectionString: uri });

    try {
        await client.connect();
        console.log('Adding monitor_type column...');
        await addMonitorTypeColumn(client);
        console.log('Database schema updated successfully.');
    } catch (err) {
        console.error('Failed to update database schema:', err.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
})();
