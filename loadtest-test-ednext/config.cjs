/**
 * Cấu hình load test cho MÔI TRƯỜNG TEST test.ednext.com.vn
 * Khóa "thuat-toan-can-ban" — 3 bài code đầu của chương "Số học".
 *
 * Judge của ednext biên dịch bằng C# (.cs). Code bị bọc trong một class sẵn nên
 * KHÔNG thêm được `using` — phải viết tên đầy đủ (System.Math...).
 */
const BASE = 'https://test.ednext.com.vn';
const LOGIN_URL = `${BASE}/learning`;
const COURSE_SLUG = 'thuat-toan-can-ban';
const COURSE_URL = `${BASE}/learning/${COURSE_SLUG}`;
const actUrl = (id) => `${BASE}/learning/${COURSE_SLUG}?activityType=12&activityId=${id}&tab=description`;

const ACTIVITIES = [
  {
    key: 'act1', id: 1934, name: 'isPrime', url: actUrl(1934),
    signature: 'bool IsPrime(int n)',
    solution: [
      'bool IsPrime(int n)',
      '{',
      '    if (n < 2) return false;',
      '    for (int p = 2; (long)p * p <= n; p++)',
      '        if (n % p == 0) return false;',
      '    return true;',
      '}',
    ].join('\n'),
  },
  {
    // Tổng thừa số nguyên tố CÓ BỘI, lặp tới điểm bất động (số nguyên tố):
    // 24->9->6->5 · 35->12->7 · 156->20->9->6->5. Đáp án này đã chạy pass trên prod.
    key: 'act2', id: 1935, name: 'factorSum', url: actUrl(1935),
    signature: 'int FactorSum(int n)',
    solution: [
      'int FactorSum(int n)',
      '{',
      '    while (true)',
      '    {',
      '        int m = n, s = 0;',
      '        for (int p = 2; (long)p * p <= m; p++)',
      '            while (m % p == 0) { s += p; m /= p; }',
      '        if (m > 1) s += m;',
      '        if (s == n) return n;',
      '        n = s;',
      '    }',
      '}',
    ].join('\n'),
  },
  {
    // CHƯA đối chiếu chữ ký hàm thật trên site test — chạy explore-activities.cjs
    // để xác nhận rồi sửa lại `signature`/`solution` nếu lệch.
    key: 'act3', id: 1936, name: 'greatestCommonPrimeDivisor', url: actUrl(1936),
    signature: 'int GreatestCommonPrimeDivisor(int a, int b)',
    solution: [
      'int GreatestCommonPrimeDivisor(int a, int b)',
      '{',
      '    int x = a, y = b;',
      '    while (y != 0) { int t = x % y; x = y; y = t; }',
      '    int g = x, best = -1;',
      '    for (int p = 2; (long)p * p <= g; p++)',
      '        if (g % p == 0) { best = p; while (g % p == 0) g /= p; }',
      '    if (g > 1) best = g;',
      '    return best;',
      '}',
    ].join('\n'),
  },
];

/** Lọc bài theo LT_ACTS=1934,1935 (mặc định: chạy hết) */
function pickActivities() {
  const pick = (process.env.LT_ACTS || '').split(',').map(s => s.trim()).filter(Boolean);
  return pick.length ? ACTIVITIES.filter(a => pick.includes(String(a.id))) : ACTIVITIES;
}

module.exports = { BASE, LOGIN_URL, COURSE_SLUG, COURSE_URL, actUrl, ACTIVITIES, pickActivities };
