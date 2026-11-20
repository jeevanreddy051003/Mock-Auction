export const FRANCHISES = [
  { code: 'CSK', name: 'Chennai Super Kings', city: 'Chennai', color: '#FACC15', text: '#000' },
  { code: 'MI', name: 'Mumbai Indians', city: 'Mumbai', color: '#3B82F6', text: '#FFF' },
  { code: 'RCB', name: 'Royal Challengers Bengaluru', city: 'Bengaluru', color: '#EF4444', text: '#FFF' },
  { code: 'KKR', name: 'Kolkata Knight Riders', city: 'Kolkata', color: '#8B5CF6', text: '#FFF' },
  { code: 'SRH', name: 'Sunrisers Hyderabad', city: 'Hyderabad', color: '#F97316', text: '#FFF' },
  { code: 'RR', name: 'Rajasthan Royals', city: 'Jaipur', color: '#EC4899', text: '#FFF' },
  { code: 'DC', name: 'Delhi Capitals', city: 'Delhi', color: '#2563EB', text: '#FFF' },
  { code: 'PBKS', name: 'Punjab Kings', city: 'Punjab', color: '#DC2626', text: '#FFF' },
  { code: 'GT', name: 'Gujarat Titans', city: 'Ahmedabad', color: '#14B8A6', text: '#FFF' },
  { code: 'LSG', name: 'Lucknow Super Giants', city: 'Lucknow', color: '#06B6D4', text: '#FFF' },
];

export const MEGA_CAPPED_SLABS = [18, 14, 11, 18, 14];
export const MEGA_UNCAPPED_SLAB = 4;
export const BASE_PURSE_CR = 120;
export const MIN_SQUAD_SIZE = 18;
export const MAX_SQUAD_SIZE = 25;
export const MAX_OVERSEAS = 8;
export const MIN_KEEPER = 2;
export const MIN_PURSE_SPEND_PCT = 0.75; // ₹90 Cr
export const OVERSEAS_MINI_CAP_CR = 18;

export function getOfficialIncrement(currentBidCr) {
  if (currentBidCr < 1.0) return 0.05;      // ₹5L
  if (currentBidCr < 2.0) return 0.10;      // ₹10L
  if (currentBidCr < 5.0) return 0.20;      // ₹20L
  return 0.25;                              // ₹25L
}

export function formatCr(val) {
  if (val === 0) return '₹0 Cr';
  if (val < 1) return `₹${Math.round(val * 100)}L`;
  return `₹${Number(val.toFixed(2))} Cr`;
}

export function calculateMegaRetentionCost(retainedList) {
  let cappedCount = 0;
  let uncappedCount = 0;
  let totalCost = 0;
  retainedList.forEach((p) => {
    if (p.status === 'Uncapped') {
      totalCost += MEGA_UNCAPPED_SLAB;
      uncappedCount += 1;
    } else {
      totalCost += MEGA_CAPPED_SLABS[cappedCount] || 14;
      cappedCount += 1;
    }
  });
  return {
    totalCost,
    cappedCount,
    uncappedCount,
    rtmsLeft: Math.max(0, 6 - retainedList.length),
  };
}

export function evaluateSquadScore(team, format) {
  const roster = team.roster || [];
  if (roster.length === 0) {
    return { total: 0, quality: 0, form: 0, balance: 0, value: 0, legal: false, reason: 'Empty squad' };
  }
  const overseasCount = roster.filter((p) => p.isOverseas).length;
  const wkCount = roster.filter((p) => p.role === 'Wicketkeeper').length;
  const spent = BASE_PURSE_CR - team.purseLeft;

  const legal =
    roster.length >= MIN_SQUAD_SIZE &&
    roster.length <= MAX_SQUAD_SIZE &&
    overseasCount <= MAX_OVERSEAS &&
    wkCount >= 1 &&
    spent >= BASE_PURSE_CR * MIN_PURSE_SPEND_PCT;

  const sortedByQuality = [...roster].sort((a, b) => b.quality - a.quality);
  const top11 = sortedByQuality.slice(0, 11);

  const avgQuality = top11.reduce((acc, p) => acc + p.quality, 0) / Math.max(1, top11.length);
  const avgForm = top11.reduce((acc, p) => acc + p.form, 0) / Math.max(1, top11.length);

  // Balance checks: Batter, Bowler, All-Rounder, Wicketkeeper depth + roster completeness toward 25
  const batters = roster.filter((p) => p.role === 'Batter').length;
  const bowlers = roster.filter((p) => p.role === 'Bowler').length;
  const allRounders = roster.filter((p) => p.role === 'All-Rounder').length;
  let balanceScore = 65;
  if (wkCount >= 2) balanceScore += 10;
  else if (wkCount === 1) balanceScore += 5;
  if (batters >= 5) balanceScore += 7;
  if (bowlers >= 5) balanceScore += 8;
  if (allRounders >= 3) balanceScore += 6;
  const depthFactor = Math.min(1, roster.length / MAX_SQUAD_SIZE);
  balanceScore = Math.min(100, balanceScore * (0.85 + 0.15 * depthFactor));

  // Value for money: quality per crore spent
  const totalQuality = roster.reduce((acc, p) => acc + p.quality, 0);
  const efficiency = Math.min(100, Math.max(55, (totalQuality / Math.max(30, spent)) * 5.2));

  const weighted =
    avgQuality * 0.5 +
    avgForm * 0.2 +
    balanceScore * 0.2 +
    efficiency * 0.1;

  const penalty = legal ? 1.0 : 0.78;
  return {
    total: Number((weighted * penalty).toFixed(1)),
    quality: Number(avgQuality.toFixed(1)),
    form: Number(avgForm.toFixed(1)),
    balance: Number(balanceScore.toFixed(1)),
    value: Number(efficiency.toFixed(1)),
    legal,
    spent: Number(spent.toFixed(2)),
    overseasCount,
    wkCount,
  };
}
