const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.evaluate(() => {
    localStorage.setItem('sp_auth_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0MUBleGFtcGxlLmNvbSIsImlhdCI6MTc3NjcxODc4OCwiZXhwIjoxNzc3MzIzNTg4fQ.t7SJBQRHraOa-6zCjsT82IjmqpioT4x3myjfAz7_drs');
  });
  await page.goto('http://localhost:3000/home');
  await page.screenshot({ path: '/tmp/qa/screenshots/home.png' });
  console.log("Screenshot taken.");
  await browser.close();
})();
