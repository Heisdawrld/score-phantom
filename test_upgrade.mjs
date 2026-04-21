import fetch from 'node-fetch';

async function test() {
  console.log("Fetching live fixtures to find a match...");
  // Let's use our own API to get today's matches
  const res = await fetch('http://localhost:8000/api/value-bet-today');
  if (!res.ok) {
    console.log("Failed to fetch matches. Make sure server is running.");
    return;
  }
  const data = await res.json();
  const matches = data.picks || [];
  if (matches.length === 0) {
    console.log("No matches found in /value-bet-today.");
    return;
  }
  
  const fixId = matches[0].fixture_id;
  console.log(`Testing prediction for fixture ${fixId}...`);
  const predRes = await fetch(`http://localhost:8000/api/predict/${fixId}`);
  const predData = await predRes.json();
  
  console.log("=== PREDICTION RESPONSE KEYS ===");
  console.log(Object.keys(predData));
  
  if (predData.prediction) {
    console.log("\n=== PREDICTION KEYS ===");
    console.log(Object.keys(predData.prediction));
    if (predData.prediction.features) {
       console.log("\n=== FEATURES ===");
       console.log("polymarketOdds:", !!predData.prediction.features.polymarketOdds);
       console.log("homeManager:", !!predData.prediction.features.homeManager);
       console.log("awayManager:", !!predData.prediction.features.awayManager);
    }
  }
  
  if (predData.meta) {
    console.log("\n=== META KEYS ===");
    console.log(Object.keys(predData.meta));
    console.log("momentum length:", predData.meta.momentum ? predData.meta.momentum.length : 0);
    console.log("shotmap length:", predData.meta.shotmap ? predData.meta.shotmap.length : 0);
  }
}
test();
