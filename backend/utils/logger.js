/**
 * Utility functions for safe logging and input neutralization.
 * Prevents CWE-117 Log Injection / Log Forging vulnerabilities.
 */

/**
 * Sanitizes untrusted user input before outputting to log channels.
 * Replaces newlines (\r, \n) and control characters with safe escaped representations,
 * and caps maximum output length to prevent log flooding.
 * 
 * @param {any} input - The input string or object to sanitize
 * @param {number} maxLength - Maximum allowable length (default: 200)
 * @returns {string} Sanitized string safe for console / file logging
 */
function sanitizeLogInput(input, maxLength = 200) {
  if (input === null || input === undefined) return '';
  
  let str = typeof input === 'string' ? input : String(input);
  
  // Replace CRLF and control characters with escaped string representations
  str = str
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
  // Cap length to prevent log flooding / memory exhaust
  if (str.length > maxLength) {
    str = str.substring(0, maxLength) + '...[truncated]';
  }
  
  return str;
}

module.exports = {
  sanitizeLogInput
};
