/**
 * cPanel / Phusion Passenger entry point.
 *
 * cPanel's "Setup Node.js App" feature expects an entry file (usually app.js)
 * in the application root. Passenger sets the PORT env automatically.
 *
 * This file simply boots the real server.
 */
process.env.NODE_ENV = 'production';

import './server/index.js';
