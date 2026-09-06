import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
test.use({actionTimeout:15000});

async function savedJob(page:Page){
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('uws-report-local-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const rows=await new Promise<Array<{id:string;revision:number;updatedAt:number;value:{stage:number;report:{photos:Array<{id:string;file:File;sectionId:string|null;phase:string|null;order:number}>};vesselDiagram:{nicheMarkers:unknown[];confirmed:boolean};reportInfo:{operation:{location:string}}}}>>((resolve,reject)=>{const r=db.transaction('jobs').objectStore('jobs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
  const row=rows.sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  return row?{id:row.id,revision:row.revision,stage:row.value.stage,markers:row.value.vesselDiagram?.nicheMarkers,confirmed:row.value.vesselDiagram?.confirmed,location:row.value.reportInfo.operation.location,photos:row.value.report.photos.map(p=>({id:p.id,name:p.file.name,size:p.file.size,isFile:p.file instanceof File,sectionId:p.sectionId,phase:p.phase,order:p.order}))}:null;
 });
}
const stage=(page:Page,index:number)=>page.getByRole('navigation',{name:'Report stages'}).getByRole('button').nth(index);

test('manual job → guarded diagram → photos and review → recover/archive → complete Word',async({page,context})=>{
 test.setTimeout(240000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');
 await page.getByRole('button',{name:'조회 없이 선박 정보 직접 입력'}).click();
 for(const[key,value]of Object.entries({name:'QA SYNTHETIC VESSEL',imo:'1234567',type:'Container Ship',loa:'300',breadth:'48'}))await page.getByLabel(`직접 입력 ${key}`,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Removal 작업 선택'}).click();
 await page.getByLabel('Niche component').selectOption('Rope Guard');
 await page.getByRole('button',{name:/Scope 추가$/}).click();
 await page.getByRole('button',{name:/Scope 만들기$/}).click();
 await stage(page,5).click();await expect(page.getByRole('heading',{name:'Vessel / Scope'})).toBeVisible();
 await page.getByRole('button',{name:'Report Information 입력',exact:true}).click();
 for(const[key,value]of Object.entries({jobNo:'QA-2609001',callSign:'TEST',ownerClient:'SYNTHETIC QA'}))await page.getByLabel(`보고서 ${key}`).fill(value);
 await page.getByLabel('ETA',{exact:true}).fill('2026-09-01T01:36');await page.getByLabel('ETD',{exact:true}).fill('2026-09-01T18:00');
 await expect(page.getByLabel('Work Window',{exact:true})).toHaveValue('16 Hours + 1 Hrs');
 await page.getByLabel('Start',{exact:true}).fill('2026-09-01T15:35');await page.getByLabel('End',{exact:true}).fill('2026-09-01T16:24');
 await expect(page.getByLabel('Working Time',{exact:true})).toHaveValue('0 Hrs 49 Min');
 await page.getByLabel('Working Time',{exact:true}).fill('MANUAL QA');await page.getByLabel('End',{exact:true}).fill('2026-09-01T16:25');
 await expect(page.getByLabel('Working Time',{exact:true})).toHaveValue('MANUAL QA');
 await page.getByRole('button',{name:'Working Time 자동값 다시 적용',exact:true}).click();
 await page.getByLabel('End',{exact:true}).fill('2026-09-01T16:24');
 await page.getByLabel('Location',{exact:true}).fill('Busan QA berth');await page.getByLabel('Berthing Side',{exact:true}).selectOption('STBD SIDE');
 await expect(page.getByLabel('Position',{exact:true})).toHaveValue('STBD SIDE');
 await page.getByLabel('Weather',{exact:true}).fill('Fine');await page.getByLabel('Visibility',{exact:true}).fill('2');
 await page.getByRole('button',{name:'커버 설정으로',exact:true}).click();await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.getByLabel('선박 사이드뷰 이미지').setInputFiles('e2e/fixtures/vessel-side.png');
 await page.getByRole('button',{name:'Niche 맞추기로 이동'}).click();
 await expect.poll(async()=> (await savedJob(page))?.markers?.length).toBeGreaterThan(0);
 const beforeMarkers=(await savedJob(page))!.markers;
 await page.getByLabel('선박 사이드뷰 이미지').setInputFiles('e2e/fixtures/manual.jpg');
 await expect.poll(async()=> (await savedJob(page))?.markers).toEqual(beforeMarkers);
 await page.getByLabel('선박 사이드뷰 이미지').setInputFiles('e2e/fixtures/vessel-side.png');
 await page.getByRole('button',{name:'Niche 맞추기로 이동'}).click();
 await page.getByRole('button',{name:'선박 위치도 설정 완료'}).click();
 await expect(page.getByRole('heading',{name:'사진 폴더'})).toBeVisible();
 await expect(page.getByRole('button',{name:'샘플 사진 7장 불러오기'})).toHaveCount(0);
 await page.getByRole('button',{name:'Report Input으로',exact:true}).click();
 for(const [phase,count]of [['BEFORE',3],['AFTER',4]] as const){
  await page.getByRole('button',{name:`${phase} 새 사진 추가`,exact:true}).click();
  const bytes=await readFile('e2e/fixtures/vessel-side.png');
  await page.getByLabel('보고서 사진 추가 파일').setInputFiles(Array.from({length:count},(_,i)=>({name:`${phase}-${i+1}.png`,mimeType:'image/png',buffer:bytes})));
 }
 await page.getByLabel('구역 기본 BEFORE fouling coverage').fill('15');
 await stage(page,7).click();await expect(page.getByRole('dialog',{name:'적용하지 않은 구역 기본값'})).toBeVisible();
 await page.getByRole('button',{name:'계속 편집'}).click();await expect(page.getByRole('heading',{name:'Report Input',exact:true})).toBeVisible();
 await stage(page,7).click();await page.getByRole('button',{name:'적용하고 이동'}).click();
 await expect(page.getByRole('heading',{name:'Summary 확인'})).toBeVisible();await stage(page,5).click();
 await expect(page.getByLabel('BEFORE fouling coverage',{exact:true})).toHaveValue('15');
 await page.getByRole('button',{name:'BEFORE 컨디션 확인 완료로 표시',exact:true}).click();await page.getByRole('button',{name:'AFTER 컨디션 확인 완료로 표시',exact:true}).click();
 await page.getByRole('button',{name:'전체 사진 보관함 · 여러 장 선택'}).click();
 const library=page.getByRole('dialog');const checks=library.getByRole('checkbox');
 await checks.nth(1).check();await checks.nth(0).check();await expect(library.getByText('선택 2장',{exact:true})).toBeVisible();
 await library.getByRole('button',{name:'선택 사진 사용'}).click();
 const photoCount=7;await expect.poll(async()=> (await savedJob(page))?.photos.length).toBe(photoCount);
 await stage(page,1).click();
 for(const label of ['Toolbox','Preparation']){
  await page.getByRole('group',{name:`${label} photos`,exact:true}).getByRole('button',{name:'불러온 사진 보관함에서 선택'}).click();
  await page.getByRole('dialog').getByRole('checkbox').nth(0).check();await page.getByRole('dialog').getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'선택 사진 사용'}).click();
 }
 await stage(page,2).click();await page.getByRole('button',{name:'불러온 사진 보관함에서 선택'}).click();await page.getByRole('dialog').getByRole('checkbox').first().check();await page.getByRole('button',{name:'선택 사진 사용'}).click();
 await expect(page.getByText('사진을 읽을 수 없습니다. 다른 사진을 선택하세요.')).toHaveCount(0);
 for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`outputs/workflow-cover-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});await stage(page,7).click();
 await page.getByRole('button',{name:'결과 문구 수정'}).click();await page.getByLabel('결과 제목').fill('QA CUSTOM OVERALL RESULT');await page.getByLabel('결과 내용').fill('Synthetic verification only. Recorded work and final condition were reviewed.');await page.getByRole('button',{name:'문구 저장'}).click();
 await page.getByRole('button',{name:'최종 Word 준비'}).click();await expect(page.getByRole('button',{name:'Word 보고서 다운로드',exact:true})).toBeEnabled();
 await page.screenshot({path:'outputs/workflow-final-qa.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Word 보고서 다운로드',exact:true}).click();const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('QA-2609001_QA SYNTHETIC VESSEL_Underwater service report(Detail).docx');
 await download.saveAs('outputs/workflow-complete.docx');
 const zip=await JSZip.loadAsync(await readFile('outputs/workflow-complete.docx'));const xml=await zip.file('word/document.xml')!.async('string');
 expect(xml).toContain('QA CUSTOM OVERALL RESULT');expect(xml).toContain('Synthetic verification only.');expect(xml).toContain('0 Hrs 49 Min');expect(xml).toContain('16 Hours + 1 Hrs');expect(xml).toContain('STBD SIDE');expect(xml).not.toMatch(/\{\{[A-Z_]+\}\}/);
 await expect.poll(async()=> (await savedJob(page))?.photos.every(p=>p.isFile&&p.size>0&&p.sectionId)).toBe(true);
 const saved=(await savedJob(page))!;await page.reload();await page.getByRole('button',{name:'이어서 작성',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'저장된 보고서 이어서 작성'})).toHaveCount(0);await expect.poll(async()=> (await savedJob(page))?.revision).toBe(saved.revision);
 await stage(page,7).click();await expect(page.getByRole('heading',{name:'QA CUSTOM OVERALL RESULT'})).toBeVisible();await expect.poll(async()=> (await savedJob(page))?.stage).toBe(7);
 const backupPromise=page.waitForEvent('download');await page.getByRole('button',{name:'작업 파일 저장',exact:true}).click();const backup=await backupPromise;await backup.saveAs('outputs/workflow-job.uws-report.zip');
 const second=await context.newPage();second.on('dialog',dialog=>void dialog.accept());await second.goto('/');await second.getByRole('button',{name:'이어서 작성',exact:true}).click();
 await stage(second,1).click();await second.getByLabel('Location',{exact:true}).fill('SECOND TAB');await expect.poll(async()=> (await savedJob(second))?.location).toBe('SECOND TAB');
 await stage(page,1).click();await page.getByLabel('Location',{exact:true}).fill('UNSAVED FIRST TAB');await expect(page.getByRole('alert').filter({hasText:'다른 탭'})).toBeVisible();expect((await savedJob(page))?.location).toBe('SECOND TAB');
 await second.close();
 await page.getByLabel('보고서 작업 파일').setInputFiles('outputs/workflow-job.uws-report.zip');
 await expect(page.getByRole('alert').filter({hasText:'다른 탭'})).toHaveCount(0);await expect.poll(async()=> (await savedJob(page))?.location).toBe('Busan QA berth');
 expect((await savedJob(page))?.photos.length).toBe(7);expect(errors).toEqual([]);
});
