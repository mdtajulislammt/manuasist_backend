import type { NaiFactorScore } from './nai-score-breakdown.util';

export function buildNaiScoreFeedback(
  breakdown: NaiFactorScore[],
  overallScore: number | null,
): string {
  if (overallScore === null) {
    return 'Log meals or scan a menu to see your personalized NAI breakdown and tips.';
  }

  const scored = breakdown.filter((row) => row.score !== null);
  const strengths = scored
    .filter((row) => (row.score ?? 0) >= 85)
    .map((row) => row.title.replace(/\s*\([^)]*\)\s*/, '').trim());
  const weaknesses = scored
    .filter((row) => (row.score ?? 100) < 70)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  if (weaknesses.length === 0 && strengths.length > 0) {
    return `Great job! Your ${strengths.slice(0, 2).join(' and ').toLowerCase()} are excellent. Keep your current habits to stay in the ${overallScore >= 90 ? '90s' : 'top range'}.`;
  }

  if (weaknesses.length > 0 && strengths.length > 0) {
    const weak = weaknesses[0].title.replace(/\s*\([^)]*\)\s*/, '').toLowerCase();
    const strong = strengths[0].replace(/\s*\([^)]*\)\s*/, '').toLowerCase();
    return `Great job! Your ${strong} is excellent. Improving ${weak} could push your score into the 90s.`;
  }

  if (weaknesses.length > 0) {
    const weak = weaknesses[0].title.replace(/\s*\([^)]*\)\s*/, '').toLowerCase();
    return `Focus on improving your ${weak} this week to raise your overall NAI score.`;
  }

  return `Your NAI score is ${overallScore}. Keep logging meals to unlock deeper insights.`;
}
