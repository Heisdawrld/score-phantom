import dotenv from 'dotenv';
dotenv.config();
import { predict } from './src/predictions/poissonEngine.js';

async function main() {
  const pred = await predict("7990", "Bruk-Bet Termalica Nieciecza", "Wisła Płock");
  console.log(JSON.stringify(pred.model, null, 2));
  console.log(JSON.stringify(pred.predictions.recommendation, null, 2));
}

main().catch(console.error);
