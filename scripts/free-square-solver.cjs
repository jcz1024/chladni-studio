// Rayleigh-Ritz weak form of an isotropic Kirchhoff-Love plate, all edges free.
// Orthonormal Legendre products: M = I; no displacement constraint on the rim.
function legendre(degree, x) {
  const p = new Float64Array(degree + 1), d = p.slice(), dd = p.slice();
  p[0] = 1; p[1] = x; d[1] = 1;
  for (let n = 2; n <= degree; n++) {
    p[n] = ((2*n-1)*x*p[n-1]-(n-1)*p[n-2])/n;
    d[n] = ((2*n-1)*(p[n-1]+x*d[n-1])-(n-1)*d[n-2])/n;
    dd[n] = ((2*n-1)*(2*d[n-1]+x*dd[n-1])-(n-1)*dd[n-2])/n;
  }
  for (let n = 0; n <= degree; n++) { const s = Math.sqrt(2*n+1); p[n]*=s; d[n]*=s; dd[n]*=s; }
  return {p,d,dd};
}
function gauss(count) {
  const result=[];
  for(let k=1;k<=count;k++) {
    let x=Math.cos(Math.PI*(k-.25)/(count+.5));
    for(let j=0;j<20;j++) { const a=legendre(count,x),p=a.p[count]/Math.sqrt(2*count+1),d=a.d[count]/Math.sqrt(2*count+1),delta=p/d; x-=delta; if(Math.abs(delta)<1e-15)break; }
    const d=legendre(count,x).d[count]/Math.sqrt(2*count+1);
    result.push([x,1/((1-x*x)*d*d)]); // weights for the area average, not integral
  }
  return result;
}
function eigen(matrix,n) {
  const a=Float64Array.from(matrix),v=new Float64Array(n*n);
  for(let i=0;i<n;i++)v[i*n+i]=1;
  for(let sweep=0;sweep<70;sweep++) {
    let max=0; for(let p=0;p<n;p++)for(let q=p+1;q<n;q++)max=Math.max(max,Math.abs(a[p*n+q]));
    if(max<1e-9)break;
    const threshold=sweep<5?max*.03:1e-11;
    let rotations=0;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++) {
      const apq=a[p*n+q];if(Math.abs(apq)<threshold)continue;
      const tau=(a[q*n+q]-a[p*n+p])/(2*apq),t=Math.sign(tau||1)/(Math.abs(tau)+Math.sqrt(1+tau*tau));
      const c=1/Math.sqrt(1+t*t),s=t*c;
      const app=a[p*n+p],aqq=a[q*n+q];a[p*n+p]=app-t*apq;a[q*n+q]=aqq+t*apq;a[p*n+q]=a[q*n+p]=0;
      for(let k=0;k<n;k++) {
        if(k!==p&&k!==q) { const kp=a[k*n+p],kq=a[k*n+q];a[k*n+p]=a[p*n+k]=c*kp-s*kq;a[k*n+q]=a[q*n+k]=s*kp+c*kq; }
        const vp=v[k*n+p],vq=v[k*n+q];v[k*n+p]=c*vp-s*vq;v[k*n+q]=s*vp+c*vq;
      }
      rotations++;
    }
    if(!rotations)break;
  }
  return Array.from({length:n},(_,k)=>({lambda:a[k*n+k],vector:Float64Array.from({length:n},(_,i)=>v[i*n+k])}));
}
function solve(degree=24,nu=.3) {
  const N=degree+1,A1=new Float64Array(N*N),A2=A1.slice(),C=A1.slice();
  for(const [x,w]of gauss(degree+3)) {
    const {p,d,dd}=legendre(degree,x);
    for(let i=0;i<N;i++)for(let j=0;j<N;j++) { const k=i*N+j;A1[k]+=w*d[i]*d[j];A2[k]+=w*dd[i]*dd[j];C[k]+=w*dd[i]*p[j]; }
  }
  const modes=[];
  for(let px=0;px<2;px++)for(let py=0;py<2;py++) {
    const basis=[];for(let m=px;m<N;m+=2)for(let n=py;n<N;n+=2)if(m+n>1)basis.push([m,n]);
    const length=basis.length,K=new Float64Array(length*length);
    for(let i=0;i<length;i++)for(let j=0;j<length;j++) {
      const [m,n]=basis[i],[p,q]=basis[j];
      K[i*length+j]=(n===q?A2[m*N+p]:0)+(m===p?A2[n*N+q]:0)+nu*(C[m*N+p]*C[q*N+n]+C[p*N+m]*C[n*N+q])+2*(1-nu)*A1[m*N+p]*A1[n*N+q];
    }
    for(const {lambda,vector}of eigen(K,length)) {
      if(lambda<=1e-7)continue;
      const coefficients=[];for(let i=0;i<length;i++)if(Math.abs(vector[i])>1e-10)coefficients.push([...basis[i],vector[i]]);
      modes.push({omega:Math.sqrt(lambda),coefficients});
    }
  }
  modes.sort((a,b)=>a.omega-b.omega);
  const groups=[];
  for(const mode of modes) {
    const previous=groups.at(-1);
    if(previous&&Math.abs(mode.omega/previous.omega-1)<2e-6)previous.components.push(mode.coefficients);
    else groups.push({omega:mode.omega,components:[mode.coefficients]});
  }
  return {degree,nu,groups:groups.slice(0,64)};
}
module.exports={solve,legendre,gauss};
