const sqlite3 = require('sqlite3').verbose();
const dbPath = './data/status.db';

const db = new sqlite3.Database(dbPath, err => {
    if (err) {
        console.error('Failed to connect to the database:', err.message);
        process.exit(1);
    }
});

const addColumn = (columnName, columnType) => {
    return new Promise((resolve, reject) => {
        db.run(`ALTER TABLE monitors ADD COLUMN ${columnName} ${columnType};`, err => {
            if (err && !err.message.includes('duplicate column name')) {
                return reject(err);
            }
            resolve();
        });
    });
};

(async () => {
    try {
        console.log('Adding last_checked_at column...');
        await addColumn('last_checked_at', 'DATETIME DEFAULT NULL');

        console.log('Adding update_interval column...');
        await addColumn('update_interval', 'INTEGER DEFAULT 60000');

        console.log('Database schema updated successfully.');
    } catch (err) {
        console.error('Failed to update database schema:', err.message);
    } finally {
        db.close();
    }
})();
