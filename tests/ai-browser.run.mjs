// Optional browser suite: run the mock Vite config first, then node this file.
// Requires Playwright and Chromium; makes no live Supabase/OpenAI calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
let requests = [], status = 200, titles = [], delay = 0;
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1') return route.continue();
  if (url.hostname === 'mock.supabase.co' && url.pathname === '/functions/v1/suggest-subtasks') {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    const snapshot = {status, titles, delay};
    if (snapshot.delay) await new Promise(resolve => setTimeout(resolve, snapshot.delay));
    return route.fulfill({status:snapshot.status, contentType:'application/json', body:JSON.stringify({titles:snapshot.titles})}).catch(() => {});
  }
  return route.abort();
});
const fresh = async () => { status=200; titles=['資料を確認する', '場所を予約する', '関係者に案内する']; delay=0; requests=[]; await page.goto('http://127.0.0.1:4179/tests/ai-browser.html'); await page.getByRole('button',{name:'AIで子ToDoを提案',exact:true}).waitFor(); };
const generate = () => page.getByRole('button',{name:'AIで子ToDoを提案',exact:true}).click();
const candidate = n => page.getByRole('textbox',{name:`子ToDo候補${n}`,exact:true});
let checks = 0;
async function check(name, fn) { await fresh(); await fn(); checks++; console.log(`PASS ${name}`); }
try {
await check('only title and goal sent; duplicates omitted; editable/selectable and confirmation-only append',async()=>{
  await generate(); await candidate(1).waitFor();
  assert.deepEqual(requests,[{title:'架空のイベントを準備する',goal:'参加者が体験を通して理解し、次にすることを決められるようにしたい'}]);
  assert.equal(await page.getByRole('list',{name:'保存済み'}).getByRole('listitem').count(),1);
  assert.equal(await candidate(1).inputValue(),'場所を予約する');
  await candidate(1).fill('会場を確認して予約する');
  await page.getByRole('checkbox',{name:'候補2を追加する'}).uncheck();
  await page.getByRole('button',{name:'選んだ1件を追加'}).click();
  assert.deepEqual(await page.getByRole('list',{name:'保存済み'}).getByRole('listitem').allTextContents(),['資料を確認する','会場を確認して予約する']);
});
await check('concurrent manual addition is excluded from confirmation',async()=>{
  await generate(); await candidate(1).waitFor();
  await page.getByRole('button',{name:'並行して手動追加'}).click();
  await page.getByRole('button',{name:'選んだ1件を追加'}).click();
  assert.deepEqual(await page.getByRole('list',{name:'保存済み'}).getByRole('listitem').allTextContents(),['資料を確認する','場所を予約する','関係者に案内する']);
});
await check('repeated generate clicks do not issue duplicate requests; cancellation ignores late result',async()=>{
  delay=300;
  await generate();
  assert.equal(await page.getByRole('button',{name:'AIが候補を作成中…'}).isDisabled(),true);
  await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await page.waitForTimeout(400);
  assert.equal(await candidate(1).count(),0); assert.ok(requests.length<=1);
});
for (const action of ['title','goal','logout','unmount','back']) await check(`${action} invalidates pending suggestions`,async()=>{
  delay=300; await generate();
  if(action==='title') await page.getByRole('textbox',{name:'親タイトル',exact:true}).fill('別の親ToDo');
  if(action==='goal') await page.getByRole('textbox',{name:'達成したいこと',exact:true}).fill('別の達成状態を目指したい');
  if(action==='logout') await page.getByRole('button',{name:'テスト用ログアウト'}).click();
  if(action==='unmount') await page.getByRole('button',{name:'テスト用切替'}).click();
  if(action==='back') await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
  await page.waitForTimeout(400); assert.equal(await candidate(1).count(),0);
});
await check('changed goal clears old candidates and is used for the next request',async()=>{
  await generate(); await candidate(1).waitFor();
  await page.getByRole('textbox',{name:'達成したいこと',exact:true}).fill('目的を整理する\n実施方法を決める');
  assert.equal(await candidate(1).count(),0);
  await generate(); await candidate(1).waitFor();
  assert.equal(requests.at(-1).goal,'目的を整理する\n実施方法を決める');
});
for (const code of [401,429,503]) await check(`HTTP ${code} displays safe error without children`,async()=>{
  status=code; await generate(); await page.getByRole('status').waitFor();
  assert.equal(await candidate(1).count(),0); assert.equal(await page.getByRole('button',{name:'AIで子ToDoを提案',exact:true}).isEnabled(),true);
});
await check('timeout re-enables generation and ignores late response',async()=>{
  await page.clock.install(); delay=1000; await generate(); await page.clock.fastForward(25001); await page.getByRole('status').waitFor();
  assert.equal(await candidate(1).count(),0); assert.equal(await page.getByRole('button',{name:'AIで子ToDoを提案',exact:true}).isEnabled(),true);
  await page.clock.resume();
});
await check('save failure preserves editable candidates',async()=>{
  await generate(); await candidate(1).waitFor(); await page.getByRole('button',{name:'保存失敗切替'}).click();
  await page.getByRole('button',{name:'選んだ2件を追加'}).click(); await page.getByRole('status').waitFor(); assert.equal(await candidate(1).count(),1);
});
await check('100 existing children disables generation',async()=>{
  await page.getByRole('button',{name:'100件にする'}).click(); assert.equal(await page.getByRole('button',{name:'AIで子ToDoを提案',exact:true}).isDisabled(),true);
});
await fresh(); await generate(); await candidate(1).waitFor();
await mkdir('output/playwright',{recursive:true});
await page.screenshot({path:'output/playwright/ai-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'output/playwright/ai-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
console.log(`PASS ${checks} browser scenarios + mobile overflow / screenshots`);
} finally { await browser.close(); }
