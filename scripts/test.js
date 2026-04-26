const http = require('http');
http.get('http://localhost:3001/data/websites/samyangfoods.com/gradient.png', (res) => {
  console.log(res.statusCode);
});
