(function(root){
  'use strict';
  const profiles={
    geometry:{name:'清晰几何',description:'稳定轮廓与轻节奏',modes:3,exponent:2.1,ranks:[1,.65,.4],attack:.06,release:.18,mixAttack:.06,mixRelease:.2,bias:0,motion:.75,response:3.2},
    beat:{name:'节拍脉冲',description:'鲜明鼓点与明暗呼吸',modes:4,exponent:1.7,ranks:[1,.8,.55,.3],attack:.045,release:.13,mixAttack:.045,mixRelease:.15,bias:0,motion:1.65,response:3},
    calm:{name:'舒缓流沙',description:'缓慢演化与柔和流动',modes:3,exponent:1.8,ranks:[1,.8,.55],attack:.12,release:.45,mixAttack:.1,mixRelease:.4,bias:0,motion:.35,response:2.6},
    detail:{name:'细密纹理',description:'更多细节与高频结构',modes:6,exponent:1.5,ranks:[1,.9,.75,.6,.45,.3],attack:.06,release:.17,mixAttack:.06,mixRelease:.18,bias:.45,motion:.8,response:3}
  };
  const defaults={sensitivity:1.1,density:64000,response:1,glow:45,fundamental:35,decay:1,modeIndex:4,palette:'sand',shape:'square',tuning:'music',automatic:true,autoLevel:true,autoRefill:true,physicalRefill:true,musicStyle:'geometry',driveX:.18,driveY:.11,fieldMap:false,fieldOpacity:25,refillSpeed:1};
  const builtins=[
    {id:'geometry',settings:{...defaults,response:1.1,glow:40}},
    {id:'beat',settings:{...defaults,musicStyle:'beat',response:1.3,glow:60,palette:'iris'}},
    {id:'calm',settings:{...defaults,musicStyle:'calm',density:48000,response:.7,glow:35,decay:1.6,palette:'ice',shape:'circle'}},
    {id:'detail',settings:{...defaults,musicStyle:'detail',density:80000,response:1.1,glow:38,decay:.8,palette:'silver'}}
  ].map(p=>({...p,name:profiles[p.id].name,description:profiles[p.id].description}));
  function sanitize(input={}){
    if(!input||typeof input!=='object')input={};const result={...defaults};
    const ranges={sensitivity:[.3,3],density:[16000,96000],response:[.3,2],glow:[0,100],fundamental:[35,140],decay:[.3,2],modeIndex:[0,63],driveX:[-.96,.96],driveY:[-.96,.96],fieldOpacity:[0,60],refillSpeed:[.25,2]};
    for(const [key,[min,max]]of Object.entries(ranges)){const raw=input[key];if((typeof raw==='number'||typeof raw==='string'&&raw.trim())&&Number.isFinite(Number(raw)))result[key]=Math.max(min,Math.min(max,Number(raw)));}
    result.density=Math.round(result.density/16000)*16000;result.glow=Math.round(result.glow);result.fundamental=Math.round(result.fundamental);
    result.modeIndex=Math.round(result.modeIndex);
    for(const key of ['sensitivity','response','decay'])result[key]=Math.round(result[key]*10)/10;
    result.fieldOpacity=Math.round(result.fieldOpacity);result.refillSpeed=Math.round(result.refillSpeed*4)/4;
    for(const key of ['automatic','autoLevel','autoRefill','physicalRefill','fieldMap'])if(typeof input[key]==='boolean')result[key]=input[key];
    if(['sand','ice','iris','silver'].includes(input.palette))result.palette=input.palette;
    if(['square','circle'].includes(input.shape))result.shape=input.shape;
    if(['music','physical'].includes(input.tuning))result.tuning=input.tuning;
    if(Object.hasOwn(profiles,input.musicStyle))result.musicStyle=input.musicStyle;
    const physics=typeof module!=='undefined'&&module.exports?require('./physics.js'):root.PlatePhysics;
    [result.driveX,result.driveY]=physics.normalizeDrive(result.shape,[result.driveX,result.driveY]);
    return result;
  }
  function parseFavorites(json){
    try{const list=JSON.parse(json);if(!Array.isArray(list))return[];const seen=new Set();return list.filter(p=>p&&typeof p.id==='string'&&p.id.length<100&&!seen.has(p.id)&&typeof p.name==='string'&&p.name.trim()&&(seen.add(p.id),true)).slice(0,32).map(p=>({id:p.id,name:p.name.trim().slice(0,32),settings:sanitize(p.settings)}));}catch{return[];}
  }
  const api={profiles,builtins,defaults,sanitize,parseFavorites};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VisualPresets=api;
})(globalThis);
