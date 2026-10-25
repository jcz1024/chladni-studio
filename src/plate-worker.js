importScripts('plate-data.js','physics.js');
self.onmessage=({data:{id,shape,drive}})=>{
  try{const model=PlatePhysics.createPlate(shape,drive);const atlas=model.atlas.slice();self.postMessage({id,atlas},[atlas.buffer]);}
  catch(error){self.postMessage({id,error:error.message});}
};
