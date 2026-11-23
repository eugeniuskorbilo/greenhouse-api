let session=null;let onExpired=()=>{};
export const setExpiredHandler=fn=>{onExpired=fn};
export const setSession=s=>{session=s};
export const getSession=()=>session;
export async function login(username,password){const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});if(!r.ok)throw new Error(r.status===401?'Невірний логін або пароль':'Помилка входу');return r.json()}
let refreshing=null;
export async function refresh(){if(!session?.refreshToken)throw new Error('No refresh token');if(!refreshing)refreshing=(async()=>{const r=await fetch('/api/v1/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken})});if(!r.ok)throw new Error('Refresh failed');session={...session,...await r.json()};return session.accessToken})().catch(e=>{session=null;onExpired();throw e}).finally(()=>{refreshing=null});return refreshing}
export async function apiFetch(url,options={}){if(!session)throw new Error('Авторизуйтесь');const run=token=>fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});let r=await run(session.accessToken);if(r.status===401){const token=await refresh();r=await run(token)}return r}
