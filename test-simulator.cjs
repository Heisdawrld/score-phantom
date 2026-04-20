const http = require('http');
const req = http.request('http://localhost:3000/api/simulator/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
});
req.write(JSON.stringify({
  home_team_id: 33, away_team_id: 34, home_team_name: 'Man Utd', away_team_name: 'Newcastle', modifiers: {}
}));
req.end();
req.on('response', res => {
  let data = '';
  res.on('data', c => data+=c);
  res.on('end', () => console.log(res.statusCode, data));
});
