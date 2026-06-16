// LiteSpeed Passenger entry point
// Passenger communicates via a socket, not a TCP port.
// It sets process.env.PORT or uses a Unix socket automatically.
if (typeof process.env.PORT === 'undefined') {
  process.env.PORT = '4000';
}

(async () => {
  try {
    await import('./app.js');
  } catch (err) {
    console.error('Failed to start app:', err);
    process.exit(1);
  }
})();
