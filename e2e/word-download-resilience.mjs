// Local-only smoke check: WORD_QA_ARCHIVE=/path/report.zip node e2e/word-download-resilience.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const archive=process.env.WORD_QA_ARCHIVE;
assert.ok(archive,'Set WORD_QA_ARCHIVE to a local .uws-report.zip fixture.');
const base=process.env.DEMO_BASE_URL??'http://127.0.0.1:4190/';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:process.env.CHROME_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.request().method()==='GET'&&new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 page.on('dialog',dialog=>dialog.accept());
 await page.goto(base);
 await page.getByLabel('보고서 작업 파일',{exact:true}).setInputFiles(archive);
 await page.getByText('사진과 입력 내용을 복원했습니다. 폴더에 다시 저장하려면 폴더를 선택하세요.').waitFor();
 let lateRequests=0;
 // Simulate an old lazy chunk being removed by a deployment.
 await page.route(/templateWriter.*\.(js|ts)/,route=>{lateRequests++;return route.abort('failed');});
 await page.getByRole('navigation',{name:'Report stages'}).getByRole('button',{name:/Word$/}).click();
 const next=page.getByRole('button',{name:'최종 Word 준비'});
 if(await next.isVisible())await next.click();
 const downloaded=page.waitForEvent('download',{timeout:30000});
 await page.getByRole('button',{name:'Word 보고서 다운로드',exact:true}).click();
 const file=await downloaded;
 assert.match(file.suggestedFilename(),/\.docx$/);
 assert.equal(await file.failure(),null);
 assert.equal(lateRequests,0);
 console.log('PASS: real Word download completed without a late code request.');
}finally{await browser.close();}
