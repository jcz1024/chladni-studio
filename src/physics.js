/* Free-edge Kirchhoff-Love bending modes, nu=0.3. Square: Rayleigh-Ritz;
   disk: free moment/shear roots. Rigid translation/tilts are excluded.
   Near-centre point force; no centre-clamp or calibrated shaker attachment. */
(function(root){
  'use strict';
  const COUNT=64,SIZE=128,NU=.3,PI=Math.PI,cache=new Map(),DRIVE=[.18,.11];let diskBasis;
  function normalizeDrive(shape,point=DRIVE){
    let [x,y]=Array.isArray(point)?point:DRIVE;
    x=Number.isFinite(Number(x))?Math.max(-.96,Math.min(.96,Number(x))):DRIVE[0];
    y=Number.isFinite(Number(y))?Math.max(-.96,Math.min(.96,Number(y))):DRIVE[1];
    if(shape==='circle'&&Math.hypot(x,y)>.96){const r=Math.hypot(x,y);x*=.96/r;y*=.96/r;}
    // Round toward the interior so a disk point remains within the radius bound.
    x=Math.round(x*1000)/1000;y=Math.round(y*1000)/1000;
    if(shape==='circle'&&Math.hypot(x,y)>.96){x=Math.trunc(x*999)/1000;y=Math.trunc(y*999)/1000;}
    return [x,y];
  }
  const angles=Array.from({length:128},(_,i)=>{const t=(i+.5)*PI/128;return[t,Math.sin(t)];});
  function besselJ(m,x){let j=0,d=0;for(const[t,s]of angles){const a=m*t-x*s;j+=Math.cos(a);d+=Math.sin(a)*s;}return[j/128,d/128];}
  function besselI(m,x){
    if(x===0)return[m===0?1:0,m===1?.5:0];
    let term=1;for(let i=1;i<=m;i++)term*=x/(2*i);
    let value=term,derivative=term*m/x;
    for(let k=1;k<160;k++){term*=x*x/(4*k*(m+k));value+=term;derivative+=term*(m+2*k)/x;if(term<value*1e-15)break;}
    return[value,derivative];
  }
  function freeTerms(m,beta){
    const[j,jd]=besselJ(m,beta),[i,id]=besselI(m,beta),s=1-NU;
    return {mj:-s*beta*jd+(s*m*m-beta*beta)*j,mi:-s*beta*id+(s*m*m+beta*beta)*i,
      vj:-(beta**3)*jd-s*m*m*(beta*jd-j),vi:beta**3*id-s*m*m*(beta*id-i),i};
  }
  function characteristic(m,beta){const t=freeTerms(m,beta);return(t.mj*t.vi-t.mi*t.vj)/(t.i*beta**5);}
  function diskRoots(m,count){
    const roots=[];let a=Math.max(.6,m*.65),fa=characteristic(m,a);
    while(roots.length<count&&a<65){
      const b=a+.16,fb=characteristic(m,b);
      if(fa*fb<0){let lo=a,hi=b,flo=fa;for(let k=0;k<40;k++){const mid=(lo+hi)/2,f=characteristic(m,mid);if(flo*f<=0)hi=mid;else{lo=mid;flo=f;}}roots.push((lo+hi)/2);}
      a=b;fa=fb;
    }
    return roots;
  }
  function legendre(degree,x){
    const p=new Float64Array(degree+1),d=p.slice();p[0]=1;p[1]=x;d[1]=1;
    for(let n=2;n<=degree;n++){p[n]=((2*n-1)*x*p[n-1]-(n-1)*p[n-2])/n;d[n]=((2*n-1)*(p[n-1]+x*d[n-1])-(n-1)*d[n-2])/n;}
    for(let n=0;n<=degree;n++){const s=Math.sqrt(2*n+1);p[n]*=s;d[n]*=s;}
    return {p,d};
  }
  function squareGroups(point){
    const data=typeof module!=='undefined'&&module.exports?require('./plate-data.js'):root.PlateModeData;
    if(!data)throw new Error('缺少自由薄板振型数据。');
    const dx=legendre(data.degree,point[0]),dy=legendre(data.degree,point[1]);
    return data.groups.map((g,index)=>{
      const drive=g.components.map(c=>c.reduce((s,[m,n,v])=>s+v*dx.p[m]*dy.p[n],0)),coupling=Math.hypot(...drive),merged=new Map();
      g.components.forEach((c,k)=>c.forEach(([m,n,v])=>{const key=m*32+n;merged.set(key,(merged.get(key)||0)+v*drive[k]/Math.max(1e-14,coupling));}));
      const coefficients=[...merged].filter(([,v])=>Math.abs(v)>1e-10).map(([key,v])=>[Math.floor(key/32),key%32,v]);
      function sampleBasis(x,y){let value=0,gx=0,gy=0;for(const[m,n,c]of coefficients){value+=c*x.p[m]*y.p[n];gx+=c*x.d[m]*y.p[n];gy+=c*x.p[m]*y.d[n];}return[value,gx,gy];}
      return {ratio:g.omega/data.groups[0].omega,omega:g.omega,label:'F'+(index+1),components:g.components,coupling,coefficients,
        sampleBasis,sample(x,y){return sampleBasis(legendre(data.degree,x),legendre(data.degree,y));},value(x,y){return this.sample(x,y)[0];}};
    });
  }
  function diskGroups(point){
    if(!diskBasis)diskBasis=buildDiskBasis();
    return diskBasis.map(({m,n,beta,ratio,values,derivatives,interpolate})=>{
      const rd=Math.hypot(...point),angle=Math.atan2(point[1],point[0]),atDrive=interpolate(values,rd),sign=Math.sign(atDrive)||1;
      return {ratio,beta,m,n,label:m+' / '+n,components:Array.from({length:m===0?1:2},()=>[m,n]),coupling:Math.abs(atDrive),
        sample(x,y){const r=Math.hypot(x,y),theta=Math.atan2(y,x),a=m*(theta-angle),R=interpolate(values,r)*sign,Rd=interpolate(derivatives,r)*sign;
          const value=R*Math.cos(a),dr=Rd*Math.cos(a),angular=-m*R*Math.sin(a)/Math.max(r,1e-8);
          return[value,dr*Math.cos(theta)-angular*Math.sin(theta),dr*Math.sin(theta)+angular*Math.cos(theta)];},value(x,y){return this.sample(x,y)[0];}};
    });
  }
  function buildDiskBasis(){
    const candidates=[];for(let m=0;m<=14;m++)for(const[index,beta]of diskRoots(m,7).entries())candidates.push({m,n:index+1,beta});
    candidates.sort((a,b)=>a.beta-b.beta);const fundamental=candidates[0].beta;
    return candidates.slice(0,COUNT).map(({m,n,beta})=>{
      const terms=freeTerms(m,beta),c=-terms.mj/terms.mi,N=1024,extent=1.04;
      const values=new Float64Array(N+1),derivatives=values.slice();
      for(let k=0;k<=N;k++){const r=k/N*extent,[j,jd]=besselJ(m,beta*r),[i,id]=besselI(m,beta*r);values[k]=j+c*i;derivatives[k]=beta*(jd+c*id);}
      function interpolate(table,r){const p=Math.max(0,Math.min(N,r/extent*N)),k=Math.min(N-1,Math.floor(p));return table[k]+(table[k+1]-table[k])*(p-k);}
      let integral=0;for(let k=0;k<=1024;k++){const r=k/1024,v=interpolate(values,r);integral+=v*v*2*r/1024*(k===0||k===1024?.5:1);}
      const normalization=1/Math.sqrt(integral*(m===0?1:.5));
      for(let k=0;k<=N;k++){values[k]*=normalization;derivatives[k]*=normalization;}
      return {ratio:(beta/fundamental)**2,beta,m,n,values,derivatives,interpolate};
    });
  }
  function createPlate(shape='square',point=DRIVE,withAtlas=true){
    shape=shape==='circle'?'circle':'square';point=normalizeDrive(shape,point);const key=shape+':'+point.join(',');
    let model=cache.get(key);
    if(!model){const groups=shape==='square'?squareGroups(point):diskGroups(point);model={shape,groups,atlas:null,size:SIZE,count:COUNT,modalCount:groups.reduce((s,g)=>s+g.components.length,0),boundary:shape==='square'?'四边自由薄板':'周边自由圆板',drive:point,poisson:NU};cache.set(key,model);
      if(cache.size>6){const evict=[...cache.keys()].find(k=>!k.endsWith(':0.18,0.11')&&k!==key);if(evict)cache.delete(evict);}}
    if(!withAtlas||model.atlas)return model;
    const groups=model.groups,atlas=new Float32Array(SIZE*SIZE*COUNT*4);
    const basis=Array.from({length:SIZE},(_,i)=>legendre(24,-1+2*i/(SIZE-1)));
    for(let k=0;k<COUNT;k++)for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const[v,gx,gy]=shape==='square'?groups[k].sampleBasis(basis[x],basis[y]):groups[k].sample(-1+2*x/(SIZE-1),-1+2*y/(SIZE-1));
      const p=(k*SIZE*SIZE+y*SIZE+x)*4;atlas[p]=v;atlas[p+1]=gx;atlas[p+2]=gy;atlas[p+3]=v*v;
    }
    model.atlas=atlas;return model;
  }
  function resonatorCoefficients(frequency,rate,quality,coupling=1,fundamental=70,music=false){
    const omega=2*PI*frequency,delta=omega/(2*quality),wd=Math.sqrt(omega*omega-delta*delta),r=Math.exp(-delta/rate);
    const compensation=music?(frequency/fundamental)**2/Math.max(.4,coupling):1;
    return {a1:2*r*Math.cos(wd/rate),a2:-r*r,b0:r*Math.sin(wd/rate)/wd/rate*(2*PI*fundamental)**2*coupling*compensation};
  }
  const api={createPlate,normalizeDrive,besselJ,besselI,diskRoots,freeTerms,characteristic,resonatorCoefficients,COUNT};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlatePhysics=api;
})(globalThis);
