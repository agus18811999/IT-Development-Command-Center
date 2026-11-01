/** Vercel server-side same-origin proxy. GAS_WEB_APP_URL belongs in Vercel Environment Variables. */
export default {
  async fetch(request) {
    const json=(body,status=200)=>new Response(JSON.stringify(body),{
      status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
    });
    if(request.method!=='POST')return json({success:false,error:{code:'METHOD_NOT_ALLOWED',message:'Use POST'}},405);
    const url=process.env.GAS_WEB_APP_URL;
    if(!url||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))
      return json({success:false,error:{code:'NOT_CONFIGURED',message:'Set GAS_WEB_APP_URL in Vercel Environment Variables'}},503);
    const length=Number(request.headers.get('content-length')||0);
    if(length>1000000)return json({success:false,error:{code:'TOO_LARGE',message:'Request too large'}},413);
    let body;
    try{body=await request.text();if(body.length>1000000)throw new Error('Request too large');
      const obj=JSON.parse(body);
      if(!obj||typeof obj.action!=='string'||typeof obj.token!=='string'||obj.token.length<80||obj.token.length>10000)
        return json({success:false,error:{code:'BAD_REQUEST',message:'Missing action or token'}},400);
    }catch(e){return json({success:false,error:{code:'BAD_REQUEST',message:'Malformed JSON request'}},400);}
    try {
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body,redirect:'follow',signal:AbortSignal.timeout(26000)});
      const text=await r.text();let data;
      try{data=JSON.parse(text);}catch(e){return json({success:false,error:{code:'UPSTREAM_INVALID',message:'Apps Script tidak memberikan JSON. Periksa /exec dan izin akses.'}},502);}
      return json(data,r.ok?200:502);
    }catch(e){return json({success:false,error:{code:'UPSTREAM_UNREACHABLE',message:'Tidak bisa menghubungi Google Apps Script: '+e.message}},502);}
  }
};
