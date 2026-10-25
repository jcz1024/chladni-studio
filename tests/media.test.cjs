const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MediaLibrary, parseRange } = require('../electron/media.cjs');

test('byte ranges support seeking, bounded requests and suffix requests',()=>{
  assert.equal(parseRange(null,100),null);
  assert.deepEqual(parseRange('bytes=20-39',100),{start:20,end:39});
  assert.deepEqual(parseRange('bytes=20-',100),{start:20,end:99});
  assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});
  assert.deepEqual(parseRange('bytes=90-200',100),{start:90,end:99});
  for(const value of ['bytes=120-','bytes=40-20','bytes=-0','bytes=','bytes=0-10,20-30','invalid'])assert.throws(()=>parseRange(value,100));
});

test('media tokens restrict file access and return the exact requested bytes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chladni-media-'));
  try {
    const file=path.join(dir,'中文 音乐.wav'),data=Buffer.from(Array.from({length:255},(_,i)=>i));
    await fs.writeFile(file,data);
    const lib=new MediaLibrary(),tracks=await lib.add([file,path.join(dir,'missing.mp3'),path.join(dir,'private.txt')]);
    assert.equal(tracks.length,1);assert.equal(tracks[0].name,'中文 音乐');
    assert.equal((await lib.add([file]))[0].id,tracks[0].id);
    const response=await lib.respond(new Request(tracks[0].url,{headers:{Range:'bytes=12-24'}}));
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 12-24/255');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),data.subarray(12,25));
    assert.equal((await lib.respond(new Request('chladni-media://audio/../../private.txt'))).status,404);
    assert.equal((await lib.respond(new Request(tracks[0].url,{headers:{Range:'bytes=999-'}}))).status,416);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
