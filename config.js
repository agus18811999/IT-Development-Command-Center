/** Public browser configuration. Never place private credentials here. */
window.APP_CONFIG = Object.freeze({
  APP_NAME:'IT Development Command Center',
  APP_VERSION:'1.0.0',
  API_URL:'/api/proxy',
  FIREBASE_WEB_API_KEY:'AIzaSyBMhWvXnCr7S_13v9Ya29FTMce7DCQxX00',
  REQUEST_TIMEOUT:25000,
  DEFAULT_PAGE_SIZE:25
});
(() => {
  'use strict';
  const cfg=window.APP_CONFIG;
  const errorText={
    EMAIL_EXISTS:'Email sudah terdaftar.',EMAIL_NOT_FOUND:'Email atau password salah.',
    INVALID_PASSWORD:'Email atau password salah.',INVALID_LOGIN_CREDENTIALS:'Email atau password salah.',
    INVALID_EMAIL:'Format email tidak valid.',WEAK_PASSWORD:'Password terlalu lemah.',
    TOO_MANY_ATTEMPTS_TRY_LATER:'Terlalu banyak percobaan. Coba lagi nanti.',
    EMAIL_UNVERIFIED:'Email belum diverifikasi. Periksa kotak masuk dan folder spam.',
    INVALID_ID_TOKEN:'Sesi berakhir, silakan login ulang.',TOKEN_EXPIRED:'Sesi berakhir, silakan login ulang.',
    EXPIRED_OOB_CODE:'Tautan sudah kedaluwarsa.',INVALID_OOB_CODE:'Tautan tidak berlaku atau sudah digunakan.'
  };
  const authUrl=(action)=>'https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+encodeURIComponent(cfg.FIREBASE_WEB_API_KEY);
  function ensureKey(){if(!cfg.FIREBASE_WEB_API_KEY||cfg.FIREBASE_WEB_API_KEY.startsWith('PASTE_'))throw new Error('Isi FIREBASE_WEB_API_KEY di config.js');}
  async function firebase(action,body){
    ensureKey();let response, data;
    try{response=await fetch(authUrl(action),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      data=await response.json();}catch(e){throw new Error('Jaringan gagal terhubung ke Firebase.');}
    if(!response.ok){const code=(data?.error?.message||'FIREBASE_ERROR').split(' : ')[0];const err=new Error(errorText[code]||code);err.code=code;throw err;}
    return data;
  }
  let current=null;
  try{current=JSON.parse(sessionStorage.getItem('it_session')||localStorage.getItem('it_session')||'null');}catch(e){current=null;}
  let refreshPending=null;
  function persist(data,remember){
    current={...data,remember:!!remember};
    const store=remember?localStorage:sessionStorage,other=remember?sessionStorage:localStorage;
    other.removeItem('it_session');store.setItem('it_session',JSON.stringify(current));
  }
  function clear(){current=null;localStorage.removeItem('it_session');sessionStorage.removeItem('it_session');}
  function tokenData(response,old={}){return {...old,idToken:response.idToken||old.idToken,refreshToken:response.refreshToken||old.refreshToken,
    expiresAt:Date.now()+Math.max(120,Number(response.expiresIn||3600)-60)*1000};}
  async function refresh(){
    if(!current?.refreshToken)throw new Error('Silakan login kembali.');
    if(refreshPending)return refreshPending;
    refreshPending=(async()=>{
      ensureKey();const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(cfg.FIREBASE_WEB_API_KEY),{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refreshToken})});
      const data=await r.json();if(!r.ok){clear();throw new Error('Sesi Firebase kedaluwarsa. Silakan login kembali.');}
      persist(tokenData({idToken:data.id_token,refreshToken:data.refresh_token,expiresIn:data.expires_in},current),current.remember);
      return current.idToken;
    })();
    try{return await refreshPending;}finally{refreshPending=null;}
  }
  async function getToken(){
    if(!current)throw new Error('Silakan login kembali.');
    return Date.now()>=current.expiresAt?refresh():current.idToken;
  }
  async function postProxy(body,requiresSession=true,tokenOverride=null){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),cfg.REQUEST_TIMEOUT);
    try{
      const res=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,token:tokenOverride||await getToken(),session:requiresSession?current?.serverSession:undefined}),signal:controller.signal});
      let data;try{data=await res.json();}catch(e){throw new Error('Respons API bukan JSON. Periksa deployment Apps Script dan URL proxy.');}
      if(!res.ok||!data.success){const msg=data?.error?.message||data?.message||'Request gagal';const e=new Error(msg);e.code=data?.error?.code||'API_ERROR';throw e;}
      return data.data;
    }catch(err){if(err.name==='AbortError')throw new Error('Waktu permintaan habis, periksa koneksi dan Apps Script.');throw err;}
    finally{clearTimeout(timer);}
  }
  const pending=new Map();
  const API={
    async call(action,payload={},table=''){
      if(!current?.serverSession)throw new Error('Sesi server tidak tersedia, login kembali.');
      const dedup=['list','get','dashboard','analytics','activities','me','getSettings'];
      const key=dedup.includes(action)?JSON.stringify({action,payload,table}):null;
      if(key&&pending.has(key))return pending.get(key);
      const task=postProxy({action,payload,table});if(key)pending.set(key,task);
      try{return await task;}finally{if(key)pending.delete(key);}
    }
  };
  const Auth={
    hasSession(){return !!current?.serverSession&&!!current?.refreshToken;},
    async signup(name,email,password){
      if(password.length<8)throw new Error('Password minimal 8 karakter.');
      const result=await firebase('signUp',{email,password,returnSecureToken:true});
      try{
        const updated=await firebase('update',{idToken:result.idToken,displayName:name,returnSecureToken:true});
        try{
          // Branded Firebase action link sent by Apps Script MailApp (Finora-style).
          await postProxy({action:'sendVerificationEmail'},false,updated.idToken||result.idToken);
        }catch(err){
          throw new Error('Akun Firebase sudah dibuat, tetapi email verifikasi belum terkirim: '+err.message+'. Buka Sign In lalu pilih Kirim Ulang Verifikasi.');
        }
      }finally{clear();}
      return true;
    },
    async login(email,password,remember=false){
      const data=await firebase('signInWithPassword',{email,password,returnSecureToken:true});
      persist(tokenData(data),remember);
      try{
        const session=await postProxy({action:'startSession'},false);
        persist({...current,serverSession:session.session,serverSessionExpiresAt:session.expiresAt},remember);
        const profile=await API.call('me');return profile;
      }catch(e){clear();throw e;}
    },
    async sendVerify(email,password){
      const data=await firebase('signInWithPassword',{email,password,returnSecureToken:true});
      await postProxy({action:'sendVerificationEmail'},false,data.idToken);
      return true;
    },
    resetEmail(email){return firebase('sendOobCode',{requestType:'PASSWORD_RESET',email});},
    confirmEmail(oobCode){return firebase('update',{oobCode});},
    confirmReset(oobCode,newPassword){return firebase('resetPassword',{oobCode,newPassword});},
    inspectReset(oobCode){return firebase('resetPassword',{oobCode});},
    async changePassword(newPassword){
      const out=await firebase('update',{idToken:await getToken(),password:newPassword,returnSecureToken:true});
      persist(tokenData(out,current),current.remember);return true;
    },
    async changeEmail(newEmail,password){
      const oldEmail=(await API.call('me')).email;
      const r=await firebase('signInWithPassword',{email:oldEmail,password,returnSecureToken:true});
      const updated=await firebase('update',{idToken:r.idToken,email:newEmail,returnSecureToken:true});
      await firebase('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:updated.idToken});
      await this.logout();return true;
    },
    async logout(){
      if(current?.serverSession){try{await postProxy({action:'revokeSession'});}catch(e){console.warn('Session revoke failed:',e.message);}}
      clear();
    },
    clear, current(){return current;},firebase
  };
  window.ITAPI=API;window.ITAuth=Auth;
})();
