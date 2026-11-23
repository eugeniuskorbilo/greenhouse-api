import {apiFetch} from './auth';
export const METRICS = [
 {id:'temperature',label:'Температура повітря',unit:'°C',decimals:1},
 {id:'humidity',label:'Вологість повітря',unit:'%',decimals:0},
 {id:'soil_moisture',label:'Вологість ґрунту',unit:'%',decimals:1},
 {id:'light',label:'Освітленість',unit:'лк',decimals:0},
];
export const RANGES={ '1h':3600000,'24h':86400000,'7d':604800000 };
export const formatValue=(value,metric)=> value==null?'—':new Intl.NumberFormat('uk-UA',{maximumFractionDigits:metric.decimals}).format(value);
export function evaluateStatus(metric,value,ts,now=Date.now()){
 if(value==null||!Number.isFinite(value)||!ts||now-ts>12*60*1000)return 'offline';
 if(metric==='soil_moisture')return value<30?'critical':value<40?'warning':'ok';
 if(metric==='temperature')return value>=40||value<=5?'critical':value>=32||value<=12?'warning':'ok';
 if(metric==='humidity')return value<25||value>90?'critical':value<40||value>75?'warning':'ok';
 if(metric==='light')return value<1500?'critical':value<4000?'warning':'ok';
 return 'ok';
}
export const STATUS={ok:{label:'Норма',symbol:'✓'},warning:{label:'Увага',symbol:'!'},critical:{label:'Критично',symbol:'✕'},offline:{label:'Немає даних',symbol:'?'}};
export function mergePoints(oldPoints,newPoints){
 const map=new Map((oldPoints||[]).map(p=>[p.ts,p]));
 for(const p of newPoints||[])if(Number.isSafeInteger(p.ts)&&Number.isFinite(p.value))map.set(p.ts,{ts:p.ts,value:p.value});
 return [...map.values()].sort((a,b)=>a.ts-b.ts);
}
export async function fetchTelemetry(device,metric,range){
 const to=Date.now(),from=to-RANGES[range];let cursor=null,points=[],pages=0;
 do{
  const params=new URLSearchParams({device,metric,from:String(from),to:String(to),limit:'1000'});
  if(cursor)params.set('cursor',cursor);
  const response=await apiFetch(`/api/v1/telemetry?${params}`);
  if(response.status===404)return [];
  if(!response.ok)throw new Error(`Помилка REST: ${response.status}`);
  const data=await response.json();points.push(...(data.points||[]));cursor=data.next_cursor;
  if(++pages>100)throw new Error('Забагато сторінок телеметрії');
 }while(cursor);
 return mergePoints([],points);
}
export function downloadCSV(points,device,metric,range){
 const rows=['timestamp_iso,ts,value,device,metric',...points.map(p=>`${new Date(p.ts).toISOString()},${p.ts},${p.value},${device},${metric}`)];
 const blob=new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${device}_${metric}_${range}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
