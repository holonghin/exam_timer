const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core');
const P=require('../src/presets');
const make=(config=C.makeTemplate('exam'))=>P.createPreset(config,bytes=>{bytes.fill(2);return bytes});
const response=preset=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(preset)});

test('six-character codes accept hand typing and omit visually ambiguous characters',()=>{
 assert.equal(P.normalizeCode('a7 k2-m9'),'A7K2M9');
 for(const raw of ['', 'ABC', '../ABC', 'ABCDE0','ABCDE1','ABCDEI','ABCDEO','SAMPLE.json'])assert.throws(()=>P.normalizeCode(raw));
 const code=P.createPreset(C.makeTemplate('quiz'),bytes=>{bytes.set([0,1,2,24,30,31]);return bytes}).code;
 assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(code.length,6);
});

test('prepared snapshots preserve Unicode, attendance and customized times independently',()=>{
 const c=C.shiftStart(C.makeTemplate('exam','2026-11-20'),90);
 Object.assign(c,{teacher:'測試老師',room:'理學院 301',showRoom:false,mascotAnimated:false});
 c.phases[0].rules.push({text:'🙂 自訂規則',highlight:false});
 c.attendance=C.editAttendance(C.editAttendance(c.attendance,'expected','60').value,'present','58').value;
 const prepared=make(c),copy=P.decodePreset(JSON.stringify(prepared),prepared.code);
 assert.deepEqual(copy,c);assert.deepEqual(C.schedule(copy),C.schedule(c));assert.equal(copy.attendance.absent,2);
 c.room='後來修改';assert.equal(prepared.config.room,'理學院 301');
});

test('exam, quiz and a completed custom template can all be prepared',()=>{
 for(const id of ['exam','quiz','blank']){
  const c=C.makeTemplate(id);if(id==='blank')Object.assign(c,{title:'自訂考試',date:'2026-11-20',start:'15:00',duration:30});
  const p=make(c);assert.deepEqual(P.decodePreset(JSON.stringify(p),p.code),c);
 }
 assert.throws(()=>make(C.makeTemplate('blank')));
});

test('GitHub editor is prefilled with the correct repository path and complete settings',()=>{
 const p=make(),pub=P.publication(p),url=new URL(pub.url);
 assert.equal(pub.mode,'editor');assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/holonghin/exam_timer/new/main');
 assert.equal(url.searchParams.get('filename'),'exams/'+p.code+'.json');
 assert.deepEqual(P.decodePreset(url.searchParams.get('value'),p.code),p.config);
 assert.deepEqual(P.decodePreset(pub.contents,p.code),p.config);assert.ok(!url.searchParams.has('access_token'));
});

test('long GitHub editor URLs fall back to a downloadable file and upload page',()=>{
 const c=C.makeTemplate('exam');c.phases[0].rules.push({text:'中'.repeat(2000)});
 const p=make(c),pub=P.publication(p);assert.equal(pub.mode,'upload');assert.equal(pub.url,'https://github.com/holonghin/exam_timer/upload/main/exams');
 assert.deepEqual(P.decodePreset(pub.contents,p.code),c);
});

test('malformed, wrong-code, unsupported-version and invalid exam files are rejected',()=>{
 const p=make();for(const text of ['not JSON','null',JSON.stringify({...p,version:99}),JSON.stringify({...p,config:{}})])assert.throws(()=>P.decodePreset(text,p.code),/格式不正確/);
 assert.throws(()=>P.decodePreset(JSON.stringify(p),'SAMPLE'),/格式不正確/);
});

test('older saved settings upgrade while intentional rule edits and times survive',()=>{
 const p=make();delete p.config.noticeVersion;p.config.start='09:12';p.config.phases[1].rules[0].text='自訂提醒';
 assert.deepEqual(P.decodePreset(JSON.stringify(p),p.code),C.upgrade(p.config));
});

