// Odds utility functions
export function impliedProbability(decimalOdds) {
  if (!decimalOdds || decimalOdds <= 1) return null;
  return parseFloat((1 / decimalOdds).toFixed(4));
}

export function computeEdge(modelProb, decimalOdds) {
  const implied = impliedProbability(decimalOdds);
  if (implied === null) return { implied: null, edge: null, isValue: false };
  const edge = modelProb - implied;
  return {
    implied: parseFloat(implied.toFixed(4)),
    edge: parseFloat(edge.toFixed(4)),
    isValue: edge > 0.04,
    edgePct: parseFloat((edge * 100).toFixed(1)),
  };
}

export function marketValueLabel(edgeDiff) {
  if (edgeDiff === null || edgeDiff === undefined) return "UNAVAILABLE";
  if (edgeDiff > 0.10) return "STRONG";
  if (edgeDiff > 0.05) return "FAIR";
  return "WEAK";
}
