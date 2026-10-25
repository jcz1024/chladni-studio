const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([size,t,data,crc]);}
const size=256,raw=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=(x-size/2)/(size*.42),py=(y-size/2)/(size*.42),edge=Math.max(Math.abs(px),Math.abs(py));
  const f=Math.cos(3*Math.PI*px*.5)*Math.cos(5*Math.PI*py*.5)-Math.cos(5*Math.PI*px*.5)*Math.cos(3*Math.PI*py*.5);
  const line=edge<.96?Math.exp(-Math.abs(f)*19):edge<1?0.7:0;
  const noise=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
  const light=line*(.55+Math.abs(noise)*.45),i=y*(size*4+1)+1+x*4;
  raw[i]=19+light*210;raw[i+1]=21+light*162;raw[i+2]=24+light*83;raw[i+3]=255;
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(path.join(root,'assets/icon.png'),png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=0;ico[7]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
fs.writeFileSync(path.join(root,'assets/icon.ico'),Buffer.concat([ico,png]));
console.log('Created application icons.');
