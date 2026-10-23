'use strict';

/** Escapes user input so it can be embedded safely inside a RegExp. */
function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
