import {initialVortex} from './model.js';
import {initialVortexScalar} from './js-baseline.js';
import {initialVortexPlane} from './js-plane.js';
import {summarize,shuffled} from '../grid/model.js';

export async function runInitializationSuite() {
  const results=[],checks=[];
  for(const size of [8,16,32,64,128]) for(const method of ['table','plane']) {
    const a=(method==='table'?initialVortex:initialVortexPlane)(size),b=initialVortexScalar(size);let unequal=0;
    const ab=new Uint32Array(a.buffer),bb=new Uint32Array(b.buffer);
    for(let i=0;i<ab.length;i++)if(ab[i]!==bb[i])unequal++;
    checks.push({size,method,unequal,passed:unequal===0});if(unequal)throw new Error('Initialization changed bits');
  }
  const methods={scalar:initialVortexScalar,table:initialVortex,plane:initialVortexPlane};let checksum=0;
  for(let i=0;i<12;i++)for(const name of Object.keys(methods))checksum+=methods[name](32)[123];
  for(let round=0;round<5;round++)for(const size of [64,128])for(const method of shuffled(Object.keys(methods),size+19*round)) {
    const samples=[];
    for(let trial=0;trial<3;trial++) {
      const t=performance.now(),field=methods[method](size);samples.push(performance.now()-t);
      // Consume output outside timing to keep the generated field observable.
      checksum+=field[123]+field.at(-3);
    }
    await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);});
    results.push({round,size,method,allocationBytes:size**3*16+(method==='scalar'?0:size*16)+(method==='plane'?size*size*24:0),timing:summarize(samples),samples});
  }
  return {checks,results,checksum,protocol:{rounds:5,trials:3,sizes:[64,128],warmupCallsPerMethod:12,note:'Initialization only, including output allocation and GC pauses. No forced GC or discarded slow samples. Each output is bitwise checked against the frozen scalar version. Not animation throughput.'}};
}
