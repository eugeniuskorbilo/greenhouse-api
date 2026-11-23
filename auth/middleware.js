const jwt=require('jsonwebtoken');
function authenticate(req,res,next){
 const match=/^Bearer ([^ ]+)$/.exec(req.headers.authorization||'');
 if(!match)return res.status(401).set('WWW-Authenticate','Bearer').json({error:'missing_token'});
 try{req.user=jwt.verify(match[1],process.env.JWT_SECRET,{algorithms:['HS256']});next();}
 catch(e){res.status(401).set('WWW-Authenticate','Bearer error="invalid_token"').json({error:e.name==='TokenExpiredError'?'token_expired':'invalid_token'});}
}
const requireRole=(...roles)=>(req,res,next)=>req.user&&roles.includes(req.user.role)?next():res.status(403).json({error:'forbidden'});
module.exports={authenticate,requireRole};
