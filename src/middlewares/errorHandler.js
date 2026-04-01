// src/middlewares/errorHandler.js
// Centralised error handler — logs the error and returns JSON response
export default function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  // Log full stack in development, concise message in production
  if (process.env.NODE_ENV === 'production') {
    console.error(`[Error] ${req.method} ${req.path} — ${status} — ${err.message}`);
  } else {
    console.error(err.stack);
  }

  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
  });
}
