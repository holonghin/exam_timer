const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/mascot');
function harness(values){
 let time=0,serial=0,draws=0;
 const pending=new Map(),sleep=[],wake=[];
 const controller=M.createDozer({random:()=>values[draws++%values.length],onSleep:()=>sleep.push(time),onWake:()=>wake.push(time),
  setTimer:(fn,ms)=>{const id=++serial;pending.set(id,{at:time+ms,fn});return id},clearTimer:id=>pending.delete(id)});
 function advance(ms){const end=time+ms;for(let i=0;i<100;i++){const next=[...pending].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end){time=end;return}time=next[1].at;pending.delete(next[0]);next[1].fn()}throw new Error('Unexpected loop')}
 return{controller,advance,pending,sleep,wake,draws:()=>draws,next:()=>[...pending.values()][0]?.at};
}
test('each nap stays fully closed for a fresh 6–10 seconds, excluding the closing fade',()=>{
 for(const [random,awake,hold] of [[0,8000,6000],[.5,10000,8000],[1,12000,10000]]){
  const h=harness([random]);h.controller.setEnabled(true);h.advance(awake-1);assert.deepEqual(h.sleep,[]);h.advance(1);assert.deepEqual(h.sleep,[awake]);
  h.advance(600+hold-1);assert.deepEqual(h.wake,[0]);h.advance(1);assert.equal(h.wake.at(-1)-h.sleep[0]-600,hold);
 }
});
test('awake and asleep intervals are resampled; the next nap waits until the waking fade finishes',()=>{
 const h=harness([0,.5,1,0]);h.controller.setEnabled(true);h.advance(8000);h.advance(8600);
 assert.deepEqual(h.sleep,[8000]);assert.equal(h.wake.at(-1),16600);assert.equal(h.next(),29200);
 h.advance(12599);assert.equal(h.sleep.length,1);h.advance(1);assert.deepEqual(h.sleep,[8000,29200]);
 h.advance(6600);assert.equal(h.wake.at(-1),35800);assert.equal(h.draws(),5);
});
test('normal timer rendering never resets or multiplies the pending nap',()=>{
 const h=harness([0]);h.controller.setEnabled(true);for(let i=0;i<20;i++){h.advance(200);h.controller.setEnabled(true)}
 assert.equal(h.next(),8000);assert.equal(h.pending.size,1);assert.equal(h.draws(),1);
});
test('leaving waiting, stopping motion or disposing cancels pending and active naps',()=>{
 const h=harness([0]);h.controller.setEnabled(true);h.advance(3000);h.controller.setEnabled(false);h.advance(30000);assert.deepEqual(h.sleep,[]);assert.equal(h.pending.size,0);
 h.controller.setEnabled(true);h.advance(8000);assert.equal(h.sleep.length,1);h.controller.setEnabled(false);h.advance(30000);assert.equal(h.sleep.length,1);assert.equal(h.pending.size,0);
 h.controller.setEnabled(true);assert.equal(h.pending.size,1);h.controller.dispose();h.advance(30000);assert.equal(h.pending.size,0);assert.equal(h.sleep.length,1);
});
