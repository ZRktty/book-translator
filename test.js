const assert = require('assert');
const BookTranslator = require('./index.js');

try {
    const translator = new BookTranslator();
    assert.ok(translator, 'BookTranslator class should be instantiated.');
    console.log('Test passed: BookTranslator class can be instantiated.');
} catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
}