test('preset payloads are limited to one megabyte',()=>{
 const c=C.makeTemplate('exam');for(const stage of c.phases)stage.rules=Array.from({length:100},()=>({text:'中'.repeat(2000)}));
 assert.deepEqual(C.validate(c),[]);assert.throws(()=>make(c),/過長/);
 assert.throws(()=>P.decodePreset(' '.repeat(1024*1024+1),'SAMPLE'),/格式不正確/);
});

test('short URLs contain only the code and data paths stay inside the hosted project',()=>{
 assert.equal(P.shortURL('https://holonghin.github.io/exam_timer/?old=1#previous','a7k2m9'),'https://holonghin.github.io/exam_timer/#A7K2M9');
 assert.equal(P.dataURL('https://holonghin.github.io/exam_timer/offline.html','SAMPLE'),'https://holonghin.github.io/exam_timer/exams/SAMPLE.json');
 assert.equal(P.shortURL('file:///D:/Timer/offline.html','SAMPLE'),'https://holonghin.github.io/exam_timer/#SAMPLE');
 assert.throws(()=>P.dataURL('https://holonghin.github.io/exam_timer/','../ABC'));assert.throws(()=>P.shortURL('javascript:alert(1)','SAMPLE'));
});

test('requested codes come from the short fragment and empty URLs require no lookup',()=>{
 assert.equal(P.requestedCode('https://holonghin.github.io/exam_timer/'),null);
 assert.equal(P.requestedCode('https://holonghin.github.io/exam_timer/#a7k2m9'),'a7k2m9');
 assert.equal(P.requestedCode('https://holonghin.github.io/exam_timer/#%ZZ'),'%ZZ');
});

test('loading fetches only a validated same-site code and decodes the saved snapshot',async()=>{
 const p=make();let call;
 const config=await P.load('https://holonghin.github.io/exam_timer/',p.code,{fetchImpl:async(url,options)=>{call={url:new URL(url),options};return response(p)}});
 assert.equal(call.url.origin,'https://holonghin.github.io');assert.equal(call.url.pathname,'/exam_timer/exams/'+p.code+'.json');assert.ok(call.url.searchParams.has('v'));
 assert.equal(call.options.cache,'no-store');assert.equal(call.options.credentials,'omit');assert.deepEqual(config,p.config);
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','../bad',{fetchImpl:()=>assert.fail('invalid code must never fetch')}));
});

test('missing files, invalid responses and connectivity errors have actionable messages',async()=>{
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','SAMPLE',{fetchImpl:async()=>({ok:false,status:404})}),/找不到此考試/);
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','SAMPLE',{fetchImpl:async()=>({ok:false,status:503})}),/稍後重試/);
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','SAMPLE',{fetchImpl:async()=>{throw new TypeError('offline')}}),/檢查網路/);
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','SAMPLE',{fetchImpl:async()=>({ok:true,headers:{get:()=>1024*1024+1}})}),/檔案過大/);
});

test('network timeouts abort the request instead of leaving the loading screen hanging',async()=>{
 await assert.rejects(P.load('https://holonghin.github.io/exam_timer/','SAMPLE',{timeoutMs:1,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const error=new Error();error.name='AbortError';reject(error)}))}),/連線逾時/);
});

test('publication confirmation ignores JSON key order but respects actual setting differences',()=>{
 assert.equal(P.sameConfig({a:1,b:{x:false,y:2}},{b:{y:2,x:false},a:1}),true);
 assert.equal(P.sameConfig({a:[1,2]},{a:[2,1]}),false);assert.equal(P.sameConfig({x:false},{x:0}),false);
});

test('the published sample is a valid clearly labeled demonstration exam',()=>{
 const raw=fs.readFileSync(path.join(__dirname,'../exams/SAMPLE.json'),'utf8');
 const c=P.decodePreset(raw,'SAMPLE');assert.match(c.subtitle,/示範/);assert.equal(c.title,'微積分1');
});
