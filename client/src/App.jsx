import React,{useMemo,useState,useEffect}from'react';
import {login,setSession,setExpiredHandler,apiFetch} from './auth';
import{ResponsiveContainer,LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,ReferenceLine,Legend}from'recharts';
import{Activity,Wifi,WifiOff,RefreshCw,Download,ChevronRight,X,Clock,Info}from'lucide-react';
import{useDashboard}from'./useDashboard';
import{METRICS,STATUS,evaluateStatus,formatValue,downloadCSV}from'./telemetry';
import{lttbPreserveMin}from'./lttb';
const dateFormat=ts=>new Date(ts).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const timeFormat=ts=>new Date(ts).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
function soilStatus(metric,value,ts,now,threshold){
 if(metric!=='soil_moisture')return evaluateStatus(metric,value,ts,now);
 if(value==null||!Number.isFinite(value)||!ts||now-ts>12*60*1000)return 'offline';
 return value<threshold?'warning':'ok';
}
function DeviceCard({metric,point,selected,onClick,now,threshold}){
 const state=soilStatus(metric.id,point?.value,point?.ts,now,threshold),status=STATUS[state];
 return <button data-testid="device-card" className={`device-card ${state} ${selected?'selected':''}`} onClick={onClick} aria-pressed={selected} aria-label={`${metric.label}: ${point?formatValue(point.value,metric)+' '+metric.unit:'немає даних'}, ${status.label}`}>
 <span className="card-title">{metric.label}</span><span className="card-number">{formatValue(point?.value,metric)} <small>{point?metric.unit:''}</small></span>
 <span className={`state-tag ${state}`}><span aria-hidden="true" className="state-symbol">{status.symbol}</span>{status.label}</span>
 <span className="card-time">{point?`Оновлено: ${dateFormat(point.ts)}`:'Очікування показників'}</span>
 </button>;
}
function Chart({points,range,metric,threshold}){
 const displayed=useMemo(()=>range==='7d'?lttbPreserveMin(points,500):points,[points,range]);
 return <><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={displayed} margin={{top:16,right:20,bottom:8,left:0}}>
 <CartesianGrid stroke="#E4E9EE" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="ts" type="number" domain={['dataMin','dataMax']} scale="time" tickFormatter={timeFormat} minTickGap={36} tick={{fontSize:11,fill:'#52606D'}}/>
 <YAxis width={48} domain={['auto','auto']} tick={{fontSize:11,fill:'#52606D'}}/>
 <Tooltip labelFormatter={dateFormat} formatter={v=>[`${formatValue(v,metric)} ${metric.unit}`,metric.label]} contentStyle={{borderRadius:8,borderColor:'#D1D9E0'}}/>
 {metric.id==='soil_moisture'&&<ReferenceLine y={threshold} ifOverflow="extendDomain" stroke="#B94700" strokeDasharray="5 5" label={{value:`Поріг ${threshold} %`,fill:'#8F3A00',fontSize:11,position:'insideTopRight'}}/>}
 <Line type="monotone" dataKey="value" name={metric.label} stroke="#0072B2" strokeWidth={2.4} dot={false} activeDot={{r:4}} isAnimationActive={false}/>
 </LineChart></ResponsiveContainer></div><div className="chart-footer"><span>Показано {displayed.length.toLocaleString('uk-UA')} із {points.length.toLocaleString('uk-UA')} точок{range==='7d'?' · LTTB ≤ 500':''}</span><span>{points.length?`Остання: ${dateFormat(points.at(-1).ts)}`:'Даних за період немає'}</span></div></>;
}
export default function App(){
 const [session,updateSession]=useState(null);const [username,setUsername]=useState('agro1');const [password,setPassword]=useState('Agro#2026');const [loginError,setLoginError]=useState('');
 useEffect(()=>{setExpiredHandler(()=>{updateSession(null);setLoginError('Сесія завершилась. Увійдіть повторно.')});return()=>setExpiredHandler(()=>{})},[]);
 async function doLogin(e){e.preventDefault();setLoginError('');try{const result=await login(username,password);setSession(result);updateSession(result)}catch(err){setLoginError(err.message)}}
 function logout(){setSession(null);updateSession(null)}
 return session?<Dashboard session={session} logout={logout}/>:(<div className="login-page"><form className="login-box" onSubmit={doLogin}><h1>Теплиця №1</h1><p>ПР6 · Захищений моніторинг</p><label>Логін<input value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" type="submit">Увійти</button>{loginError&&<p role="alert">{loginError}</p>}<small>Агроном: agro1 / Agro#2026 · Переглядач: viewer1 / View#2026</small></form></div>);
}
function Dashboard({session,logout}){
 const [threshold,setThreshold]=useState('30');const [savedThreshold,setSavedThreshold]=useState(30);const [thresholdMessage,setThresholdMessage]=useState('');
 async function saveThreshold(){setThresholdMessage('');try{const r=await apiFetch(`/api/v1/devices/${device}/threshold`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({metric:'soil_moisture',value:Number(threshold)})});if(!r.ok)throw new Error(`HTTP ${r.status}: ${(await r.json()).error}`);setSavedThreshold(Number(threshold));setThresholdMessage('Поріг збережено; дію записано в аудит')}catch(e){setThresholdMessage(e.message)}}


 const[device,setDevice]=useState('bed-a'),[range,setRange]=useState('24h'),[selected,setSelected]=useState('soil_moisture'),[modal,setModal]=useState(null);
 useEffect(()=>{let cancelled=false;setThresholdMessage('');setSavedThreshold(30);setThreshold('30');(async()=>{try{const r=await apiFetch(`/api/v1/devices/${device}/threshold`);if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();const item=data.find(x=>x.metric==='soil_moisture');if(!cancelled&&item&&Number.isFinite(item.value)){setThreshold(String(item.value));setSavedThreshold(item.value)}}catch(e){if(!cancelled)setThresholdMessage(`Не вдалося завантажити поріг: ${e.message}`)}})();return()=>{cancelled=true}},[device]);
 const{queries,connection,attempt,lastPacket}=useDashboard(device,range,session);
 const now=Date.now();const rows=METRICS.map((metric,i)=>({metric,points:queries[i].data||[],loading:queries[i].isLoading,error:queries[i].error}));
 const active=rows.find(row=>row.metric.id===selected)||rows[2];
  const hasTelemetryError=rows.some(row=>row.error);
 const events=useMemo(()=>{
  const all=[];for(const row of rows){let previous=null;for(const point of row.points.slice(-500)){
   const state=soilStatus(row.metric.id,point.value,point.ts,point.ts,savedThreshold);
   if(state!=='ok'&&state!==previous)all.push({ts:point.ts,label:row.metric.label,state,value:point.value,unit:row.metric.unit});previous=state;
  }}return all.sort((a,b)=>b.ts-a.ts).slice(0,8);
 },[savedThreshold,...rows.map(r=>r.points)]);
 return <div className="page"><header className="header"><div><p className="eyebrow">GREENHOUSE / LIVE MONITORING</p><h1>Теплиця №1 · Агромоніторинг</h1><p className="subhead">Моніторинг мікроклімату та стану ґрунту в реальному часі</p></div><div className="header-controls"><span className="session-role">{session.username} · {session.role}</span><button className="csv-button" onClick={logout}>Вийти</button><label className="bed-control">Грядка <select value={device} onChange={e=>setDevice(e.target.value)}><option value="bed-a">Грядка А</option><option value="bed-b">Грядка Б</option></select></label><span className={`connection ${connection}`} role="status">{connection==='online'?<Wifi size={16}/>:connection==='offline'?<WifiOff size={16}/>:<RefreshCw size={16}/>} {connection==='online'?'Онлайн':connection==='reconnecting'?`Перепідключення · спроба ${attempt}`:connection==='offline'?'Офлайн':'Підключення...'}</span></div></header>
 <main>{hasTelemetryError ? <div data-testid="connection-error" role="alert" className="empty error">Помилка зв’язку з REST API. Не вдалося завантажити показники датчиків.</div> : <section className="cards" aria-label="Показники датчиків">{rows.map(row=><DeviceCard key={row.metric.id} metric={row.metric} point={row.points.at(-1)} selected={selected===row.metric.id} now={now} threshold={savedThreshold} onClick={()=>{setSelected(row.metric.id);setModal(row.metric.id);}}/>)}</section>}
 <div className="content"><section className="panel graph-panel"><div className="panel-heading"><div><h2>{active.metric.label}, {active.metric.unit}</h2><p>Історія показників і надходження даних у реальному часі</p></div><div className="range-actions"><div className="range-toggle" role="group" aria-label="Діапазон графіка">{[['1h','1 год'],['24h','24 год'],['7d','7 днів']].map(([key,label])=><button key={key} className={range===key?'active':''} aria-pressed={range===key} onClick={()=>setRange(key)}>{label}</button>)}</div><button className="csv-button" disabled={!active.points.length} onClick={()=>downloadCSV(active.points,device,active.metric.id,range)} title="Експортувати дані у CSV"><Download size={16}/> CSV</button></div></div>
 {active.loading?<div className="empty">Завантаження історії...</div>:active.error?<div className="empty error">Помилка: {active.error.message}</div>:active.points.length?<Chart points={active.points} range={range} metric={active.metric} threshold={savedThreshold}/>:<div className="empty">Немає показників за обраний період. Запустіть генератор MQTT.</div>}
 </section><aside className="panel event-panel"><h2>Події та пороги</h2><p>Останні зміни стану датчиків</p><div className="event-list">{events.length?events.map((event,i)=><div className="event" key={`${event.ts}-${event.label}-${i}`}><span className={`event-dot ${event.state}`}></span><div><strong>{event.label}</strong><div className="event-meta">{STATUS[event.state].label} · {event.value.toLocaleString('uk-UA')} {event.unit}</div><time>{dateFormat(event.ts)}</time></div></div>):<p className="event-empty">Порогових подій поки немає</p>}</div>{session.role==='agronomist'&&<div className="threshold-editor"><label>Поріг вологості ґрунту (%) <input type="number" min="0" max="100" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label><button className="primary" onClick={saveThreshold}>Зберегти поріг</button>{thresholdMessage&&<p role="status">{thresholdMessage}</p>}</div>}<div className="aside-note"><Info size={15}/> Для ґрунту стан «Увага», коли вологість нижча за встановлений поріг ({savedThreshold} %).</div></aside></div>
 <footer className="footer">Джерело: MQTT · Socket.IO · REST API <span>ПР6 · JWT + RBAC + аудит</span></footer></main>
 {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="modal" role="dialog" aria-modal="true" aria-label="Деталі датчика"><button className="close" onClick={()=>setModal(null)} aria-label="Закрити"><X size={20}/></button><h2>Датчик: {METRICS.find(m=>m.id===modal)?.label}</h2><p className="modal-value">{formatValue(rows.find(r=>r.metric.id===modal)?.points.at(-1)?.value,METRICS.find(m=>m.id===modal))} {METRICS.find(m=>m.id===modal)?.unit}</p><p>Джерело: {device} · Дані з REST API та Socket.IO</p><p>Стан: {STATUS[soilStatus(modal,rows.find(r=>r.metric.id===modal)?.points.at(-1)?.value,rows.find(r=>r.metric.id===modal)?.points.at(-1)?.ts,now,savedThreshold)].label}</p><button className="primary" onClick={()=>{setSelected(modal);setModal(null);}}>Показати графік <ChevronRight size={16}/></button></section></div>}
 </div>;
}
