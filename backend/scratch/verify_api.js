const http = require('http');

http.get('http://localhost:3001/api/quizzes', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const list = JSON.parse(data);
      const units = list.filter(q => q.unit).sort((a, b) => a.unit - b.unit);
      console.log('LIVE API UNITS (count: ' + units.length + '):');
      units.forEach(q => console.log('Unit ' + q.unit + ': ' + q.title));
    } catch (e) {
      console.log('Error parsing JSON:', data);
    }
    process.exit(0);
  });
}).on('error', err => {
  console.log('HTTP Error:', err.message);
  process.exit(0);
});
