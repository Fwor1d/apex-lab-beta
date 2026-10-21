// Sole scheduler for application playback. Camera transitions run on this same frame.
export function createPlaybackOwner(store,{requestFrame,cancelFrame,onFrame=()=>{},transition=()=>false,hidden=()=>false}={}){
  let handle=null,last=null,active=false,disposed=false;
  function frame(t){handle=null;if(!active||disposed||hidden())return;const dt=last===null?0:Math.min(.1,Math.max(0,(t-last)/1000));last=t;const seeking=transition(t,dt);const changed=seeking||store.advance(dt);if(changed)onFrame(t,dt);if(active&&!disposed&&handle===null)handle=requestFrame(frame);}
  function start(){if(disposed||active||hidden())return;active=true;last=null;handle=requestFrame(frame);}
  function suspend(){active=false;last=null;if(handle!==null)cancelFrame(handle);handle=null;}
  return {start,suspend,destroy(){suspend();disposed=true;},get scheduled(){return handle!==null;}};
}
