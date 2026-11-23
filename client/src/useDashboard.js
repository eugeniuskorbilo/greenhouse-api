import {useEffect,useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {io} from 'socket.io-client';
import {getSession,refresh} from './auth';
import {fetchTelemetry,mergePoints,METRICS,RANGES} from './telemetry';
export function useDashboard(device,range,session){
 const qc=useQueryClient();const [connection,setConnection]=useState('connecting');const [attempt,setAttempt]=useState(0);const [lastPacket,setLastPacket]=useState(null);
 const queries=METRICS.map(metric=>useQuery({queryKey:['telemetry',device,metric.id,range],queryFn:()=>fetchTelemetry(device,metric.id,range),staleTime:30000,refetchOnWindowFocus:false,retry:1}));
 useEffect(()=>{
  const socket=io({path:'/socket.io',transports:['websocket','polling'],reconnection:true,auth:cb=>cb({token:getSession()?.accessToken})});let live=true;let connectedBefore=false;
  function join(){socket.emit('bed:subscribe',device,reply=>{if(!reply?.ok)console.error('Room subscription failed',reply);});}
  socket.on('connect',()=>{if(!live)return;setConnection('online');setAttempt(0);join();if(connectedBefore)qc.invalidateQueries({queryKey:['telemetry',device]});connectedBefore=true;});
  socket.on('disconnect',async reason=>{if(live)setConnection('offline');if(live&&reason==='io server disconnect'){try{await refresh();if(live)socket.connect()}catch(e){console.error(e)}}});
  socket.on('connect_error',async err=>{if(live)setConnection('reconnecting');if(err.message==='token_expired'){try{await refresh();if(live)socket.connect()}catch(e){console.error(e)}}});
  const manager=socket.io;const onAttempt=n=>{if(live){setAttempt(n);setConnection('reconnecting');}};
  manager.on('reconnect_attempt',onAttempt);
  socket.on('telemetry:update',event=>{
   if(!live||event.device_id!==device||!METRICS.some(m=>m.id===event.metric)||!Number.isSafeInteger(event.ts)||!Number.isFinite(event.value))return;
   setLastPacket(event.ts);
   for(const rangeName of Object.keys(RANGES)){
    const key=['telemetry',device,event.metric,rangeName];
    if(qc.getQueryState(key)?.status==='success')qc.setQueryData(key,old=>mergePoints(old,[{ts:event.ts,value:event.value}]).filter(p=>p.ts>=Date.now()-RANGES[rangeName]));
   }
  });
  return()=>{live=false;manager.off('reconnect_attempt',onAttempt);socket.disconnect();};
 },[device,qc,session]);
 return {queries,connection,attempt,lastPacket};
}
