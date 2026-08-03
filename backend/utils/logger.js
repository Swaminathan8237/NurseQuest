/**
 * Utility functions for safe logging and output neutralization.
 * Prevents CWE-117 Log Injection / Log Forging and CWE-116 Improper Output Encoding.
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

/**
 * Escapes HTML metacharacters so untrusted text can be safely interpolated into markup
 * (CWE-116). Use for any user-supplied value placed inside an HTML template literal —
 * notably outbound emails, which render in the recipient's mail client.
 *
 * Escapes the five characters that can break out of element or attribute context. Not a
 * substitute for context-aware encoding inside <script>, <style>, or a URL attribute.
 *
 * @param {any} input - Value to escape; non-strings are coerced, null/undefined become ''
 * @returns {string} HTML-safe string
 */
function escapeHtml(input) {
  if (input === null || input === undefined) return '';
  const str = typeof input === 'string' ? input : String(input);
  return str.replace(/[&<>'"]/g, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return ch;
    }
  });
}

module.exports = {
  sanitizeLogInput,
  escapeHtml
};
