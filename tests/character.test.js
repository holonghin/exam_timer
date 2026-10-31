const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const C=require('../src/core');
const M=require('../src/mascot');
const root=path.resolve(__dirname,'..');
const names=['waiting','reading','relaxed','focused','finished-body','finished-arm','reading-blink','waiting-sleep'];

test('five poses track precise shifted boundaries without changing the exam state',()=>{
 const c=C.shiftStart(C.clone(C.defaults),90); c.extension=10;
 const t=C.schedule(c), before=JSON.stringify(C.stateAt(c,t.handin));
 for(const [at,pose] of [[t.start-1,'waiting'],[t.start,'reading'],[t.handin-1,'reading'],[t.handin,'relaxed'],[t.final-1,'relaxed'],[t.final,'focused'],[t.end-1,'focused'],[t.end,'finished']])assert.equal(M.poseAt(t,at),pose);
 assert.equal(JSON.stringify(C.stateAt(c,t.handin)),before);
});

test('quiz and custom schedules without hand-in or final nodes retain sensible poses',()=>{
 const q=C.schedule(C.makeTemplate('quiz'));
 assert.equal(M.poseAt(q,q.start),'reading');assert.equal(M.poseAt(q,q.final),'focused');assert.equal(M.poseAt(q,q.end),'finished');
 let c=C.removeEvent(C.clone(C.defaults),'handin'); c=C.removeEvent(c,'final');
 const t=C.schedule(c);assert.equal(M.poseAt(t,t.end-1),'reading');assert.equal(M.poseAt(t,t.end),'finished');
});

test('all production cutouts have identical dimensions and actual transparent corners',()=>{
 for(const name of names){
   const png=fs.readFileSync(path.join(root,'src/assets/mascot',name+'.png'));
   assert.equal(png.subarray(1,4).toString(),'PNG');
   assert.equal(png.readUInt32BE(16),512,name);assert.equal(png.readUInt32BE(20),512,name);
   assert.equal(png[25],6,'RGBA alpha channel: '+name);
   const chunks=[];
   for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
   // For the first pixel, PNG filters all predict zero (there is no left/up pixel).
   const pixels=zlib.inflateSync(Buffer.concat(chunks));assert.equal(pixels[4],0,'transparent corner: '+name);
 }
});

test('standalone embeds each cutout once and preserves separate waiting/reading/closed-book layers',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal([...html.matchAll(/data:image\/png;base64,/g)].length,names.length);
 assert.doesNotMatch(html,/\{\{MASCOT:/);assert.ok(Buffer.byteLength(html)<3.5*1024*1024);
 const template=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');
 for(const pose of ['waiting','reading','relaxed','focused','finished'])assert.ok(template.includes('data-pose="'+pose+'"'));
 assert.match(template,/<g class="mascot-wave"><use href="#art-finished-arm"\/><\/g><use href="#art-finished-body"/);
 assert.ok(template.indexOf('class="mascot-wave"') < template.indexOf('<use href="#art-finished-body"'));
 assert.match(template,/clip-path="url\(#reading-eye-window\)"/);
});

test('page layer is a single right-to-left turn and reduced-motion leaves neutral artwork',()=>{
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 const turn=css.match(/@keyframes mascot-page-turn\{[^\n]+/)[0];
 assert.ok(turn.indexOf('scaleX(1)')<turn.indexOf('scaleX(-1)'));
 assert.match(turn,/100%\{[^}]*scaleX\(-1\);opacity:0/);
 assert.match(css,/mascot-page-turn 1100ms ease-in-out 1 forwards/);
 assert.doesNotMatch(css,/mascot-page-turn[^;\n]*(?:infinite|alternate)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{#mascot-slot \*\{animation:none!important/);
 assert.match(css,/#mascot-slot\.is-still \.mascot-blink,#mascot-slot\.is-still \.mascot-doze\{opacity:0!important/);
});

test('waiting has coordinated dozing, awake blinking, moving chat dots and floating Zzz',()=>{
 const html=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 for(const layer of ['mascot-doze','mascot-chat','mascot-chat-dot','mascot-zzz'])assert.ok(html.includes('class="'+layer+'"'));
 assert.match(css,/mascot-doze 16\.4s ease-in-out infinite/);
 assert.match(css,/mascot-chat 16\.4s ease-in-out infinite/);
 assert.match(css,/mascot-zzz 16\.4s ease-in-out infinite/);
 assert.match(css,/@keyframes mascot-doze\{0%,25%,28%,57%,78%,100%\{opacity:0\}26%,27%,61%,73%\{opacity:1/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{#mascot-slot \.mascot-zzz\{opacity:0!important/);
});
