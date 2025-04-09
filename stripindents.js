// ... existing code ...
const stripIndents = (value,...values) => {
    if (typeof value !== 'string') {
      const processedString = value.reduce((acc, curr, i) => {
        acc += curr + (values[i] ?? '');
        return acc;
      }, '');
  
      return _stripIndents(processedString);
    }
  
    return _stripIndents(value);  // Fixed: using 'value' instead of 'arg0'
  }
  
  const _stripIndents = (value) => {
    return value
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trimStart()
      .replace(/[\r\n]$/, '');
  }
  
  module.exports = {
    stripIndents
  }