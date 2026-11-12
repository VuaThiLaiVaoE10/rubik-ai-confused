// Tiện ích tính toán thống kê WCA (Ao5, Ao12, Ao100) cho Timer Speedcubing

/**
 * Tính trung bình WCA (loại bỏ lượt nhanh nhất & chậm nhất trong N lượt gần nhất)
 */
export function calculateAo(solvesList, count) {
  if (!solvesList || solvesList.length < count || count < 3) return '--';
  const times = solvesList.slice(0, count).map((s) => s.time);
  const min = Math.min(...times);
  const max = Math.max(...times);
  let removedMin = false;
  let removedMax = false;
  const trimmed = [];
  for (const t of times) {
    if (!removedMin && t === min) {
      removedMin = true;
      continue;
    }
    if (!removedMax && t === max) {
      removedMax = true;
      continue;
    }
    trimmed.push(t);
  }
  const sum = trimmed.reduce((a, b) => a + b, 0);
  return (sum / trimmed.length).toFixed(2);
}
