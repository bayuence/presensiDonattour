async function main() {
  console.log('Testing /api/reports/daily...');
  const t0 = Date.now();
  try {
    const res = await fetch('http://localhost:5000/api/reports/daily');
    const data = await res.json();
    console.log(`Status: ${res.status}, Time: ${Date.now() - t0}ms, Success: ${data.success}, Items: ${data.items?.length}`);
  } catch (err: any) {
    console.error(`Error after ${Date.now() - t0}ms:`, err.message);
  }
}
main();
