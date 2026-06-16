import { testConnection } from './db.js';

(async () => {
  try {
    const result = await testConnection();
    console.log('✅ Connected to MySQL');
    console.log(result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to connect to MySQL');
    console.error(error.message);
    process.exit(1);
  }
})();
