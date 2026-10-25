/* Continuous modal plate energy + approximate inertial, frictional, bouncing grains. */
(() => {
  'use strict';
  const PREFIX='#version 300 es\nprecision highp float;\nprecision highp int;\n';
  const QUAD=PREFIX+'void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
  const FIELD=`
    uniform sampler2D uField;
    uniform float uShape,uMusic,uPulse;
    vec3 field(vec2 p){
      vec2 q=clamp(p*.5+.5,0.0,1.0)*127.0;
      ivec2 i=ivec2(floor(q));vec2 f=fract(q);ivec2 j=min(i+1,ivec2(127));
      return mix(mix(texelFetch(uField,i,0).rgb,texelFetch(uField,ivec2(j.x,i.y),0).rgb,f.x),mix(texelFetch(uField,ivec2(i.x,j.y),0).rgb,texelFetch(uField,j,0).rgb,f.x),f.y);
    }
    float randomBits(uint x){x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;x^=x>>16u;return float(x>>8u)/16777216.0;}
  `;
  const COMPOSE=PREFIX+`
    uniform highp sampler2DArray uAtlas;uniform float uWeights[64];uniform float uMusic;out vec4 color;
    void main(){vec3 sum=vec3(0.0);for(int k=0;k<64;k++){float w=uWeights[k];if(w>.00015){vec3 v=texelFetch(uAtlas,ivec3(ivec2(gl_FragCoord.xy),k),0).rgb;
      sum+=uMusic>.5?v*sqrt(w):vec3(v.x*v.x,2.0*v.x*v.yz)*w;}}
      color=vec4(uMusic>.5?vec3(sum.x*sum.x,2.0*sum.x*sum.yz):sum,1.0);}
  `;
  const UPDATE=PREFIX+FIELD+`
    layout(location=0)in vec4 aState;layout(location=1)in vec4 aLift;
    uniform float uTime,uDelta,uEnergy,uKick,uSpeed,uExcitation,uResponse;uniform sampler2D uDensity;
    out vec4 nextState;out vec4 nextLift;
    void main(){
      float dt=min(uDelta,.034),z=aLift.x,vz=aLift.y;
      vec2 p=aState.xy,v=aState.zw;float lost=aLift.z;
      if(lost>.5){nextState=aState;nextLift=aLift;gl_Position=vec4(3.0,3.0,0.0,1.0);return;}
      vec3 w=field(p);vec2 grad=w.yz;
      uint id=uint(gl_VertexID),seed=id*747796405u^uint(floor(uTime*120.0))*2891336453u;
      vec2 noise=vec2(randomBits(seed),randomBits(seed^277803737u))*2.0-1.0;
      float target=.006+randomBits(id^2246822519u)*.045;
      float attraction=max(0.0,w.x-target)/max(.025,w.x);
      // Absolute acceleration envelope is separate from normalized spatial weights.
      // Below the detachment threshold grains rest; every vibration-driven term vanishes.
      float gamma=uExcitation*sqrt(max(w.x,0.0));
      float mobility=smoothstep(1.0,1.8,gamma);
      vec2 force=-grad/(.5+length(grad))*attraction*(.85+.4*uEnergy)*uSpeed*uResponse*mobility;
      vec2 uv=p*.5+.5,texel=vec2(1.0/128.0);float density=texture(uDensity,uv).r;
      vec2 pressure=vec2(texture(uDensity,uv+vec2(texel.x,0.0)).r-texture(uDensity,uv-vec2(texel.x,0.0)).r,texture(uDensity,uv+vec2(0.0,texel.y)).r-texture(uDensity,uv-vec2(0.0,texel.y)).r);
      force-=pressure/max(12.0,density)*.16*mobility;
      v*=exp(-dt*(z>.001?2.0:7.5));
      v+=force*dt*(z>.001?.15:1.0);
      v+=noise*uKick*(.18+.18*min(sqrt(max(w.x,0.0)),1.0))*mobility;
      v+=noise*dt*.05*uEnergy*min(w.x,1.0)*mobility;
      if(z<.001 && randomBits(seed^3812015801u)<dt*(1.0+uKick*45.0)*mobility) vz=max(vz,.12+uKick*.75+.08*min(gamma,3.0));
      vz-=dt*3.2;z+=vz*dt;
      if(z<0.0){z=0.0;vz=abs(vz)>.18?-vz*.16:0.0;}
      p+=v*dt*3.0;
      if((uShape>.5&&length(p)>1.0)||max(abs(p.x),abs(p.y))>1.0){lost=1.0;p=clamp(p,vec2(-.999),vec2(.999));if(uShape>.5)p=normalize(p)*.999;v=vec2(0.0);}
      nextState=vec4(p,v);nextLift=vec4(z,vz,lost,0.0);gl_Position=vec4(p,0.0,1.0);
    }
  `;
  const MUSIC_UPDATE=PREFIX+FIELD+`
    layout(location=0)in vec4 aState;layout(location=1)in vec4 aLift;
    uniform float uTime,uDelta,uEnergy,uKick,uSpeed,uExcitation,uResponse,uRefill;uniform sampler2D uDensity;
    out vec4 nextState;out vec4 nextLift;
    void main(){
      float dt=min(uDelta,.034),z=aLift.x,vz=aLift.y;
      vec2 p=aState.xy,v=aState.zw;float lost=aLift.z;
      if(lost>.5){
        uint id=uint(gl_VertexID),seed=id*747796405u^uint(floor(uTime*120.0))*2891336453u;
        float age=min(aLift.w+dt,10.0);
        if(uRefill>.5&&age>1.2+randomBits(id^783921u)*1.5&&randomBits(seed^931527u)<dt*.85){
          vec2 best=vec2(0.0);float energy=1e20;
          for(uint k=0u;k<3u;k++){vec2 candidate=(vec2(randomBits(seed^((k+1u)*932851u)),randomBits(seed^((k+3u)*728591u)))*2.0-1.0)*.88;
            if(uShape>.5&&length(candidate)>.88)candidate=normalize(candidate)*.88;
            float e=field(candidate).x;if(e<energy){energy=e;best=candidate;}}
          nextState=vec4(best,0.0,0.0);nextLift=vec4(0.0,0.0,0.0,-.8);
        }else{nextState=aState;nextLift=vec4(aLift.xy,1.0,age);}
        gl_Position=vec4(3.0,3.0,0.0,1.0);return;
      }
      vec3 w=field(p);vec2 grad=w.yz;
      uint id=uint(gl_VertexID),seed=id*747796405u^uint(floor(uTime*120.0))*2891336453u;
      vec2 noise=vec2(randomBits(seed),randomBits(seed^277803737u))*2.0-1.0;
      float target=.006+randomBits(id^2246822519u)*.045;
      float attraction=max(0.0,w.x-target)/max(.025,w.x);
      // Absolute acceleration envelope is separate from normalized spatial weights.
      // Below the detachment threshold grains rest; every vibration-driven term vanishes.
      float gamma=uExcitation*sqrt(max(w.x,0.0));
      float mobility=uMusic>.5?smoothstep(.05,.35,uExcitation):smoothstep(1.0,1.8,gamma);
      vec2 force=-grad/(.5+length(grad))*attraction*(.85+.4*uEnergy)*uSpeed*uResponse*mobility;
      vec2 uv=p*.5+.5,texel=vec2(1.0/128.0);float density=texture(uDensity,uv).r;
      vec2 pressure=vec2(texture(uDensity,uv+vec2(texel.x,0.0)).r-texture(uDensity,uv-vec2(texel.x,0.0)).r,texture(uDensity,uv+vec2(0.0,texel.y)).r-texture(uDensity,uv-vec2(0.0,texel.y)).r);
      force-=pressure/max(12.0,density)*(uMusic>.5?.08:.16)*mobility;
      v*=exp(-dt*(uMusic>.5?(z>.001?5.0:12.0):(z>.001?2.0:7.5)));
      v+=force*dt*(z>.001?.15:1.0);
      v+=noise*uKick*(.18+.18*min(sqrt(max(w.x,0.0)),1.0))*mobility*(uMusic>.5?.08:1.0);
      if(uMusic>.5)v+=vec2(-grad.y,grad.x)/(.5+length(grad))*uKick*.065*mobility;
      v+=noise*dt*.05*uEnergy*min(w.x,1.0)*mobility*(uMusic>.5?.2:1.0);
      if(z<.001 && randomBits(seed^3812015801u)<dt*(1.0+uKick*(uMusic>.5?12.0:45.0))*mobility) vz=max(vz,uMusic>.5?.08+uKick*.12:.12+uKick*.75+.08*min(gamma,3.0));
      vz-=dt*3.2;z+=vz*dt;
      if(z<0.0){z=0.0;vz=abs(vz)>.18?-vz*.16:0.0;}
      p+=v*dt*3.0;
      if((uShape>.5&&length(p)>1.0)||max(abs(p.x),abs(p.y))>1.0){lost=1.0;p=clamp(p,vec2(-.999),vec2(.999));if(uShape>.5)p=normalize(p)*.999;v=vec2(0.0);}
      nextState=vec4(p,v);nextLift=vec4(z,vz,lost,lost>.5?0.0:min(0.0,aLift.w+dt));gl_Position=vec4(p,0.0,1.0);
    }
  `;
  const DRAW=PREFIX+FIELD+`
    layout(location=0)in vec4 aState;layout(location=1)in vec4 aLift;
    uniform vec2 uScale;uniform float uPixelRatio,uGlow,uEnergy;
    out float brightness;
    void main(){uint id=uint(gl_VertexID);float node=exp(-field(aState.xy).x*2.5);
      brightness=(.35+randomBits(id^142817u)*.65)*(.5+.5*node)*(1.0+min(aLift.x*3.0,.4))*(1.0+uMusic*uPulse*.4)*(uMusic>.5?clamp(1.0+aLift.w/.8,0.0,1.0):1.0);
      gl_Position=aLift.z>.5?vec4(3.0,3.0,0.0,1.0):vec4((aState.xy+vec2(0.0,aLift.x*.35))*uScale,0.0,1.0);
      gl_PointSize=(.75+randomBits(id)*.9+uGlow*.6+min(.5,aLift.x*3.0)+uMusic*uPulse*.22)*uPixelRatio;}
  `;
  const GRAIN=PREFIX+`uniform vec3 uColor;uniform float uGlow,uEnergy;in float brightness;out vec4 color;
    void main(){float d=length(gl_PointCoord-.5)*2.0;float a=(1.0-smoothstep(.18,1.0,d))*brightness*(.24+uGlow*.19+uEnergy*.045);color=vec4(uColor*(1.0+brightness*.17),a);}`;
  const DENSITY_VERTEX=PREFIX+'layout(location=0)in vec4 aState;layout(location=1)in vec4 aLift;void main(){gl_Position=aLift.z>.5?vec4(3.0,3.0,0.0,1.0):vec4(aState.xy,0.0,1.0);gl_PointSize=3.0;}';
  const DENSITY_FRAGMENT=PREFIX+'out vec4 color;void main(){float d=length(gl_PointCoord-.5)*2.0;float w=1.0-smoothstep(.1,1.0,d);color=vec4(w,0.0,0.0,1.0);}';
  const BACKGROUND=PREFIX+FIELD+`
    uniform vec2 uResolution,uScale;uniform vec3 uColor;uniform float uGlow;out vec4 color;
    void main(){vec2 clip=gl_FragCoord.xy/uResolution*2.0-1.0,p=clip/uScale;float edge=uShape>.5?length(p):max(abs(p.x),abs(p.y));vec3 bg=vec3(.057,.061,.065);
      if(edge<1.0){float e=field(p).x;float grain=randomBits(uint(gl_FragCoord.x)+uint(gl_FragCoord.y)*1031u)*.009;
      float contour=uMusic>.5?(.02+uGlow*.075)*(1.0+uPulse*.45):.008+uGlow*.045;
      bg+=vec3(.003)+uColor*(exp(-e*28.0)*contour+grain+smoothstep(.992,.998,edge)*.035);}
      color=vec4(bg*(1.0-.10*length(clip)),1.0);}
  `;
  class ChladniEngine {
    constructor(canvas){
      this.canvas=canvas;const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
      if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw new Error('需要支持浮点纹理的 WebGL 2 显卡驱动，请更新驱动后重试。');
      this.gl=gl;this.count=64000;this.color=[.91,.73,.43];this.shape=0;this.glow=.45;this.speed=1;
      this.energy=0;this.excitation=0;this.pulse=0;this.focusScores=new Float32Array(64);this.elapsed=0;this.renderedFrames=0;this.automatic=true;this.tuning='music';this.fundamental=35;this.decay=1;
      this.musicStyle='geometry';this.autoRefill=true;this.refillEnabled=false;
      this.weights=new Float32Array(64);this.previewIndex=4;this.weights[4]=1;this.lastOnset=-1;this.hasDriven=false;this.revision=0;this.history=[];
      this.updateProgram=this.program(UPDATE,PREFIX+'out vec4 c;void main(){c=vec4(0.0);}', ['nextState','nextLift']);
      this.musicUpdateProgram=this.program(MUSIC_UPDATE,PREFIX+'out vec4 c;void main(){c=vec4(0.0);}', ['nextState','nextLift']);
      this.drawProgram=this.program(DRAW,GRAIN);this.bgProgram=this.program(QUAD,BACKGROUND);this.composeProgram=this.program(QUAD,COMPOSE);this.densityProgram=this.program(DENSITY_VERTEX,DENSITY_FRAGMENT);
      this.emptyVAO=gl.createVertexArray();this.feedback=gl.createTransformFeedback();this.buffers=[gl.createBuffer(),gl.createBuffer()];this.vaos=[gl.createVertexArray(),gl.createVertexArray()];this.index=0;
      this.atlas=gl.createTexture();this.fieldTexture=gl.createTexture();this.fbo=gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D,this.fieldTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,128,128,0,gl.RGBA,gl.HALF_FLOAT,null);
      for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.fieldTexture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('显卡无法创建共振场纹理。');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      this.densityTexture=gl.createTexture();this.densityFbo=gl.createFramebuffer();gl.bindTexture(gl.TEXTURE_2D,this.densityTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,128,128,0,gl.RGBA,gl.HALF_FLOAT,null);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.densityFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.densityTexture,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      this.setShape('square');this.resize();new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.onError?.('显卡上下文中断，请重新打开应用。');});
    }
    program(vs,fs,feedback){const gl=this.gl,p=gl.createProgram();for(const [type,source]of[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}if(feedback)gl.transformFeedbackVaryings(p,feedback,gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));p.locations=new Map();return p;}
    location(p,name){if(!p.locations.has(name))p.locations.set(name,this.gl.getUniformLocation(p,name));return p.locations.get(name);}
    set(p,name,...v){const l=this.location(p,name);if(l===null)return;this.gl[`uniform${v.length}f`](l,...v);}
    common(p){const gl=this.gl;gl.useProgram(p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.fieldTexture);gl.uniform1i(this.location(p,'uField'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.densityTexture);gl.uniform1i(this.location(p,'uDensity'),2);this.set(p,'uShape',this.shape);this.set(p,'uMusic',this.tuning==='music'?1:0);this.set(p,'uPulse',this.pulse);this.set(p,'uEnergy',this.energy);this.set(p,'uColor',...this.color);this.set(p,'uGlow',this.glow);this.set(p,'uScale',...this.scale);}
    setShape(shape){
      this.model=PlatePhysics.createPlate(shape);this.shape=shape==='circle'?1:0;const gl=this.gl;
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.atlas);gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA32F,128,128,64,0,gl.RGBA,gl.FLOAT,this.model.atlas);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D_ARRAY,p,gl.NEAREST);
      this.weights.fill(0);this.focusScores.fill(0);this.previewIndex=shape==='circle'?5:4;this.weights[this.previewIndex]=1;this.hasDriven=false;this.scatter();
    }
    setMode(index){this.previewIndex=((Number(index)%64)+64)%64;this.hasDriven=false;}
    resize(){const r=this.canvas.getBoundingClientRect();this.ratio=Math.min(devicePixelRatio||1,1.75);this.canvas.width=Math.max(1,Math.round(r.width*this.ratio));this.canvas.height=Math.max(1,Math.round(r.height*this.ratio));const s=Math.min(this.canvas.width,this.canvas.height)*.89;this.scale=[s/this.canvas.width,s/this.canvas.height];}
    scatter(count=this.count){
      const gl=this.gl;this.count=count;const data=new Float32Array(count*8);
      for(let i=0;i<count;i++){let x,y;do{x=Math.random()*1.96-.98;y=Math.random()*1.96-.98;}while(this.shape&&x*x+y*y>.96);data[i*8]=x;data[i*8+1]=y;}
      for(let i=0;i<2;i++){gl.bindVertexArray(this.vaos[i]);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[i]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_COPY);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16);}gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    }
    coefficients(dt,audio){
      const profile=VisualPresets.profiles[this.musicStyle]||VisualPresets.profiles.geometry;
      const powers=audio?.modalPowers;let maximum=0,totalPower=0,sum=0,target=new Float32Array(64);
      if(powers)for(const p of powers){maximum=Math.max(maximum,p);totalPower+=Math.max(0,p);}
      if(this.previousTuning!==this.tuning){this.focusScores.fill(0);this.previousTuning=this.tuning;}
      if(this.automatic&&maximum>1e-10){
        this.hasDriven=true;
        if(this.tuning==='music'){
          for(let i=0;i<64;i++){const level=Math.max(0,powers[i])/maximum*Math.min(5,Math.pow(this.model.groups[i].ratio,profile.bias));this.focusScores[i]+=(level-this.focusScores[i])*(1-Math.exp(-dt/(level>this.focusScores[i]?profile.attack:profile.release)));}
          const ranked=Array.from(this.focusScores,(level,index)=>({level,index})).sort((a,b)=>b.level-a.level);
          for(let rank=0;rank<profile.modes;rank++){const {level,index}=ranked[rank];if(level>=ranked[0].level*.12)target[index]=Math.pow(level,profile.exponent)*profile.ranks[rank];}
          sum=target.reduce((a,b)=>a+b,0);
        }else for(let i=0;i<64;i++){target[i]=Math.max(0,powers[i])/maximum;sum+=target[i];}
        if(sum)for(let i=0;i<64;i++)target[i]/=sum;
      }else if(!this.hasDriven||!this.automatic){target[this.previewIndex]=1;}
      else target.set(this.weights);
      let change=0;const previous=Float32Array.from(this.weights);
      for(let i=0;i<64;i++){const tau=this.tuning==='music'?(target[i]>this.weights[i]?profile.mixAttack:profile.mixRelease):.025;this.weights[i]+=(target[i]-this.weights[i])*(1-Math.exp(-dt/tau));}
      if(this.tuning==='music'){const total=this.weights.reduce((a,b)=>a+b,0);if(total>0)for(let i=0;i<64;i++)this.weights[i]/=total;}
      for(let i=0;i<64;i++)change+=Math.abs(this.weights[i]-previous[i]);
      if(change>.001){this.revision++;this.lastCoefficientChange=performance.now();}
      if(audio?.onsetId!==undefined&&audio.onsetId!==this.lastOnset){this.lastOnset=audio.onsetId;this.kick=(audio.onsetStrength||0)*(this.tuning==='music'?profile.motion:.35);if(this.kick>.01){this.lastVisualResponse=performance.now();this.onsetResponses=(this.onsetResponses||0)+1;}}
      else this.kick=0;
      this.pulse=this.tuning==='music'?Math.max(this.pulse*Math.exp(-dt/.14),Math.min(1.5,this.kick)):0;
      this.energy+=((audio?.energy||0)-this.energy)*(1-Math.exp(-dt/((audio?.energy||0)>this.energy ? .018 : .1)));
      // Dimensionless acceleration calibration, not a measured material/size conversion.
      // Manual preview deliberately supplies a labelled synthetic excitation.
      this.excitation=this.automatic?Math.min(24,Math.sqrt(totalPower)*5.66):3.2;
      this.activeModes=this.excitation>1e-5?Array.from(this.weights).filter(x=>x>.025).length:0;
    }
    frame(dt,audio){
      if(this.lost)return;this.elapsed+=dt;this.coefficients(dt,audio);const gl=this.gl,updateProgram=this.tuning==='music'?this.musicUpdateProgram:this.updateProgram;
      this.refillEnabled=this.tuning==='music'&&this.automatic&&this.autoRefill&&(audio?.active??((audio?.energy||0)>.025));
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.densityFbo);gl.viewport(0,0,128,128);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(this.densityProgram);gl.bindVertexArray(this.vaos[this.index]);gl.drawArrays(gl.POINTS,0,this.count);gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,128,128);gl.disable(gl.BLEND);gl.useProgram(this.composeProgram);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.atlas);gl.uniform1i(this.location(this.composeProgram,'uAtlas'),1);gl.uniform1fv(this.location(this.composeProgram,'uWeights[0]'),this.weights);this.set(this.composeProgram,'uMusic',this.tuning==='music'?1:0);gl.bindVertexArray(this.emptyVAO);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,this.canvas.width,this.canvas.height);const next=1-this.index;this.common(updateProgram);
      this.set(updateProgram,'uTime',this.elapsed);this.set(updateProgram,'uDelta',dt);this.set(updateProgram,'uKick',this.kick);this.set(updateProgram,'uExcitation',this.excitation);this.set(updateProgram,'uSpeed',this.speed);
      this.set(updateProgram,'uResponse',this.tuning==='music'?(VisualPresets.profiles[this.musicStyle]||VisualPresets.profiles.geometry).response:1);this.set(updateProgram,'uRefill',this.refillEnabled?1:0);
      gl.bindVertexArray(this.vaos[this.index]);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.buffers[next]);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);this.index=next;
      this.common(this.bgProgram);this.set(this.bgProgram,'uResolution',this.canvas.width,this.canvas.height);gl.bindVertexArray(this.emptyVAO);gl.drawArrays(gl.TRIANGLES,0,3);
      this.common(this.drawProgram);this.set(this.drawProgram,'uPixelRatio',this.ratio);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(this.vaos[this.index]);gl.drawArrays(gl.POINTS,0,this.count);gl.bindVertexArray(null);gl.disable(gl.BLEND);this.renderedFrames++;
    }
    snapshot(){return this.canvas.toDataURL('image/png');}
    diagnostics(){
      const gl=this.gl,data=new Float32Array(Math.min(this.count,512)*8);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[this.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);
      let finite=true,energy=0,speed=0,airborne=0,alive=0,edge=0;
      for(let i=0;i<data.length;i+=8){const x=data[i],y=data[i+1];finite=finite&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(data[i+4])&&Math.abs(x)<=1&&Math.abs(y)<=1;if(data[i+6]>.5)continue;alive++;if((this.shape?Math.hypot(x,y):Math.max(Math.abs(x),Math.abs(y)))>.9)edge++;speed+=Math.hypot(data[i+2],data[i+3]);if(data[i+4]>.001)airborne++;let mixed=0;for(let k=0;k<64;k++)if(this.weights[k]>.00015){const value=this.model.groups[k].value(x,y);if(this.tuning==='music')mixed+=Math.sqrt(this.weights[k])*value;else energy+=this.weights[k]*value*value;}if(this.tuning==='music')energy+=mixed*mixed;}
      const n=data.length/8,live=Math.max(1,alive);return {finite,meanEnergy:energy/live,meanAmplitude:Math.sqrt(energy/live),meanSpeed:speed/live,airborne:airborne/live,aliveFraction:alive/n,edgeFraction:edge/live,excitation:this.excitation,frames:this.renderedFrames,particles:this.count,glError:gl.getError(),groups:64,modalCount:this.model.modalCount,activeModes:this.activeModes,revision:this.revision,onsetResponses:this.onsetResponses||0,weights:Array.from(this.weights),tuning:this.tuning,boundary:this.model.boundary};
    }
  }
  window.ChladniEngine=ChladniEngine;
})();
