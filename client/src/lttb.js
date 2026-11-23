// Largest Triangle Three Buckets with mandatory retention of global minimum.
function coreLTTB(data,limit){
 if(data.length<=limit)return data.slice();
 const sampled=[data[0]],bucket=(data.length-2)/(limit-2);let anchor=0;
 for(let i=0;i<limit-2;i++){
  const avgStart=Math.floor((i+1)*bucket)+1,avgEnd=Math.min(Math.floor((i+2)*bucket)+1,data.length);
  let avgX=0,avgY=0,count=0;
  for(let j=avgStart;j<avgEnd;j++){avgX+=data[j].ts;avgY+=data[j].value;count++;}
  if(!count){avgX=data.at(-1).ts;avgY=data.at(-1).value;}else{avgX/=count;avgY/=count;}
  const start=Math.floor(i*bucket)+1,end=Math.min(Math.floor((i+1)*bucket)+1,data.length-1);
  let maxArea=-1,selected=start;
  for(let j=start;j<end;j++){
   const area=Math.abs((data[anchor].ts-avgX)*(data[j].value-data[anchor].value)-(data[anchor].ts-data[j].ts)*(avgY-data[anchor].value));
   if(area>maxArea){maxArea=area;selected=j;}
  }
  sampled.push(data[selected]);anchor=selected;
 }
 sampled.push(data.at(-1));return sampled;
}
export function lttbPreserveMin(data,limit=500){
 if(data.length<=limit)return data.slice();
 const minIndex=data.reduce((best,p,i)=>p.value<data[best].value?i:best,0);
 const min=data[minIndex];
 let sampled=coreLTTB(data,limit);
 if(!sampled.some(p=>p.ts===min.ts)){
  // Replace nearest non-endpoint sample and retain order.
  let closest=1,distance=Infinity;
  for(let i=1;i<sampled.length-1;i++){
   const d=Math.abs(sampled[i].ts-min.ts);
   if(d<distance){distance=d;closest=i;}
  }
  sampled[closest]=min;
  sampled.sort((a,b)=>a.ts-b.ts);
 }
 return sampled;
}
